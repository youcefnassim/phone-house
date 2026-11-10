import { beforeEach, afterEach, it, expect } from "vitest";
import { sqliteHarness } from "./sqlite-harness";
import { planNativeCommand } from "@/backend/sqlite/commands";
import { createNativeService } from "@/backend/sqlite/service";
import { planCheckout } from "@/backend/sqlite/checkout";
import type { NativeOperation } from "@/domain/native-commands";
let h: ReturnType<typeof sqliteHarness>,
  counter = 0;
beforeEach(() => {
  h = sqliteHarness();
  counter = 0;
  h.db.exec(
    `INSERT INTO accounts VALUES('owner',1),('manager',1),('m2manager',1),('seller',1);INSERT INTO memberships VALUES('owner','GLOBAL','SUPER_ADMIN'),('manager','M01','MANAGER'),('m2manager','M02','MANAGER'),('seller','M01','SELLER');INSERT INTO sessions SELECT id,id,2000,0 FROM accounts;INSERT INTO drawers VALUES('drawer','M01');`,
  );
});
afterEach(() => h.db.close());
function command(operation: NativeOperation, payload: unknown, actor = "owner", key?: string) {
  return h.run(
    planNativeCommand(
      {
        version: "native-2026-11-06",
        key: key ?? `native-command-key-${++counter}`,
        operation,
        payload,
      },
      { userId: actor, sessionId: actor, expiresAt: 2000 },
      "a".repeat(64),
      `tx-${counter}`,
      1000,
    ),
  );
}
const base = { store: "M01" as const };
it("2026-11-09 flexible roles: both managers close their store and owner operates globally", () => {
  h.db.exec("INSERT INTO drawers VALUES('drawer2','M02')");
  command(
    "cash.open",
    { store: "M02", id: "shift2", drawerId: "drawer2", opening: "10.01" },
    "m2manager",
  );
  command("cash.close", { store: "M02", shiftId: "shift2", counted: "10.01" }, "m2manager");
  expect(rows("cash_counts")[0]?.["actor_id"]).toBe("m2manager");
  command("cash.open", { ...base, id: "bad", drawerId: "drawer", opening: "0" }, "manager");
  command("cash.close", { ...base, shiftId: "bad", counted: "0" }, "manager");
  command("cash.open", { ...base, id: "owner-shift", drawerId: "drawer", opening: "0" }, "owner");
  expect(rows("shifts")).toHaveLength(3);
});
const rows = (table: string) => h.db.prepare(`SELECT * FROM ${table}`).all();
function purchase(kind = "accessory", quantity = 3) {
  command("supplier.save", {
    ...base,
    id: "supplier",
    name: "TEST supplier",
    reference: "TEST-SUP",
  });
  command("catalog.save", {
    ...base,
    id: "item",
    kind,
    sku: "TEST-SKU",
    name: "TEST item",
    attributes: {},
  });
  command(
    "purchase.save",
    {
      ...base,
      id: "purchase",
      supplierId: "supplier",
      itemId: "item",
      quantity,
      evidence: "TEST receipt",
    },
    "manager",
  );
}
it("customer/supplier/catalog/price save and edit are schema-backed and audited", () => {
  command("customer.save", { ...base, id: "customer", name: "TEST", reference: "TEST-C" });
  command("customer.save", { ...base, id: "customer", name: "TEST edited", reference: "TEST-C" });
  purchase();
  command("price.set", { ...base, itemId: "item", amount: "100.25" });
  expect(rows("prices")[0]?.["amount_minor"]).toBe(10025);
  expect(rows("customers")[0]?.["name"]).toBe("TEST edited");
  expect(rows("audit_events")).toHaveLength(6);
});
it("supplier cross-store overwrite is rejected", () => {
  command("supplier.save", { ...base, id: "s", name: "TEST", reference: "TEST-S" });
  expect(() =>
    command("supplier.save", { store: "M02", id: "s", name: "TEST changed", reference: "TEST-S" }),
  ).toThrow();
  expect(rows("suppliers")[0]?.["store_id"]).toBe("M01");
});
it("purchases remain drafts; receipt without explicit authorization is rejected", () => {
  purchase();
  expect(() =>
    command(
      "stock.receive",
      { ...base, purchaseId: "purchase", quantity: 1, evidence: "TEST receiving", phones: [] },
      "seller",
    ),
  ).toThrow();
  expect(rows("receiving")).toHaveLength(0);
  expect(rows("purchases")[0]?.["state"]).toBe("DRAFT");
});
it("authorized accessory receipt caps quantity and appends immutable stock ledger", () => {
  purchase();
  h.db.exec("UPDATE purchases SET state='AUTHORIZED'");
  command(
    "stock.receive",
    { ...base, purchaseId: "purchase", quantity: 2, evidence: "TEST receiving", phones: [] },
    "seller",
  );
  expect(rows("accessory_balances")[0]?.["quantity"]).toBe(2);
  expect(() =>
    command(
      "stock.receive",
      { ...base, purchaseId: "purchase", quantity: 2, evidence: "TEST over", phones: [] },
      "seller",
    ),
  ).toThrow();
  expect(rows("receiving")).toHaveLength(1);
  expect(() => h.db.exec("DELETE FROM stock_movements")).toThrow("APPEND_ONLY");
});
it("phone receipt rejects cross-slot IMEI globally and rolls back whole receipt", () => {
  purchase("phone", 3);
  h.db.exec("UPDATE purchases SET state='AUTHORIZED'");
  const phone = {
    id: "p1",
    imei1: "000000000000001",
    imei2: "000000000000002",
    serial: "TEST-SERIAL",
    barcode: "TEST-BAR",
    attributes: { condition: "NEW" },
  };
  command(
    "stock.receive",
    { ...base, purchaseId: "purchase", quantity: 1, evidence: "TEST", phones: [phone] },
    "seller",
  );
  expect(() =>
    command(
      "stock.receive",
      {
        ...base,
        purchaseId: "purchase",
        quantity: 1,
        evidence: "TEST",
        phones: [
          {
            ...phone,
            id: "p2",
            serial: "TEST-SERIAL2",
            barcode: "TEST-BAR2",
            imei1: "000000000000002",
            imei2: "000000000000003",
          },
        ],
      },
      "seller",
    ),
  ).toThrow();
  expect(rows("phones")).toHaveLength(1);
  expect(rows("phone_receipts")).toHaveLength(1);
  expect(rows("receiving")).toHaveLength(1);
});
it("phone serial and barcode collisions reject competing intake", () => {
  purchase("phone", 3);
  h.db.exec("UPDATE purchases SET state='AUTHORIZED'");
  const phone = {
    id: "p1",
    imei1: "000000000000001",
    serial: "TEST-SERIAL",
    barcode: "TEST-BAR",
    attributes: {},
  };
  command("stock.receive", {
    ...base,
    purchaseId: "purchase",
    quantity: 1,
    evidence: "TEST",
    phones: [phone],
  });
  for (const change of [
    { serial: "TEST-SERIAL", barcode: "TEST-BAR2" },
    { serial: "TEST-SERIAL2", barcode: "TEST-BAR" },
  ])
    expect(() =>
      command("stock.receive", {
        ...base,
        purchaseId: "purchase",
        quantity: 1,
        evidence: "TEST",
        phones: [{ ...phone, ...change, id: "p2", imei1: "000000000000009" }],
      }),
    ).toThrow();
});
it("finance changes are owner-only and nullable cost remains unknown", () => {
  purchase();
  expect(() =>
    command(
      "purchase.finance",
      { ...base, purchaseId: "purchase", cost: "1.00", obligation: "2.00" },
      "seller",
    ),
  ).toThrow();
  command("purchase.finance", { ...base, purchaseId: "purchase", cost: null, obligation: null });
  expect(rows("confidential_purchase_finance")[0]?.["cost_minor"]).toBe(null);
});
it("cash open concurrency, blind count, discrepancy and closed-shift rejection", () => {
  command("cash.open", { ...base, id: "shift", drawerId: "drawer", opening: "50.25" }, "seller");
  expect(() =>
    command("cash.open", { ...base, id: "shift2", drawerId: "drawer", opening: "0" }, "seller"),
  ).toThrow();
  command("cash.close", { ...base, shiftId: "shift", counted: "40.25" }, "seller");
  expect(rows("cash_counts")[0]).toMatchObject({
    expected_minor: 5025,
    counted_minor: 4025,
    reconciliation: "POLICY_BLOCKED",
  });
  expect(() =>
    command("cash.close", { ...base, shiftId: "shift", counted: "40.25" }, "seller"),
  ).toThrow();
});
it("cash in/out evidence cannot post under open OD policy", () => {
  command("cash.open", { ...base, id: "shift", drawerId: "drawer", opening: "50.25" }, "seller");
  command(
    "cash.evidence",
    { ...base, shiftId: "shift", direction: "OUT", amount: "10.25", reference: "TEST-EVIDENCE" },
    "manager",
  );
  expect(rows("cash_movements")).toHaveLength(0);
  expect(rows("cash_evidence")[0]?.["state"]).toBe("POLICY_BLOCKED");
});
it("transfer approvals bind distinct authenticated owner and M02 manager; bad scans fail", () => {
  command(
    "transfer.create",
    {
      ...base,
      id: "transfer",
      destination: "M02",
      lines: [{ itemId: "p", kind: "phone", quantity: 1, code: "TEST-CODE" }],
    },
    "owner",
  );
  expect(() =>
    command(
      "transfer.approve",
      { ...base, transferId: "transfer", approval: "M02_MANAGER" },
      "manager",
    ),
  ).toThrow();
  command(
    "transfer.approve",
    { ...base, transferId: "transfer", approval: "SUPER_ADMIN" },
    "owner",
  );
  command(
    "transfer.approve",
    { store: "M02", transferId: "transfer", approval: "M02_MANAGER" },
    "m2manager",
  );
  expect(rows("transfer_approvals")).toHaveLength(2);
  expect(() =>
    command(
      "transfer.scan",
      { ...base, transferId: "transfer", itemId: "p", code: "WRONG", quantity: 1 },
      "seller",
    ),
  ).toThrow();
  command(
    "transfer.scan",
    { ...base, transferId: "transfer", itemId: "p", code: "TEST-CODE", quantity: 1 },
    "seller",
  );
  expect(() =>
    command(
      "transfer.dispatch",
      { ...base, transferId: "transfer", evidence: "TEST dispatch", carrier: "Carrier" },
      "owner",
    ),
  ).toThrow();
  expect(rows("transfers")[0]?.["stage"]).toBe("APPROVALS");
  expect(rows("stock_movements")).toHaveLength(0);
});
it("explicit facility installment schedule is exact and bank evidence never cash", () => {
  command("customer.save", { ...base, id: "customer", name: "TEST", reference: "TEST-C" });
  command(
    "facility.draft",
    {
      ...base,
      id: "facility",
      customerId: "customer",
      employer: "TEST employer",
      cashPrice: "100.00",
      schedule: {
        contractPrice: "100.25",
        installments: [
          { month: "2027-01", amount: "40.25" },
          { month: "2027-02", amount: "60.00" },
        ],
      },
    },
    "owner",
  );
  expect(rows("installments").map((r) => r["amount_minor"])).toEqual([4025, 6000]);
  for (const kind of ["SALARY_DEDUCTION", "BANK_REMITTANCE"])
    command(
      "facility.evidence",
      { ...base, facilityId: "facility", kind, amount: "40.25", document: "TEST-EVIDENCE" },
      "owner",
    );
  expect(rows("facility_evidence")).toHaveLength(2);
  expect(rows("cash_movements")).toHaveLength(0);
  expect(() =>
    command("facility.draft", {
      store: "M02",
      id: "wrong",
      customerId: "customer",
      employer: "TEST",
      cashPrice: "1",
      schedule: { contractPrice: "1", installments: [{ month: "2027-01", amount: "1" }] },
    }),
  ).toThrow();
});
it("SAV must reference original sale/customer/IMEI, events append only and refund review cannot restock", () => {
  const phone = "11111111-1111-4111-8111-111111111111",
    shift = "33333333-3333-4333-8333-333333333333";
  command("customer.save", { ...base, id: "customer", name: "TEST", reference: "TEST-C" });
  h.db.exec(
    `INSERT INTO catalog VALUES('model','phone','TEST-PH','TEST','{}');INSERT INTO prices VALUES('M01','model',10025);INSERT INTO phones(id,store_id,catalog_id,barcode,state,attributes_json) VALUES('${phone}','M01','model','TEST-BAR','AVAILABLE','{}');INSERT INTO phone_identifiers VALUES('000000000000001','${phone}',1);INSERT INTO shifts VALUES('${shift}','M01','drawer','seller','OPEN',0,NULL);`,
  );
  // Checkout customer UUID contract differs from flexible local record IDs; use
  // literal SQL-backed sale provenance fixture, not a simulated posted UI.
  h.db.exec(
    `INSERT INTO commands(key,actor_id,store_id,operation,payload_hash,state,transaction_id,response_json) VALUES('fixture-sale-key','seller','M01','pos.checkout','fixture','DONE','sale','{}');INSERT INTO sales(id,command_key,store_id,shift_id,seller_id,customer_id,total_minor,tender,tendered_minor,change_minor,bank_reference) VALUES('sale','fixture-sale-key','M01','${shift}','seller','customer',10025,'Cash',10025,0,NULL);INSERT INTO sale_lines VALUES('sale','${phone}','phone',1,10025);UPDATE phones SET state='SOLD';`,
  );
  expect(() =>
    command(
      "sav.open",
      {
        ...base,
        id: "wrong",
        saleId: "sale",
        phoneId: phone,
        customerId: "customer",
        imei: "000000000000099",
        issue: "TEST issue",
      },
      "seller",
    ),
  ).toThrow();
  command(
    "sav.open",
    {
      ...base,
      id: "case",
      saleId: "sale",
      phoneId: phone,
      customerId: "customer",
      imei: "000000000000001",
      issue: "TEST issue",
    },
    "seller",
  );
  expect(() =>
    command(
      "sav.open",
      {
        ...base,
        id: "duplicate",
        saleId: "sale",
        phoneId: phone,
        customerId: "customer",
        imei: "000000000000001",
        issue: "TEST",
      },
      "seller",
    ),
  ).toThrow();
  command(
    "sav.event",
    { ...base, caseId: "case", note: "TEST inspection", evidence: "TEST-E" },
    "seller",
  );
  expect(() => h.db.exec("UPDATE service_events SET note='changed'")).toThrow("APPEND_ONLY");
  command(
    "sav.refund.review",
    { ...base, caseId: "case", amount: "100.25", evidence: "TEST review" },
    "owner",
  );
  expect(rows("phones")[0]?.["state"]).toBe("SOLD");
  command(
    "debt.draft",
    { ...base, id: "debt", saleId: "sale", customerId: "customer", amount: "100.25" },
    "manager",
  );
  command(
    "repayment.draft",
    { ...base, debtId: "debt", amount: "40.25", reference: "TEST-PAY" },
    "manager",
  );
  expect(() =>
    command(
      "repayment.draft",
      { ...base, debtId: "debt", amount: "60.01", reference: "TEST-OVER" },
      "manager",
    ),
  ).toThrow();
  expect(rows("repayments")[0]?.["state"]).toBe("DRAFT");
});
it("owner provisioning and role transitions revoke sessions; no manager escalation", () => {
  expect(() =>
    command(
      "account.provision",
      { ...base, userId: "new", role: "SELLER", targetStore: "M02" },
      "seller",
    ),
  ).toThrow();
  command("account.provision", { ...base, userId: "new", role: "SELLER", targetStore: "M01" });
  h.db.exec("INSERT INTO sessions VALUES('new','new',2000,0)");
  command("role.replace", { ...base, userId: "new", role: "SELLER", targetStore: "M01" });
  expect(h.db.prepare("SELECT revoked FROM sessions WHERE id='new'").get()?.["revoked"]).toBe(1);
  command("account.revoke", { ...base, userId: "new" });
  expect(h.db.prepare("SELECT active FROM accounts WHERE id='new'").get()?.["active"]).toBe(0);
  expect(() => command("account.revoke", { ...base, userId: "owner" })).toThrow();
});
it("revoked sessions and stale membership are checked within atomic batch", () => {
  const plan = planNativeCommand(
    {
      version: "native-2026-11-06",
      key: "native-revoked-key-0001",
      operation: "expense.draft",
      payload: { ...base, id: "expense", amount: "1.00", evidence: "TEST" },
    },
    { userId: "manager", sessionId: "manager", expiresAt: 2000 },
    "a".repeat(64),
    "tx",
    1000,
  );
  h.db.exec("UPDATE sessions SET revoked=1 WHERE id='manager'");
  expect(() => h.run(plan)).toThrow();
  expect(rows("expenses")).toHaveLength(0);
});
it("idempotency exact replay and late failure rollback include command/audit", () => {
  const payload = { ...base, id: "customer", name: "TEST", reference: "TEST-C" };
  command("customer.save", payload, "owner", "native-same-key-00001");
  command("customer.save", payload, "owner", "native-same-key-00001");
  expect(rows("customers")).toHaveLength(1);
  expect(rows("audit_events")).toHaveLength(1);
  h.db.exec(
    "CREATE TRIGGER fail_audit BEFORE INSERT ON audit_events BEGIN SELECT RAISE(ABORT,'TEST_FAIL'); END;",
  );
  expect(() =>
    command("expense.draft", { ...base, id: "expense", amount: "1", evidence: "TEST" }, "seller"),
  ).toThrow();
  expect(rows("expenses")).toHaveLength(0);
  expect(rows("commands")).toHaveLength(1);
});
it("every module read is authenticated and confidential values are owner only", async () => {
  const svc = createNativeService(
    h.port,
    {
      verify: async (name) =>
        name === "invalid" ? null : { userId: name, sessionId: name, expiresAt: 2000 },
    },
    { get: async () => null, put: async () => {} },
    () => 1000,
  );
  for (const module of [
    "inventory",
    "catalog",
    "purchases",
    "suppliers",
    "customers",
    "sales",
    "cash",
    "transfers",
    "debts",
    "facility",
    "sav",
    "expenses",
    "reports",
    "documents",
    "audit",
    "users",
    "settings",
  ] as const) {
    await expect(svc.read("invalid", module, "M01")).rejects.toThrow("UNAUTHORIZED");
    expect(await svc.read("owner", module, "M01")).toBeInstanceOf(Array);
  }
  await expect(svc.ownerFinance("manager", "M01")).rejects.toThrow("FORBIDDEN");
  await expect(svc.execute("invalid", {})).rejects.toThrow("UNAUTHORIZED");
});
it("strict private document metadata validates size/MIME/object identity and no bucket write before authorization", async () => {
  const bytes = new TextEncoder().encode("%PDF-TEST").buffer;
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
  command("document.register", {
    ...base,
    id: "doc",
    mime: "application/pdf",
    size: bytes.byteLength,
    sha256: hash,
  });
  let puts = 0;
  const svc = createNativeService(
    h.port,
    { verify: async (name) => ({ userId: name, sessionId: name, expiresAt: 2000 }) },
    {
      get: async () => null,
      put: async () => {
        puts++;
      },
    },
    () => 1000,
  );
  await expect(
    svc.uploadDocument("manager", "doc", "M01", bytes, "application/pdf"),
  ).rejects.toThrow("FORBIDDEN");
  await expect(
    svc.uploadDocument("owner", "../doc", "M01", bytes, "application/pdf"),
  ).rejects.toThrow("INVALID_DOCUMENT");
  expect(puts).toBe(0);
  expect(await svc.uploadDocument("owner", "doc", "M01", bytes, "application/pdf")).toMatchObject({
    state: "PENDING",
    posted: false,
  });
  expect(puts).toBe(1);
  expect(rows("documents")[0]?.["state"]).toBe("PENDING");
});
it("full accessory transfer dispatch, fresh destination scans and all-or-nothing receipt (2026-11-09 batch 1d: M02 seller receives)", () => {
  h.db.exec(
    "INSERT INTO accounts VALUES('m2seller',1); INSERT INTO memberships VALUES('m2seller','M02','SELLER'); INSERT INTO sessions VALUES('m2seller','m2seller',2000,0)",
  );
  purchase();
  h.db.exec("UPDATE purchases SET state='AUTHORIZED'");
  command(
    "stock.receive",
    { ...base, purchaseId: "purchase", quantity: 3, evidence: "TEST", phones: [] },
    "seller",
  );
  command(
    "transfer.create",
    {
      ...base,
      id: "transfer",
      destination: "M02",
      lines: [{ itemId: "item", kind: "accessory", quantity: 2, code: "TEST-SKU" }],
    },
    "owner",
  );
  command("transfer.approve", { ...base, transferId: "transfer", approval: "SUPER_ADMIN" });
  command(
    "transfer.approve",
    { store: "M02", transferId: "transfer", approval: "M02_MANAGER" },
    "m2manager",
  );
  expect(() =>
    command(
      "transfer.dispatch",
      { ...base, transferId: "transfer", evidence: "TEST", carrier: "Carrier" },
      "owner",
    ),
  ).toThrow();
  command(
    "transfer.scan",
    { ...base, transferId: "transfer", itemId: "item", quantity: 2, code: "TEST-SKU" },
    "seller",
  );
  command(
    "transfer.dispatch",
    { ...base, transferId: "transfer", evidence: "TEST", carrier: "Carrier" },
    "owner",
  );
  expect(rows("accessory_balances")[0]?.["quantity"]).toBe(1);
  expect(rows("transfers")[0]?.["stage"]).toBe("IN_TRANSIT");
  expect(rows("transfer_scans")).toHaveLength(0);
  command(
    "transfer.scan",
    { store: "M02", transferId: "transfer", itemId: "item", quantity: 2, code: "TEST-SKU" },
    "m2manager",
  );
  command(
    "transfer.receive",
    { store: "M02", transferId: "transfer", evidence: "TEST" },
    "m2seller",
  );
  expect(
    h.db.prepare("SELECT quantity FROM accessory_balances WHERE store_id='M02'").get()?.[
      "quantity"
    ],
  ).toBe(2);
  expect(rows("transfers")[0]?.["stage"]).toBe("COMPLETED");
  expect(() =>
    command(
      "transfer.receive",
      { store: "M02", transferId: "transfer", evidence: "TEST double" },
      "m2manager",
    ),
  ).toThrow();
  expect(rows("transfer_receipts")).toHaveLength(1);
});
it("changed approver role blocks dispatch even after signature and scans", () => {
  purchase();
  h.db.exec("UPDATE purchases SET state='AUTHORIZED'");
  command("stock.receive", {
    ...base,
    purchaseId: "purchase",
    quantity: 3,
    evidence: "TEST",
    phones: [],
  });
  command("transfer.create", {
    ...base,
    id: "transfer",
    destination: "M02",
    lines: [{ itemId: "item", kind: "accessory", quantity: 1, code: "TEST-SKU" }],
  });
  command("transfer.approve", { ...base, transferId: "transfer", approval: "SUPER_ADMIN" });
  command(
    "transfer.approve",
    { store: "M02", transferId: "transfer", approval: "M02_MANAGER" },
    "m2manager",
  );
  command("transfer.scan", {
    ...base,
    transferId: "transfer",
    itemId: "item",
    quantity: 1,
    code: "TEST-SKU",
  });
  h.db.exec("DELETE FROM memberships WHERE user_id='m2manager'");
  expect(() =>
    command("transfer.dispatch", {
      ...base,
      transferId: "transfer",
      evidence: "TEST",
      carrier: "Carrier",
    }),
  ).toThrow();
  expect(rows("accessory_balances")[0]?.["quantity"]).toBe(3);
});
it("adapter without atomic guarantees fails closed; no credential fake is accepted", async () => {
  const svc = createNativeService(
    { batch: h.port.batch, read: h.port.read },
    { verify: async () => ({ userId: "owner", sessionId: "owner", expiresAt: 2000 }) },
    { get: async () => null, put: async () => {} },
    () => 1000,
  );
  await expect(svc.execute("credential", {})).rejects.toThrow("ATOMICITY_UNAVAILABLE");
  const missing = createNativeService(
    h.port,
    { verify: async () => ({ userId: "owner", expiresAt: 2000 }) },
    { get: async () => null, put: async () => {} },
    () => 1000,
  );
  await expect(missing.execute("credential", {})).rejects.toThrow("UNAUTHORIZED");
});
