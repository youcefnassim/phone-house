import { beforeEach, afterEach, it, expect } from "vitest";
import { sqliteHarness } from "./sqlite-harness";
import { createNativeService } from "@/backend/sqlite/service";
let h: ReturnType<typeof sqliteHarness>;
const service = () =>
  createNativeService(
    h.port,
    { verify: async (u) => ({ userId: u, sessionId: u, expiresAt: 2000 }) },
    { get: async () => null, put: async () => {} },
    () => 1000,
  );
const send = (operation: string, payload: Record<string, unknown>, actor = "owner") =>
  service().execute(actor, {
    version: "native-2026-11-06",
    key: `batch5a-${crypto.randomUUID()}`,
    operation,
    payload: { store: "M01", ...payload },
  });
beforeEach(() => {
  h = sqliteHarness();
  h.db.exec(
    "INSERT INTO accounts VALUES('owner',1),('m2',1),('s1',1);INSERT INTO memberships VALUES('owner','GLOBAL','SUPER_ADMIN'),('m2','M02','MANAGER'),('s1','M01','SELLER');INSERT INTO sessions SELECT id,id,2000,0 FROM accounts;INSERT INTO catalog VALUES('acc','accessory','ACC','Cable','{}');INSERT INTO accessory_balances VALUES('M01','acc',10);",
  );
});
afterEach(() => h.db.close());
it("staff role.replace explicitly activates retired account without reviving old sessions", async () => {
  await send("account.provision", { userId: "new", role: "SELLER", targetStore: "M01" });
  h.db.exec("INSERT INTO sessions VALUES('old','new',2000,0)");
  await send("account.revoke", { userId: "new" });
  await send("role.replace", { userId: "new", role: "MANAGER", targetStore: "M02" });
  expect(h.db.prepare("SELECT active FROM accounts WHERE id='new'").get()?.["active"]).toBe(1);
  expect(
    h.db.prepare("SELECT role,store_id FROM memberships WHERE user_id='new'").get(),
  ).toMatchObject({ role: "MANAGER", store_id: "M02" });
  expect(h.db.prepare("SELECT revoked FROM sessions WHERE id='old'").get()?.["revoked"]).toBe(1);
});
it("native carrier is required, never stored as invented empty value", async () => {
  await expect(
    send("transfer.dispatch", { transferId: "t", evidence: "Dispatch" }),
  ).rejects.toThrow("VALIDATION");
  expect(h.db.prepare("SELECT count(*) n FROM transfer_dispatches").get()?.["n"]).toBe(0);
});
async function partial() {
  await send("transfer.create", {
    id: "t",
    destination: "M02",
    lines: [{ itemId: "acc", kind: "accessory", quantity: 4, code: "ACC" }],
  });
  await send("transfer.approve", { transferId: "t", approval: "SUPER_ADMIN" });
  await send("transfer.approve", { store: "M02", transferId: "t", approval: "M02_MANAGER" }, "m2");
  await send("transfer.scan", { transferId: "t", itemId: "acc", quantity: 4, code: "ACC" }, "s1");
  await send("transfer.dispatch", { transferId: "t", carrier: "Carrier", evidence: "Dispatch" });
  await send(
    "transfer.scan",
    { store: "M02", transferId: "t", itemId: "acc", quantity: 2, code: "ACC" },
    "m2",
  );
  await send("transfer.receive", { store: "M02", transferId: "t", evidence: "Partial" }, "m2");
}
it("owner post-partial cancellation returns only unresolved goods exactly once", async () => {
  await partial();
  await send("transfer.cancel", { transferId: "t", reason: "Return missing" });
  expect(
    h.db.prepare("SELECT quantity FROM accessory_balances WHERE store_id='M01'").get()?.[
      "quantity"
    ],
  ).toBe(8);
  expect(
    h.db.prepare("SELECT quantity FROM accessory_balances WHERE store_id='M02'").get()?.[
      "quantity"
    ],
  ).toBe(2);
  expect(
    (await service().transferDetail("owner", { store: "M01", transferId: "t" })).cancellation,
  ).toMatchObject({ actorId: "owner", reason: "Return missing" });
  await expect(send("transfer.cancel", { transferId: "t", reason: "Again" })).rejects.toThrow(
    "REJECTED",
  );
  expect(
    h.db.prepare("SELECT quantity FROM accessory_balances WHERE store_id='M01'").get()?.[
      "quantity"
    ],
  ).toBe(8);
});
it("cancellation never restores already written-off discrepancy", async () => {
  await partial();
  await send("transfer.resolve", {
    transferId: "t",
    itemId: "acc",
    outcome: "WRITE_OFF",
    reason: "Lost",
  });
  await send("transfer.cancel", { transferId: "t", reason: "Close transfer" });
  expect(
    h.db.prepare("SELECT quantity FROM accessory_balances WHERE store_id='M01'").get()?.[
      "quantity"
    ],
  ).toBe(6);
});
