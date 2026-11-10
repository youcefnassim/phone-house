import { beforeEach, afterEach, expect, it } from "vitest";
import { sqliteHarness } from "./sqlite-harness";
import { createNativeService } from "@/backend/sqlite/service";
let h: ReturnType<typeof sqliteHarness>,
  n = 0;
const svc = () =>
  createNativeService(
    h.port,
    { verify: async (userId) => ({ userId, sessionId: userId, expiresAt: 2000 }) },
    { get: async () => null, put: async () => {} },
    () => 1000,
  );
const cmd = (operation: string, payload: Record<string, unknown>) => ({
  version: "native-2026-11-06",
  key: `batch4a-command-${++n}`,
  operation,
  payload: { store: "M01", ...payload },
});
const send = (operation: string, payload: Record<string, unknown>, actor = "owner") =>
  svc().execute(actor, cmd(operation, payload));
beforeEach(() => {
  h = sqliteHarness();
  h.db.exec(
    `INSERT INTO accounts VALUES('owner',1),('s1',1),('m1',1),('m2',1),('s2',1); INSERT INTO memberships VALUES('owner','GLOBAL','SUPER_ADMIN'),('s1','M01','SELLER'),('m1','M01','MANAGER'),('m2','M02','MANAGER'),('s2','M02','SELLER'); INSERT INTO sessions SELECT id,id,2000,0 FROM accounts; INSERT INTO catalog VALUES('model','phone','MODEL','Phone','{}'),('acc','accessory','ACC','Cable','{}'); INSERT INTO phones(id,store_id,catalog_id,barcode,state,attributes_json,serial) VALUES('p1','M01','model','P1','AVAILABLE','{}','SERIAL');INSERT INTO phone_identifiers VALUES('490154203237518','p1',1); INSERT INTO accessory_balances VALUES('M01','acc',10); INSERT INTO drawers VALUES('drawer','M01');INSERT INTO shifts VALUES('shift','M01','drawer','s1','OPEN',100000,NULL); INSERT INTO suppliers(id,store_id,name,reference) VALUES('supplier','M01','Supplier','SUP'); INSERT INTO commands(key,actor_id,store_id,operation,payload_hash,state,transaction_id,response_json,created_at) VALUES('receipt-key','s1','M01','stock.standalone','hash','DONE','receipt',NULL,100); INSERT INTO standalone_receipts VALUES('receipt','receipt-key','M01','model','supplier',1,100,'s1','R');INSERT INTO standalone_phone_receipts VALUES('p1','receipt'); INSERT INTO commands(key,actor_id,store_id,operation,payload_hash,state,transaction_id,response_json,created_at) VALUES('lot-key','s1','M01','stock.standalone','hash','DONE','lot',NULL,100); INSERT INTO standalone_receipts VALUES('lot','lot-key','M01','acc','supplier',10,100,'s1','L');`,
  );
});
afterEach(() => h.db.close());
const value = (sql: string) => Object.values(h.db.prepare(sql).get() ?? {})[0];
it("later phone and receipt-lot cost increase payable without purchase orders", async () => {
  await send("supplier.cost", {
    sourceId: "receipt",
    phoneId: "p1",
    supplierId: "supplier",
    amount: "500",
  });
  await send("supplier.cost", { sourceId: "lot", supplierId: "supplier", amount: "25" });
  expect(value("SELECT balance_minor FROM supplier_payables")).toBe(52500);
  expect(value("SELECT count(*) FROM purchases")).toBe(0);
  expect(await svc().supplierPayables("owner", "M01")).toMatchObject([
    { cost_minor: 52500, paid_minor: 0, balance_minor: 52500 },
  ]);
});
it.each(["s1", "m1", "m2"])(
  "%s never reads or records cost/payable; metadata exports cost-free",
  async (actor) => {
    await send("supplier.cost", {
      sourceId: "receipt",
      phoneId: "p1",
      supplierId: "supplier",
      amount: "517.39",
    });
    await expect(svc().supplierPayables(actor, "M01")).rejects.toThrow("FORBIDDEN");
    await expect(
      send("supplier.cost", { sourceId: "lot", supplierId: "supplier", amount: "2" }, actor),
    ).rejects.toThrow("FORBIDDEN");
    const data = await svc().read(
      actor === "m2" ? "m1" : actor,
      actor === "s1" ? "inventory" : "suppliers",
      "M01",
    );
    expect(JSON.stringify(data)).not.toMatch(/51739|cost_minor|paid_minor|balance_minor/);
    const audit = await svc().read("m1", "audit", "M01");
    expect(audit.every((r) => !("payload_json" in r) && !("before_json" in r))).toBe(true);
  },
);
it("cash supplier payment is cash OUT in selected OPEN shift, bank never enters drawer", async () => {
  await send("supplier.cost", {
    sourceId: "receipt",
    phoneId: "p1",
    supplierId: "supplier",
    amount: "500",
  });
  await send("supplier.payment", {
    supplierId: "supplier",
    amount: "100",
    method: "Cash",
    shiftId: "shift",
  });
  await send("supplier.payment", {
    supplierId: "supplier",
    amount: "50",
    method: "Bank",
    bankMethod: "VIREMENT",
  });
  expect(value("SELECT balance_minor FROM supplier_payables")).toBe(35000);
  expect(h.db.prepare("SELECT amount_minor,reason FROM cash_adjustments").get()).toEqual({
    amount_minor: -10000,
    reason: "Paiement fournisseur",
  });
  await send("cash.close", { shiftId: "shift", counted: "900" }, "s1");
  expect(value("SELECT expected_minor FROM shift_closures")).toBe(90000);
  expect((await svc().cashLedger("m1", { store: "M01" })).movements).toEqual([]);
  await expect(
    send("supplier.payment", {
      supplierId: "supplier",
      amount: "1",
      method: "Cash",
      shiftId: "shift",
    }),
  ).rejects.toThrow("SHIFT_CLOSED");
});
it("cost replay is idempotent; another cost for same phone refused; original receipt immutable", async () => {
  const c = cmd("supplier.cost", {
    sourceId: "receipt",
    phoneId: "p1",
    supplierId: "supplier",
    amount: "5",
  });
  await svc().execute("owner", c);
  await svc().execute("owner", c);
  expect(value("SELECT count(*) FROM supplier_costs")).toBe(1);
  await expect(
    send("supplier.cost", {
      sourceId: "receipt",
      phoneId: "p1",
      supplierId: "supplier",
      amount: "9",
    }),
  ).rejects.toThrow("REJECTED");
  expect(() => h.db.exec("UPDATE supplier_costs SET amount_minor=1")).toThrow("APPEND_ONLY");
  expect(value("SELECT reference FROM standalone_receipts WHERE id='receipt'")).toBe("R");
});
async function dispatch() {
  await send(
    "transfer.create",
    {
      id: "t",
      destination: "M02",
      lines: [
        { itemId: "p1", kind: "phone", quantity: 1, code: "P1" },
        { itemId: "acc", kind: "accessory", quantity: 4, code: "ACC" },
      ],
    },
    "m1",
  );
  await send("transfer.approve", { transferId: "t", approval: "SUPER_ADMIN" });
  await send("transfer.approve", { store: "M02", transferId: "t", approval: "M02_MANAGER" }, "m2");
  await send("transfer.scan", { transferId: "t", itemId: "p1", quantity: 1, code: "P1" }, "s1");
  await send("transfer.scan", { transferId: "t", itemId: "acc", quantity: 4, code: "ACC" }, "s1");
  await send("transfer.dispatch", {
    transferId: "t",
    evidence: "Manifest",
    carrier: "Carrier Name",
  });
}
it("partial receipt moves arrived quantity once; missing phone is outside both available stocks", async () => {
  await dispatch();
  await send(
    "transfer.scan",
    { store: "M02", transferId: "t", itemId: "acc", quantity: 2, code: "ACC" },
    "s2",
  );
  const receive = cmd("transfer.receive", { store: "M02", transferId: "t", evidence: "Partial" });
  await svc().execute("s2", receive);
  await svc().execute("s2", receive);
  expect(value("SELECT quantity FROM accessory_balances WHERE store_id='M01'")).toBe(6);
  expect(value("SELECT quantity FROM accessory_balances WHERE store_id='M02'")).toBe(2);
  expect(value("SELECT state FROM phones WHERE id='p1'")).toBe("IN_TRANSIT");
  expect(
    h.db.prepare("SELECT item_id,quantity FROM transfer_discrepancies ORDER BY item_id").all(),
  ).toEqual([
    { item_id: "acc", quantity: 2 },
    { item_id: "p1", quantity: 1 },
  ]);
  await expect(
    send("transfer.receive", { store: "M02", transferId: "t", evidence: "Again" }, "m2"),
  ).rejects.toThrow("TRANSFER_STATE");
  expect(value("SELECT count(*) FROM stock_movements WHERE reason='TRANSFER_IN'")).toBe(1);
  expect(
    (await svc().transferDetail("s2", { store: "M02", transferId: "t" })).dispatch?.carrier,
  ).toBe("Carrier Name");
});
it("owner resolves return and reasoned write-off exactly once; staff refused", async () => {
  await dispatch();
  await send("transfer.receive", { store: "M02", transferId: "t", evidence: "Missing" }, "s2");
  await expect(
    send(
      "transfer.resolve",
      { transferId: "t", itemId: "p1", outcome: "RETURN", reason: "Found" },
      "m1",
    ),
  ).rejects.toThrow("FORBIDDEN");
  await send("transfer.resolve", {
    transferId: "t",
    itemId: "p1",
    outcome: "RETURN",
    reason: "Found",
  });
  expect(h.db.prepare("SELECT store_id,state FROM phones WHERE id='p1'").get()).toEqual({
    store_id: "M01",
    state: "AVAILABLE",
  });
  await send("transfer.resolve", {
    transferId: "t",
    itemId: "acc",
    outcome: "WRITE_OFF",
    reason: "Lost",
  });
  expect(value("SELECT quantity FROM accessory_balances WHERE store_id='M01'")).toBe(6);
  await expect(
    send("transfer.resolve", { transferId: "t", itemId: "p1", outcome: "RETURN", reason: "Again" }),
  ).rejects.toThrow("REJECTED");
});
it("damaged phone never reaches available destination; write-off requires reason", async () => {
  await dispatch();
  await send(
    "transfer.scan",
    { store: "M02", transferId: "t", itemId: "p1", quantity: 1, code: "P1", damaged: true },
    "s2",
  );
  await send("transfer.receive", { store: "M02", transferId: "t", evidence: "Damaged" }, "s2");
  expect(value("SELECT kind FROM transfer_discrepancies WHERE item_id='p1'")).toBe("DAMAGED");
  await expect(
    send("transfer.resolve", { transferId: "t", itemId: "p1", outcome: "WRITE_OFF", reason: "" }),
  ).rejects.toThrow("VALIDATION");
  await send("transfer.resolve", {
    transferId: "t",
    itemId: "p1",
    outcome: "WRITE_OFF",
    reason: "Broken",
  });
  expect(value("SELECT state FROM phones WHERE id='p1'")).toBe("RETURN_BLOCKED");
});
it("owner cancellation after dispatch returns goods once; staff and second cancellation refused", async () => {
  await dispatch();
  await expect(
    send("transfer.cancel", { transferId: "t", reason: "Return" }, "m1"),
  ).rejects.toThrow("FORBIDDEN");
  const c = cmd("transfer.cancel", { transferId: "t", reason: "Return" });
  await svc().execute("owner", c);
  await svc().execute("owner", c);
  expect(value("SELECT quantity FROM accessory_balances WHERE store_id='M01'")).toBe(10);
  expect(value("SELECT state FROM phones WHERE id='p1'")).toBe("AVAILABLE");
  await expect(send("transfer.cancel", { transferId: "t", reason: "Again" })).rejects.toThrow(
    "REJECTED",
  );
});
it.each(["s1", "m1", "owner"])(
  "%s counts blind, sees accessory differences only after submit; phone missing owner-only, state unchanged",
  async (actor) => {
    await send("count.open", { id: "count", month: "2026-11" }, actor);
    await send(
      "count.entry",
      { countId: "count", itemId: "acc", kind: "accessory", quantity: 8 },
      actor,
    );
    const before = await svc().stockCount(actor, "M01", "count");
    expect(before.rows).toEqual([{ item_id: "acc", kind: "accessory", counted: 8 }]);
    await send("count.submit", { countId: "count" }, actor);
    const after = await svc().stockCount(actor, "M01", "count");
    expect(after.rows.find((r) => r["item_id"] === "acc")).toMatchObject({
      expected: 10,
      counted: 8,
      difference: -2,
    });
    expect(after.rows.some((r) => r["kind"] === "phone")).toBe(actor === "owner");
    expect(value("SELECT state FROM phones WHERE id='p1'")).toBe("AVAILABLE");
    await expect(
      send(
        "count.entry",
        { countId: "count", itemId: "acc", kind: "accessory", quantity: 10 },
        actor,
      ),
    ).rejects.toThrow("REJECTED");
  },
);
it("reasoned staff accessory adjustment is immutable PENDING then owner OK review; cross-store refused", async () => {
  await expect(
    send("stock.adjust", { itemId: "acc", delta: -2, reason: "" }, "s1"),
  ).rejects.toThrow("VALIDATION");
  await expect(
    send("stock.adjust", { itemId: "acc", delta: -2, reason: "Count" }, "s2"),
  ).rejects.toThrow("FORBIDDEN");
  const result = (await send(
    "stock.adjust",
    { itemId: "acc", delta: -2, reason: "Count" },
    "s1",
  )) as { transactionId: string };
  expect(value("SELECT quantity FROM accessory_balances WHERE store_id='M01'")).toBe(8);
  expect(value("SELECT count(*) FROM stock_adjustment_reviews")).toBe(0);
  await expect(
    send(
      "stock.review",
      { adjustmentId: result.transactionId, outcome: "OK", note: "Checked" },
      "m1",
    ),
  ).rejects.toThrow("FORBIDDEN");
  await send("stock.review", {
    adjustmentId: result.transactionId,
    outcome: "OK",
    note: "Checked",
  });
  expect(value("SELECT outcome FROM stock_adjustment_reviews")).toBe("OK");
  expect(() => h.db.exec("UPDATE stock_adjustments SET reason='Edit'")).toThrow("APPEND_ONLY");
  await expect(
    send("stock.review", { adjustmentId: result.transactionId, outcome: "FLAGGED", note: "Again" }),
  ).rejects.toThrow("REJECTED");
});
