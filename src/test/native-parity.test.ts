import { beforeEach, afterEach, it, expect } from "vitest";
import { sqliteHarness } from "./sqlite-harness";
import { planRetailCheckout } from "@/backend/sqlite/retail-checkout";
import { planNativeCommand } from "@/backend/sqlite/commands";
import { createNativeService } from "@/backend/sqlite/service";
import worker from "@/backend/worker";
let h: ReturnType<typeof sqliteHarness>;
export const parityPhone = "11111111-1111-4111-8111-111111111111",
  parityAccessory = "22222222-2222-4222-8222-222222222222",
  parityShift = "33333333-3333-4333-8333-333333333333";
export const paritySeed = `INSERT INTO accounts VALUES('owner',1),('s1',1),('s2',1),('m2',1),('oldm1',1),('olds2',1);INSERT INTO memberships VALUES('owner','GLOBAL','SUPER_ADMIN'),('s1','M01','SELLER'),('s2','M01','SELLER'),('m2','M02','MANAGER'),('oldm1','M01','MANAGER'),('olds2','M02','SELLER');INSERT INTO sessions SELECT id,id,9999999999999,0 FROM accounts;INSERT INTO drawers VALUES('d1','M01'),('d2','M02');INSERT INTO shifts VALUES('${parityShift}','M01','d1','s1','OPEN',1000,NULL);INSERT INTO catalog VALUES('model','phone','PH','Phone','{}'),('${parityAccessory}','accessory','AC','Accessory','{}');INSERT INTO prices VALUES('M01','model',10001),('M01','${parityAccessory}',101);INSERT INTO phones(id,store_id,catalog_id,barcode,state,attributes_json,serial) VALUES('${parityPhone}','M01','model','BAR','AVAILABLE','{}','SERIAL');INSERT INTO phone_identifiers VALUES('490154203237518','${parityPhone}',1);INSERT INTO accessory_balances VALUES('M01','${parityAccessory}',3);`;
export function parityRequest() {
  return {
    contractVersion: "native-pos-2026-11-07",
    idempotencyKey: "native-parity-key-0001",
    clientRequestId: "44444444-4444-4444-8444-444444444444",
    payload: {
      store: "M01",
      shiftId: parityShift,
      buyer: { surname: "Synthetic", givenName: "Buyer", contact: "" },
      lines: [{ itemId: parityPhone, kind: "phone", quantity: "1" }],
      warranties: [{ itemId: parityPhone, requested: true, months: 3 }],
      tender: "Cash",
      tenderedAmount: "100.01",
    },
  };
}
const at = Date.parse("2026-01-30T23:30:00Z"),
  identity = { userId: "s1", sessionId: "s1", expiresAt: 9999999999999 };
const count = (table: string) =>
  Number(h.db.prepare(`SELECT count(*) n FROM ${table}`).get()?.["n"]);
const execute = (e: unknown = parityRequest(), actor = identity, tx = "sale") =>
  h.run(planRetailCheckout(e, actor, "a".repeat(64), tx, at));
const command = (
  op: string,
  payload: unknown,
  actor = "s1",
  key = `native-${crypto.randomUUID()}`,
) =>
  h.run(
    planNativeCommand(
      { version: "native-2026-11-06", key, operation: op, payload },
      { ...identity, userId: actor, sessionId: actor },
      "b".repeat(64),
      crypto.randomUUID(),
      at,
    ),
  );
