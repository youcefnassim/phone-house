import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { sqliteHarness } from "./sqlite-harness";
import { createNativeService } from "@/backend/sqlite/service";
import { createNativeRepository, TransportError } from "@/data/native-repository";
import { createDailyNativeController } from "@/data/daily-native-controller";
import { isDeterministicRejection } from "@/backend/sqlite/write-diagnostics";
import { permits } from "@/domain/permissions";
import type { AtomicSqlPort } from "@/backend/sqlite/port";
import type { NativeCheckoutRequest } from "@/domain/native-checkout";

// Owner decisions 2026-11-09 (batch 1d): transfer permissions and non-retryable rejections.
let h: ReturnType<typeof sqliteHarness>;
beforeEach(() => {
  h = sqliteHarness();
  h.db.exec(`INSERT INTO accounts VALUES('owner',1),('m1',1),('s1',1),('m2',1),('s2',1);
INSERT INTO memberships VALUES('owner','GLOBAL','SUPER_ADMIN'),('m1','M01','MANAGER'),('s1','M01','SELLER'),('m2','M02','MANAGER'),('s2','M02','SELLER');
INSERT INTO sessions SELECT id,id,2000,0 FROM accounts;
INSERT INTO catalog VALUES('model','phone','PH','Phone','{}'),('acc','accessory','ACC','Cable','{}');
INSERT INTO phones(id,store_id,catalog_id,barcode,state,attributes_json,serial) VALUES('p1','M01','model','PH-1','AVAILABLE','{}','SN1');
INSERT INTO phone_identifiers VALUES('490154203237518','p1',1);
INSERT INTO accessory_balances VALUES('M01','acc',5);
INSERT INTO drawers VALUES('d1','M01');
INSERT INTO shifts VALUES('sh1','M01','d1','s1','CLOSED',0,0);`);
});
afterEach(() => h.db.close());
const service = (port: AtomicSqlPort = h.port) =>
  createNativeService(
    port,
    { verify: async (user) => ({ userId: user, sessionId: user, expiresAt: 2000 }) },
    { get: async () => null, put: async () => {} },
    () => 1000,
  );
let n = 0;
const cmd = (operation: string, payload: unknown) => ({
  version: "native-2026-11-06",
  key: `batch1d-key-${String(++n).padStart(6, "0")}`,
  operation,
  payload,
});
const lines = [
  { itemId: "p1", kind: "phone", quantity: 1, code: "PH-1" },
  { itemId: "acc", kind: "accessory", quantity: 2, code: "ACC" },
];
const create = (actor = "m1", store = "M01") =>
  service().execute(actor, cmd("transfer.create", { store, id: "t1", destination: "M02", lines }));
const scan = (actor: string, store: string) =>
  Promise.all(
    lines.map((l) =>
      service().execute(
        actor,
        cmd("transfer.scan", {
          store,
          transferId: "t1",
          itemId: l.itemId,
          code: l.code,
          quantity: l.quantity,
        }),
      ),
    ),
  );
const approve = async () => {
  await service().execute(
    "owner",
    cmd("transfer.approve", { store: "M01", transferId: "t1", approval: "SUPER_ADMIN" }),
  );
  await service().execute(
    "m2",
    cmd("transfer.approve", { store: "M02", transferId: "t1", approval: "M02_MANAGER" }),
  );
};
const dispatch = (actor = "owner") =>
  service().execute(
    actor,
    cmd("transfer.dispatch", {
      store: "M01",
      transferId: "t1",
      evidence: "manifest",
      carrier: "Carrier",
    }),
  );
const receive = (actor = "s2", store = "M02") =>
  service().execute(
    actor,
    cmd("transfer.receive", { store, transferId: "t1", evidence: "received" }),
  );
const count = (sql: string) => Number(Object.values(h.db.prepare(sql).get() ?? {})[0]);

it("matrix: create MANAGER of source + owner; dispatch owner only; receive destination staff + owner", () => {
  expect(permits("MANAGER", "M01", "M01", "transfer.create")).toBe(true);
  expect(permits("SELLER", "M01", "M01", "transfer.create")).toBe(false);
  expect(permits("SUPER_ADMIN", "GLOBAL", "M01", "transfer.create")).toBe(true);
  expect(permits("MANAGER", "M01", "M01", "transfer.dispatch")).toBe(false);
  expect(permits("SELLER", "M01", "M01", "transfer.dispatch")).toBe(false);
  expect(permits("SUPER_ADMIN", "GLOBAL", "M01", "transfer.dispatch")).toBe(true);
  expect(permits("SELLER", "M02", "M02", "transfer.receive")).toBe(true);
  expect(permits("MANAGER", "M02", "M02", "transfer.receive")).toBe(true);
  expect(permits("SELLER", "M01", "M02", "transfer.receive")).toBe(false);
  expect(permits("SELLER", "M01", "M01", "transfer.scan")).toBe(true);
});

