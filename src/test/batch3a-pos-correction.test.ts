import { beforeEach, afterEach, it, expect } from "vitest";
import { sqliteHarness } from "./sqlite-harness";
import { createNativeService } from "@/backend/sqlite/service";
import { createNativeApiHandler } from "@/backend/native-api";
import { settleSale } from "@/domain/pos-settlement";
let h: ReturnType<typeof sqliteHarness>;
const now = Date.parse("2026-11-09T12:00:00Z");
const phone = "11111111-1111-4111-8111-111111111111",
  acc = "22222222-2222-4222-8222-222222222222",
  shift = "33333333-3333-4333-8333-333333333333";
const service = () =>
  createNativeService(
    h.port,
    {
      verify: async (u) => ({
        userId: u.replace("test-token-", ""),
        sessionId: u.replace("test-token-", ""),
        expiresAt: now + 10000,
      }),
    },
    { get: async () => null, put: async () => {} },
    () => now,
  );
const sale = (patch: Record<string, unknown> = {}, key = "batch3a-sale-command") => ({
  contractVersion: "native-pos-2026-11-07",
  idempotencyKey: key,
  clientRequestId: crypto.randomUUID(),
  payload: {
    store: "M01",
    shiftId: shift,
    buyer: { surname: "Buyer", givenName: "Name" },
    lines: [
      { itemId: phone, kind: "phone", quantity: "1" },
      { itemId: acc, kind: "accessory", quantity: "2" },
    ],
    tender: "Split",
    cashAmount: "40.00",
    bankAmount: "65.00",
    bankMethod: "CCP_BARIDIMOB",
    tenderedAmount: "50.00",
    discountAmount: "5.00",
    warranties: [{ itemId: phone, requested: true, provider: "SHOP", months: 12 }],
    ...patch,
  },
});
const voidCmd = (id: string, key = "batch3a-void-command") => ({
  version: "native-2026-11-06",
  key,
  operation: "sale.void",
  payload: { store: "M01", saleId: id, reason: "Correction" },
});
const count = (t: string) => h.db.prepare(`SELECT count(*) n FROM ${t}`).get()?.["n"];
const saleId = () => String(h.db.prepare("SELECT id FROM sales").get()?.["id"]);
beforeEach(() => {
  h = sqliteHarness();
  h.db.exec(
    `INSERT INTO accounts VALUES('owner',1),('seller',1),('manager',1),('other',1);INSERT INTO memberships VALUES('owner','GLOBAL','SUPER_ADMIN'),('seller','M01','SELLER'),('manager','M01','MANAGER'),('other','M02','MANAGER');INSERT INTO sessions SELECT id,id,${now + 10000},0 FROM accounts;INSERT INTO catalog VALUES('model','phone','MODEL','Phone','{}'),('${acc}','accessory','ACC','Cable','{}');INSERT INTO prices VALUES('M01','model',10000),('M01','${acc}',500);INSERT INTO phones(id,store_id,catalog_id,barcode,state,attributes_json,serial) VALUES('${phone}','M01','model','UNIT','AVAILABLE','{}','SN');INSERT INTO accessory_balances VALUES('M01','${acc}',10);INSERT INTO drawers VALUES('d','M01');INSERT INTO shifts VALUES('${shift}','M01','d','seller','OPEN',0,NULL);INSERT INTO app_settings VALUES('pos.discountLimitDzd','"5.00"',${now});`,
  );
});
afterEach(() => h.db.close());
it("H3 split, exact DZD discount, cash-only change, and bank method are atomically recorded", async () => {
  await service().checkout("seller", sale());
  expect(h.db.prepare("SELECT total_minor,change_minor FROM sales").get()).toMatchObject({
    total_minor: 10500,
    change_minor: 1000,
  });
  expect(h.db.prepare("SELECT * FROM sale_settlements").get()).toMatchObject({
    cash_minor: 4000,
    bank_minor: 6500,
    cash_received_minor: 5000,
    bank_method: "CCP_BARIDIMOB",
    discount_minor: 500,
    discount_actor: "seller",
    discount_limit_minor: 500,
  });
  expect(h.db.prepare("SELECT amount_minor FROM cash_movements").get()?.["amount_minor"]).toBe(
    4000,
  );
  expect(
    h.db
      .prepare("SELECT debit_minor,bank_method FROM journals WHERE account='BANK_UNRECONCILED'")
      .get(),
  ).toMatchObject({ debit_minor: 6500, bank_method: "CCP_BARIDIMOB" });
  expect(h.db.prepare("SELECT sum(debit_minor-credit_minor) n FROM journals").get()?.["n"]).toBe(0);
  const payload = JSON.parse(
    String(h.db.prepare("SELECT payload_json FROM audit_events").get()?.["payload_json"]),
  );
  expect(payload.settlement).toMatchObject({
    discountMinor: 500,
    discountActor: "seller",
    discountLimitMinor: 500,
  });
  expect(payload.payload.buyer).toBeUndefined();
});
it.each(["seller", "manager"])("%s cannot exceed per-sale discount cap", async (user) => {
  await expect(
    service().checkout(user, sale({ discountAmount: "5.01", bankAmount: "64.99" })),
  ).rejects.toThrow("REJECTED");
  expect(count("sales")).toBe(0);
  expect(count("invoice_sequences")).toBe(0);
});
it("SUPER_ADMIN has no configured cap but empty settings disable all discounts", async () => {
  await service().checkout("owner", sale({ discountAmount: "10.00", bankAmount: "60.00" }));
  expect(
    h.db.prepare("SELECT discount_minor FROM sale_settlements").get()?.["discount_minor"],
  ).toBe(1000);
  h.db.exec("DELETE FROM app_settings");
  await expect(service().checkout("owner", sale({}, "another-sale-command"))).rejects.toThrow(
    "REJECTED",
  );
});
it("limit is rechecked in atomic batch, not trusted from browser", async () => {
  h.db.exec("UPDATE app_settings SET value_json='\"4.99\"'");
  await expect(service().checkout("seller", sale())).rejects.toThrow("REJECTED");
  expect(count("sales")).toBe(0);
});
it("split mismatch is rejected without partial cash, stock, or numbering", async () => {
  await expect(service().checkout("seller", sale({ bankAmount: "64.99" }))).rejects.toThrow(
    "REJECTED",
  );
  expect(count("cash_movements")).toBe(0);
  expect(count("invoice_sequences")).toBe(0);
  expect(h.db.prepare("SELECT state FROM phones").get()?.["state"]).toBe("AVAILABLE");
});
it.each(["VIREMENT", "CCP_BARIDIMOB"])(
  "FA9 no bank reference, %s bank never enters drawer",
  async (method) => {
    await service().checkout(
      "seller",
      sale({ tender: "Bank", bankMethod: method, tenderedAmount: "105.00" }),
    );
    expect(count("cash_movements")).toBe(0);
    expect(h.db.prepare("SELECT bank_reference FROM sales").get()?.["bank_reference"]).toBeNull();
    expect(
      h.db.prepare("SELECT bank_method FROM journals WHERE account='BANK_UNRECONCILED'").get()?.[
        "bank_method"
      ],
    ).toBe(method);
  },
);
it.each(["CARD", "CHEQUE"])("bank method %s refused", async (bankMethod) => {
  await expect(service().checkout("seller", sale({ bankMethod }))).rejects.toThrow("VALIDATION");
  expect(count("sales")).toBe(0);
});
it("H6 manager void restores both stocks, reverses only cash in same shift, bank separately, warranty effective VOID, snapshots unchanged", async () => {
  await service().checkout("seller", sale());
  const id = saleId();
  const before = h.db.prepare("SELECT * FROM sales").get(),
    receipt = await service().receipt("seller", id, "M01");
  await service().execute("manager", voidCmd(id));
  expect(h.db.prepare("SELECT * FROM sales").get()).toEqual(before);
  expect(await service().receipt("seller", id, "M01")).toEqual(receipt);
  expect(h.db.prepare("SELECT state FROM phones").get()?.["state"]).toBe("AVAILABLE");
  expect(h.db.prepare("SELECT quantity FROM accessory_balances").get()?.["quantity"]).toBe(10);
  expect(h.db.prepare("SELECT amount_minor FROM cash_reversals").get()?.["amount_minor"]).toBe(
    4000,
  );
  expect(h.db.prepare("SELECT amount_minor,bank_method FROM bank_reversals").get()).toMatchObject({
    amount_minor: 6500,
    bank_method: "CCP_BARIDIMOB",
  });
  expect(
    h.db.prepare("SELECT sum(amount_minor) n FROM effective_cash_movements").get()?.["n"],
  ).toBe(0);
  expect(
    h.db.prepare("SELECT effective_state FROM effective_warranty_requests").get()?.[
      "effective_state"
    ],
  ).toBe("VOID");
  expect((await service().salesHistory("manager", { store: "M01" })).sales[0]).toMatchObject({
    tender: "Split",
    voided: 1,
  });
});
it("same-key void replay restores once; new-key double void refused", async () => {
  await service().checkout("seller", sale());
  const cmd = voidCmd(saleId());
  await service().execute("owner", cmd);
  await service().execute("owner", cmd);
  await expect(
    service().execute("owner", voidCmd(saleId(), "second-void-command")),
  ).rejects.toThrow("SALE_VOIDED");
  expect(count("sale_voids")).toBe(1);
  expect(count("cash_reversals")).toBe(1);
  expect(h.db.prepare("SELECT quantity FROM accessory_balances").get()?.["quantity"]).toBe(10);
});
it.each(["seller", "other"])("%s cannot void this store sale", async (user) => {
  await service().checkout("seller", sale());
  await expect(service().execute(user, voidCmd(saleId()))).rejects.toThrow("FORBIDDEN");
  expect(count("sale_voids")).toBe(0);
});
it("void after close refuses use SAV with 409 nonretryable", async () => {
  await service().checkout("seller", sale());
  h.db.exec("UPDATE shifts SET state='CLOSED'");
  const handler = createNativeApiHandler(service(), {
    enabled: true,
    allowedOrigin: "https://erp.example",
  });
  const result = await handler(
    new Request("https://erp.example/api/native/execute", {
      method: "POST",
      headers: {
        Origin: "https://erp.example",
        Authorization: "Bearer test-token-manager",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(voidCmd(saleId())),
    }),
  );
  expect(result.status).toBe(409);
  expect(await result.json()).toMatchObject({ error: "USE_SAV", retryable: false });
  expect(count("sale_voids")).toBe(0);
});
it("voided phone may be sold again without rewriting original sold line", async () => {
  await service().checkout("seller", sale());
  await service().execute("owner", voidCmd(saleId()));
  await service().checkout("seller", sale({}, "resale-new-command"));
  expect(count("sales")).toBe(2);
  expect(count("sale_lines")).toBe(4);
  expect(h.db.prepare("SELECT state FROM phones").get()?.["state"]).toBe("SOLD");
});
it("void and subsequent close count the cash reversal", async () => {
  await service().checkout("seller", sale());
  await service().execute("manager", voidCmd(saleId()));
  await service().execute("seller", {
    version: "native-2026-11-06",
    key: "close-after-void-command",
    operation: "cash.close",
    payload: { store: "M01", shiftId: shift, counted: "0.00" },
  });
  expect(h.db.prepare("SELECT expected_minor FROM shift_closures").get()?.["expected_minor"]).toBe(
    0,
  );
});
it("late cancellation failure rolls back all restoration", async () => {
  await service().checkout("seller", sale());
  h.db.exec(
    "CREATE TRIGGER fail_void BEFORE INSERT ON warranty_voids BEGIN SELECT RAISE(ABORT,'CHECK constraint failed'); END",
  );
  await expect(service().execute("manager", voidCmd(saleId()))).rejects.toThrow("REJECTED");
  expect(count("sale_voids")).toBe(0);
  expect(count("cash_reversals")).toBe(0);
  expect(h.db.prepare("SELECT state FROM phones").get()?.["state"]).toBe("SOLD");
});
it("integer money helper rejects percent/rounding and verifies cash change", () => {
  expect(
    settleSale({
      subtotal: "100.00",
      discount: "0.01",
      limit: "1.00",
      owner: false,
      mode: "Split",
      cash: "40.00",
      bank: "59.99",
      received: "50.00",
      bankMethod: "VIREMENT",
    }),
  ).toMatchObject({ total: 9999n, change: 1000n });
  expect(() =>
    settleSale({
      subtotal: "100",
      discount: "0.001",
      limit: "1",
      owner: false,
      mode: "Cash",
      received: "100",
    }),
  ).toThrow("VALIDATION");
});
