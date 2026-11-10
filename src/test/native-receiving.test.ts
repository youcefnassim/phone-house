import { it, expect, beforeEach, afterEach } from "vitest";
import { sqliteHarness } from "./sqlite-harness";
import { planStandaloneReceiving } from "@/backend/sqlite/standalone-receiving";
let h: ReturnType<typeof sqliteHarness>;
const identity = { userId: "s", sessionId: "s", expiresAt: 5000 };
const payload = {
  key: "standalone-key-000001",
  store: "M01",
  itemId: "a",
  quantity: 2,
  supplierId: "A",
  phones: [],
};
const run = (v: unknown = payload, i = identity, tx = "receipt") =>
  h.run(planStandaloneReceiving(v, i, "a".repeat(64), tx, 1000));
beforeEach(() => {
  h = sqliteHarness();
  h.db.exec(
    "INSERT INTO accounts VALUES('s',1),('m',1);INSERT INTO memberships VALUES('s','M01','SELLER'),('m','M02','MANAGER');INSERT INTO sessions SELECT id,id,5000,0 FROM accounts;INSERT INTO suppliers(id,store_id,name,reference) VALUES('A','M01','Supplier A','A'),('B','M01','Supplier B','B'),('C','M02','Supplier C','C');INSERT INTO catalog VALUES('a','accessory','CODE-A','Accessory','{}'),('p','phone','CODE-P','Phone','{}');",
  );
});
afterEach(() => h.db.close());
it("same accessory SKU retains two supplier receipts and idempotent quantity", () => {
  run();
  run();
  run(
    { ...payload, key: "standalone-key-000002", supplierId: "B", quantity: 3 },
    identity,
    "receipt2",
  );
  expect(
    h.db.prepare("SELECT supplier_id,quantity FROM standalone_receipts ORDER BY id").all(),
  ).toEqual([
    { supplier_id: "A", quantity: 2 },
    { supplier_id: "B", quantity: 3 },
  ]);
  expect(h.db.prepare("SELECT quantity FROM accessory_balances").get()?.["quantity"]).toBe(5);
  expect(h.db.prepare("SELECT count(*) n FROM purchases").get()?.["n"]).toBe(0);
});
it("cross-store supplier and actor reject without any receipt or stock", () => {
  expect(() => run({ ...payload, supplierId: "C" })).toThrow();
  expect(() => run(payload, { ...identity, userId: "m", sessionId: "m" })).toThrow();
  expect(h.db.prepare("SELECT count(*) n FROM standalone_receipts").get()?.["n"]).toBe(0);
});
it("optional unknown source and quick-add name do not invent finance", () => {
  run({ ...payload, supplierId: undefined, newSupplierName: "New supplier" });
  expect(
    h.db.prepare("SELECT name FROM suppliers WHERE id LIKE ?").get("supplier-%")?.["name"],
  ).toBe("New supplier");
  run({ ...payload, key: "standalone-key-000002", supplierId: undefined }, identity, "receipt2");
  expect(
    h.db.prepare("SELECT supplier_id FROM standalone_receipts WHERE id='receipt2'").get()?.[
      "supplier_id"
    ],
  ).toBeNull();
  expect(h.db.prepare("SELECT count(*) n FROM confidential_purchase_finance").get()?.["n"]).toBe(0);
});
it("serial-only phone and valid IMEI unit preserve optional supplier and packaging UNKNOWN", () => {
  run({
    ...payload,
    itemId: "p",
    quantity: 1,
    phones: [{ id: "phone", serial: "SERIAL", barcode: "UNIT" }],
  });
  expect(h.db.prepare("SELECT attributes_json FROM phones").get()?.["attributes_json"]).toBe(
    '{"packaging":"UNKNOWN"}',
  );
  expect(h.db.prepare("SELECT phone_id,receipt_id FROM standalone_phone_receipts").get()).toEqual({
    phone_id: "phone",
    receipt_id: "receipt",
  });
  expect(() =>
    run(
      {
        ...payload,
        key: "standalone-key-000002",
        itemId: "p",
        quantity: 1,
        phones: [{ id: "phone2", imei1: "490154203237519", barcode: "UNIT2" }],
      },
      identity,
      "receipt2",
    ),
  ).toThrow();
});