it("full lifecycle: owner + M02 manager approve, staff scan, owner dispatches, M02 seller receives; stock moves once", async () => {
  await expect(create("s1")).rejects.toThrow("FORBIDDEN");
  await create("m1");
  await approve();
  await scan("s1", "M01");
  await expect(dispatch("m1")).rejects.toThrow("FORBIDDEN");
  await dispatch("owner");
  expect(h.db.prepare("SELECT state FROM phones WHERE id='p1'").get()).toMatchObject({
    state: "IN_TRANSIT",
  });
  await scan("s2", "M02");
  await expect(receive("s1", "M02")).rejects.toThrow("FORBIDDEN");
  await receive("s2");
  expect(h.db.prepare("SELECT store_id,state FROM phones WHERE id='p1'").get()).toMatchObject({
    store_id: "M02",
    state: "AVAILABLE",
  });
  expect(count("SELECT quantity FROM accessory_balances WHERE store_id='M01'")).toBe(3);
  expect(count("SELECT quantity FROM accessory_balances WHERE store_id='M02'")).toBe(2);
  expect(count("SELECT count(*) FROM stock_movements WHERE reason='TRANSFER_OUT'")).toBe(2);
  expect(count("SELECT count(*) FROM stock_movements WHERE reason='TRANSFER_IN'")).toBe(2);
  await expect(receive("m2")).rejects.toThrow("TRANSFER_STATE");
  expect(count("SELECT count(*) FROM stock_movements WHERE reason='TRANSFER_IN'")).toBe(2);
});

it("dispatcher receiving and same approver twice are SAME_PERSON 409", async () => {
  h.db.exec("INSERT INTO memberships VALUES('owner','M02','MANAGER')");
  await create("owner");
  await service().execute(
    "owner",
    cmd("transfer.approve", { store: "M01", transferId: "t1", approval: "SUPER_ADMIN" }),
  );
  await expect(
    service().execute(
      "owner",
      cmd("transfer.approve", { store: "M02", transferId: "t1", approval: "M02_MANAGER" }),
    ),
  ).rejects.toThrow("SAME_PERSON");
  h.db.exec("DELETE FROM memberships WHERE user_id='owner' AND store_id='M02'");
  await service().execute(
    "m2",
    cmd("transfer.approve", { store: "M02", transferId: "t1", approval: "M02_MANAGER" }),
  );
  await expect(dispatch()).rejects.toThrow("TRANSFER_STATE"); // source scans missing
  await scan("s1", "M01");
  await dispatch();
  await scan("s2", "M02");
  await expect(receive("owner")).rejects.toThrow("SAME_PERSON");
});

it("cash.close and cash.evidence on a non-open shift are SHIFT_CLOSED, never NOT_RECORDED", async () => {
  await expect(
    service().execute("s1", cmd("cash.close", { store: "M01", shiftId: "sh1", counted: "0.00" })),
  ).rejects.toThrow("SHIFT_CLOSED");
  await expect(
    service().execute(
      "m1",
      cmd("cash.evidence", {
        store: "M01",
        shiftId: "sh1",
        direction: "IN",
        amount: "1.00",
        reference: "REF-1",
      }),
    ),
  ).rejects.toThrow("SHIFT_CLOSED");
});

it("unexplained constraint failure is REJECTED (not retryable); network failure is NOT_RECORDED", async () => {
  // Constraint guard failure (duplicate customer id via UNIQUE) that diagnostics cannot attribute.
  h.db.exec("INSERT INTO customers VALUES('cu1','M02','Other','REF-X')");
  await expect(
    service().execute(
      "s1",
      cmd("customer.save", { store: "M01", id: "cu1", name: "Buyer", reference: "REF" }),
    ),
  ).rejects.toThrow("REJECTED");
  const batch = vi.fn(async () => {
    throw new Error("network connection lost");
  });
  await expect(
    service({ ...h.port, batch }).execute(
      "s1",
      cmd("customer.save", { store: "M01", id: "cu9", name: "Buyer", reference: "REF" }),
    ),
  ).rejects.toThrow("NOT_RECORDED");
  expect(batch).toHaveBeenCalledTimes(1);
  expect(isDeterministicRejection(new Error("CHECK constraint failed: ok=1"))).toBe(true);
  expect(isDeterministicRejection(new Error("D1_ERROR: APPEND_ONLY: SQLITE_CONSTRAINT"))).toBe(
    true,
  );
  expect(isDeterministicRejection(new Error("timeout"))).toBe(false);
});

const sale = (): NativeCheckoutRequest => ({
  contractVersion: "native-pos-2026-11-07",
  idempotencyKey: "batch1d-cancel-key-0001",
  clientRequestId: "44444444-4444-4444-8444-444444444444",
  payload: {
    store: "M01",
    shiftId: "33333333-3333-4333-8333-333333333333",
    buyer: { surname: "New", givenName: "Buyer", contact: "" },
    lines: [{ itemId: "11111111-1111-4111-8111-111111111111", kind: "phone", quantity: "1" }],
    warranties: [{ itemId: "11111111-1111-4111-8111-111111111111", requested: false }],
    tender: "Cash",
    tenderedAmount: "1.00",
  },
});
it.each(["NOT_RECORDED", "REJECTED"])(
  "Cancel discards a %s pending transaction and unlocks the screen",
  async (code) => {
    const checkout = vi.fn(async () => {
      throw new TransportError(code);
    });
    const controller = createDailyNativeController(
      createNativeRepository({
        status: async () => ({ connected: true, verified: true }),
        read: async () => null,
        execute: async () => null,
        checkout,
        outcome: vi.fn(),
      }),
      "M01",
    );
    await expect(controller.checkout(sale())).rejects.toThrow(code);
    expect(controller.getSnapshot().state).toBe(code === "NOT_RECORDED" ? "NOT_RECORDED" : "ERROR");
    controller.cancel();
    expect(controller.getSnapshot()).toEqual({ state: "IDLE" });
    await expect(controller.retryNotRecorded()).rejects.toThrow("NO_RETRYABLE_COMMAND");
    // Unlocked: a new transaction can start.
    await expect(
      controller.checkout({ ...sale(), idempotencyKey: "batch1d-cancel-key-0002" }),
    ).rejects.toThrow(code);
    expect(checkout).toHaveBeenCalledTimes(2);
  },
);