beforeEach(() => {
  h = sqliteHarness();
  h.db.exec(paritySeed);
});
afterEach(() => h.db.close());
it("commits buyer + phone + draft 3 months + detailed immutable receipt + exact cash together", () => {
  execute();
  expect(count("customers")).toBe(1);
  expect(count("customer_details")).toBe(1);
  expect(count("cash_movements")).toBe(1);
  expect(h.db.prepare("SELECT * FROM warranty_requests").get()).toMatchObject({
    requested: 1,
    months: 3,
    start_date: "2026-01-31",
    end_date: "2026-04-30",
    state: "DRAFT_PENDING",
  });
  const snapshot = JSON.parse(
    String(h.db.prepare("SELECT snapshot_json FROM receipt_snapshots").get()?.["snapshot_json"]),
  );
  expect(snapshot.lines[0]).toMatchObject({
    imei1: "490154203237518",
    serial: "SERIAL",
    unitMinor: 10001,
  });
  expect(snapshot).toMatchObject({ specimen: 1, operator: "s1", totalMinor: 10001 });
  expect(JSON.stringify(snapshot)).not.toMatch(/cost|margin/);
  expect(() => h.db.exec("UPDATE receipt_snapshots SET sold_at=0")).toThrow("APPEND_ONLY");
  expect(() => h.db.exec("DELETE FROM warranty_requests")).toThrow("APPEND_ONLY");
});
it.each([1, 3, 6, 12])("persists explicitly selected %i months only", (months) => {
  const e = parityRequest();
  e.payload.warranties[0] = { itemId: parityPhone, requested: true, months };
  execute(e);
  expect(h.db.prepare("SELECT months FROM warranty_requests").get()?.["months"]).toBe(months);
});
it("NO has no dates/months, never certificate entitlement", () => {
  const e = parityRequest();
  execute({
    ...e,
    payload: { ...e.payload, warranties: [{ itemId: parityPhone, requested: false }] },
  });
  expect(h.db.prepare("SELECT requested,months,start_date FROM warranty_requests").get()).toEqual({
    requested: 0,
    months: null,
    start_date: null,
  });
});
it("failed late receipt insert rolls back new buyer and every sale write", () => {
  h.db.exec(
    "CREATE TRIGGER fail_receipt BEFORE INSERT ON receipt_snapshots BEGIN SELECT RAISE(ABORT,'TEST_FAILURE'); END;",
  );
  expect(() => execute()).toThrow();
  for (const t of [
    "customers",
    "customer_details",
    "sales",
    "sale_lines",
    "warranty_requests",
    "cash_movements",
    "commands",
    "journals",
  ])
    expect(count(t)).toBe(0);
  expect(h.db.prepare("SELECT state FROM phones").get()?.["state"]).toBe("AVAILABLE");
});
it("matching normalized new buyer creates two separate customers", () => {
  execute();
  h.db.exec(
    `INSERT INTO phones(id,store_id,catalog_id,barcode,state,attributes_json) VALUES('55555555-5555-4555-8555-555555555555','M01','model','BAR2','AVAILABLE','{}');INSERT INTO phone_identifiers VALUES('490154203237526','55555555-5555-4555-8555-555555555555',1);`,
  );
  const e = parityRequest();
  e.idempotencyKey = "native-parity-key-0002";
  e.payload.buyer.surname = "SYNTHETIC";
  e.payload.lines = [
    { itemId: "55555555-5555-4555-8555-555555555555", kind: "phone", quantity: "1" },
  ];
  e.payload.warranties = [
    { itemId: "55555555-5555-4555-8555-555555555555", requested: true, months: 3 },
  ];
  execute(e, identity, "sale2");
  expect(count("customers")).toBe(2);
  expect(count("sales")).toBe(2);
});
it("same key replays exactly once and changed hash or actor cannot reuse it", () => {
  execute();
  execute(parityRequest(), identity, "sale2");
  expect(count("customers")).toBe(1);
  expect(count("receipt_snapshots")).toBe(1);
  expect(() =>
    h.run(planRetailCheckout(parityRequest(), identity, "c".repeat(64), "sale3", at)),
  ).toThrow();
  expect(() =>
    execute(parityRequest(), { ...identity, userId: "s2", sessionId: "s2" }, "sale4"),
  ).toThrow();
  expect(count("sales")).toBe(1);
});
it("explicit existing customerId reuses the selected native customer", () => {
  const customerId = "66666666-6666-4666-8666-666666666666";
  h.db
    .prepare("INSERT INTO customers VALUES(?,?,?,?)")
    .run(customerId, "M01", "Synthetic Buyer", "EXISTING");
  h.db
    .prepare("INSERT INTO customer_details VALUES(?,?,?,?,?,?,?)")
    .run(customerId, "M01", "Synthetic", "Buyer", "", "synthetic buyer", "");
  const request = parityRequest();
  execute({ ...request, payload: { ...request.payload, customerId } });
  expect(count("customers")).toBe(1);
  expect(count("customer_details")).toBe(1);
  expect(h.db.prepare("SELECT customer_id FROM sales").get()?.["customer_id"]).toBe(customerId);
  const receipt = JSON.parse(
    String(h.db.prepare("SELECT snapshot_json FROM receipt_snapshots").get()?.["snapshot_json"]),
  );
  expect(receipt.customerId).toBe(customerId);
  expect(receipt.buyer).toMatchObject({ surname: "Synthetic", givenName: "Buyer", contact: "" });
});
it.each(["Cash", "Bank"])(
  "anonymous accessory %s creates no customer/warranty and bank no cash",
  (tender) => {
    const e = parityRequest();
    execute({
      ...e,
      payload: {
        store: "M01",
        shiftId: parityShift,
        lines: [{ itemId: parityAccessory, kind: "accessory", quantity: "2" }],
        warranties: [],
        tender,
        tenderedAmount: "2.02",
        bankReference: tender === "Bank" ? "EVIDENCE" : undefined,
      },
    });
    expect(count("customers")).toBe(0);
    expect(count("warranty_requests")).toBe(0);
    expect(count("cash_movements")).toBe(tender === "Cash" ? 1 : 0);
    expect(h.db.prepare("SELECT quantity FROM accessory_balances").get()?.["quantity"]).toBe(1);
  },
);
it.each(["oldm1", "olds2"])(
  "2026-11-09 flexible role %s has a verified session and operates only its store",
  async (actor) => {
    if (actor === "oldm1")
      execute(parityRequest(), { ...identity, userId: actor, sessionId: actor });
    else
      expect(() =>
        execute(parityRequest(), { ...identity, userId: actor, sessionId: actor }),
      ).toThrow();
    const s = createNativeService(
      h.port,
      { verify: async () => ({ ...identity, userId: actor, sessionId: actor }) },
      { get: async () => null, put: async () => {} },
      () => at,
    );
    expect((await s.session("token")).memberships).toHaveLength(1);
    if (actor === "oldm1")
      expect((await s.read("token", "inventory", "M01")).length).toBeGreaterThan(0);
    else await expect(s.read("token", "inventory", "M01")).rejects.toThrow("FORBIDDEN");
  },
);
it("two M01 sellers share drawer; close race and owner review preserve snapshot", () => {
  execute(parityRequest(), { ...identity, userId: "s2", sessionId: "s2" });
  command("cash.close", { store: "M01", shiftId: parityShift, counted: "110.00" }, "s1");
  const before = h.db.prepare("SELECT * FROM shift_closures").get();
  expect(before).toMatchObject({
    actor_id: "s1",
    expected_minor: 11001,
    counted_minor: 11000,
    review_state: "PENDING",
  });
  expect(() =>
    command("cash.close", { store: "M01", shiftId: parityShift, counted: "1" }, "s2"),
  ).toThrow();
  expect(() =>
    command(
      "cash.review",
      { store: "M01", shiftId: parityShift, outcome: "FLAGGED", note: "Count differs" },
      "s2",
    ),
  ).toThrow();
  command(
    "cash.review",
    { store: "M01", shiftId: parityShift, outcome: "FLAGGED", note: "Count differs" },
    "owner",
  );
  expect(h.db.prepare("SELECT * FROM shift_closures").get()).toEqual(before);
  expect(() => h.db.exec("UPDATE shifts SET state='OPEN'")).toThrow("IMMUTABLE_CLOSE");
});
it("owner session revoke denies later commands without disabling historical actor", () => {
  command("session.revoke", { store: "M01", sessionId: "s2" }, "owner");
  expect(() => execute(parityRequest(), { ...identity, userId: "s2", sessionId: "s2" })).toThrow();
  expect(h.db.prepare("SELECT active FROM accounts WHERE id='s2'").get()?.["active"]).toBe(1);
});
it("M02 manager directly closes own fresh shift, seller cross-store denied", () => {
  command("cash.open", { store: "M02", id: "m2shift", drawerId: "d2", opening: "20" }, "m2");
  expect(() =>
    command("cash.close", { store: "M02", shiftId: "m2shift", counted: "20" }, "s1"),
  ).toThrow();
  command("cash.close", { store: "M02", shiftId: "m2shift", counted: "20" }, "m2");
  expect(
    h.db.prepare("SELECT review_state FROM shift_closures WHERE shift_id='m2shift'").get()?.[
      "review_state"
    ],
  ).toBe("OPTIONAL");
});
it("missing buyer/choice, invalid months and unpriced accessory abort", () => {
  const e = parityRequest();
  for (const payload of [
    { ...e.payload, buyer: undefined },
    { ...e.payload, warranties: [] },
    { ...e.payload, warranties: [{ itemId: parityPhone, requested: true, months: 2 }] },
  ])
    expect(() => execute({ ...e, payload })).toThrow();
  h.db.exec(`DELETE FROM prices WHERE item_id='${parityAccessory}'`);
  expect(() =>
    execute({
      ...e,
      payload: {
        ...e.payload,
        lines: [...e.payload.lines, { itemId: parityAccessory, kind: "accessory", quantity: "1" }],
      },
    }),
  ).toThrow();
  expect(count("customers")).toBe(0);
});
it("unconfigured standalone Worker does not construct service or accept fake login", async () => {
  const r = await worker.fetch(new Request("https://not-configured.invalid/api/native/status"), {});
  expect(r.status).toBe(503);
  expect(await r.json()).toMatchObject({ error: "NOT_CONFIGURED" });
});
