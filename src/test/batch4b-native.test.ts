import { beforeEach, afterEach, it, expect } from "vitest";
import { sqliteHarness } from "./sqlite-harness";
import { createNativeService } from "@/backend/sqlite/service";
import { salesByDay, daysSinceSale, zakatTotals } from "@/domain/batch4b";
import { permits } from "@/domain/permissions";
let h: ReturnType<typeof sqliteHarness>,
  n = 0;
const now = Date.parse("2026-11-09T12:00:00Z");
const unit = "11111111-1111-4111-8111-111111111111",
  replacement = "22222222-2222-4222-8222-222222222222",
  shift = "33333333-3333-4333-8333-333333333333";
const svc = () =>
  createNativeService(
    h.port,
    { verify: async (u) => ({ userId: u, sessionId: u, expiresAt: now + 100000 }) },
    { get: async () => null, put: async () => {} },
    () => now,
  );
const command = (operation: string, payload: Record<string, unknown>) => ({
  version: "native-2026-11-06",
  key: `batch4b-command-${++n}`,
  operation,
  payload: { store: "M01", ...payload },
});
const send = (op: string, payload: Record<string, unknown>, actor = "owner") =>
  svc().execute(actor, command(op, payload));
const count = (table: string) => h.db.prepare(`SELECT count(*) n FROM ${table}`).get()?.["n"];
const checkout = (phone = unit, amount = "100.00", patch: Record<string, unknown> = {}) => ({
  contractVersion: "native-pos-2026-11-07",
  idempotencyKey: `batch4b-checkout-${++n}`,
  clientRequestId: crypto.randomUUID(),
  payload: {
    store: "M01",
    shiftId: shift,
    buyer: { surname: "Buyer", givenName: "Name", contact: "0555555555" },
    lines: [{ kind: "phone", itemId: phone, quantity: "1" }],
    tender: "Cash",
    tenderedAmount: amount,
    warranties: [{ itemId: phone, requested: true, provider: "MANUFACTURER", months: 12 }],
    ...patch,
  },
});
async function open() {
  await svc().checkout("seller", checkout());
  const sale = h.db.prepare("SELECT id,customer_id FROM sales").get();
  await send("sav.open", {
    id: "case",
    saleId: String(sale?.["id"]),
    phoneId: unit,
    customerId: String(sale?.["customer_id"]),
    imei: "490154203237518",
    issue: "Screen",
  });
  return sale;
}
beforeEach(() => {
  h = sqliteHarness();
  h.db.exec(
    `INSERT INTO accounts VALUES('owner',1),('seller',1),('manager',1),('m2',1),('s2',1);INSERT INTO memberships VALUES('owner','GLOBAL','SUPER_ADMIN'),('seller','M01','SELLER'),('manager','M01','MANAGER'),('m2','M02','MANAGER'),('s2','M02','SELLER');INSERT INTO sessions SELECT id,id,${now + 100000},0 FROM accounts;INSERT INTO catalog VALUES('model','phone','MODEL','Phone','{"condition":"USED"}');INSERT INTO prices VALUES('M01','model',10000),('M02','model',10000);INSERT INTO phones(id,store_id,catalog_id,barcode,state,attributes_json,serial) VALUES('${unit}','M01','model','UNIT','AVAILABLE','{}','SN'),('${replacement}','M01','model','REPLACEMENT','AVAILABLE','{}','SN2');INSERT INTO phone_identifiers VALUES('490154203237518','${unit}',1);INSERT INTO drawers VALUES('d','M01'),('d2','M02');INSERT INTO shifts VALUES('${shift}','M01','d','seller','OPEN',100000,NULL),('shift2','M02','d2','m2','OPEN',100000,NULL);`,
  );
});
afterEach(() => h.db.close());
it("SAV links sale, phone, buyer and has elapsed days without deadline", async () => {
  await open();
  const data = await svc().savCases("seller", { store: "M01" });
  expect(data.cases[0]).toMatchObject({
    phoneId: unit,
    daysSinceSale: 0,
    warrantyProvider: "MANUFACTURER",
    customerName: "Buyer Name",
  });
  await expect(
    send("sav.open", {
      id: "wrong",
      saleId: data.cases[0]?.saleId,
      phoneId: replacement,
      customerId: data.cases[0]?.customerId,
      imei: "490154203237518",
      issue: "wrong",
    }),
  ).rejects.toThrow();
});
it("manufacturer returned requires sent, repair need has no price and remains tracked", async () => {
  await open();
  await expect(
    send("sav.track", { caseId: "case", status: "RETURNED", note: "Back" }),
  ).rejects.toThrow("REJECTED");
  await send(
    "sav.track",
    { caseId: "case", status: "SENT_DISTRIBUTOR", note: "Sent", paidRepairNeeded: true },
    "seller",
  );
  await send("sav.track", { caseId: "case", status: "RETURNED", note: "Back" }, "seller");
  expect(
    h.db.prepare("SELECT paid_repair_needed FROM sav_tracking ORDER BY rowid").get()?.[
      "paid_repair_needed"
    ],
  ).toBe(1);
  expect(count("sav_tracking")).toBe(2);
});
it.each(["REPAIR_RETURN", "REFUSAL"])(
  "manager approves %s while sellers denied and history immutable",
  async (outcome) => {
    await open();
    await expect(
      send("sav.outcome", { caseId: "case", outcome, note: "Approved" }, "seller"),
    ).rejects.toThrow("FORBIDDEN");
    await send("sav.outcome", { caseId: "case", outcome, note: "Approved" }, "manager");
    expect(count("sav_outcomes")).toBe(1);
    expect(() => h.db.exec("UPDATE sav_outcomes SET note='edit'")).toThrow("APPEND_ONLY");
    expect(h.db.prepare(`SELECT state FROM phones WHERE id='${unit}'`).get()?.["state"]).toBe(
      "SOLD",
    );
  },
);
it("cash refund is atomic idempotent capped and holding is owner restock only", async () => {
  await open();
  const c = command("sav.outcome", {
    caseId: "case",
    outcome: "REFUND",
    note: "Return",
    amount: "100.00",
    method: "Cash",
    shiftId: shift,
  });
  const first = await svc().execute("manager", c);
  expect(await svc().execute("manager", c)).toEqual(first);
  expect(count("sav_refunds")).toBe(1);
  expect(h.db.prepare("SELECT amount_minor FROM cash_adjustments").get()?.["amount_minor"]).toBe(
    -10000,
  );
  expect(h.db.prepare(`SELECT state FROM phones WHERE id='${unit}'`).get()?.["state"]).toBe(
    "RETURN_BLOCKED",
  );
  await expect(send("sav.restock", { phoneId: unit, note: "Inspect" }, "manager")).rejects.toThrow(
    "FORBIDDEN",
  );
  await send("sav.restock", { phoneId: unit, note: "Inspected" });
  expect(h.db.prepare(`SELECT state FROM phones WHERE id='${unit}'`).get()?.["state"]).toBe(
    "AVAILABLE",
  );
  expect(count("sales")).toBe(1);
});
it("overpaid refund rejected without partial holding, journal or outcome", async () => {
  await open();
  await expect(
    send("sav.outcome", {
      caseId: "case",
      outcome: "REFUND",
      note: "Return",
      amount: "100.01",
      method: "Bank",
      bankMethod: "VIREMENT",
    }),
  ).rejects.toThrow("REJECTED");
  expect(count("sav_outcomes")).toBe(0);
  expect(count("sav_refunds")).toBe(0);
  expect(count("sav_holding")).toBe(0);
});
it("closed cash shift refuses refund; bank refund does not enter cash", async () => {
  await open();
  await send("cash.close", { shiftId: shift, counted: "1100" }, "seller");
  await expect(
    send("sav.outcome", {
      caseId: "case",
      outcome: "REFUND",
      note: "Return",
      amount: "100",
      method: "Cash",
      shiftId: shift,
    }),
  ).rejects.toThrow("SHIFT_CLOSED");
  await send(
    "sav.outcome",
    {
      caseId: "case",
      outcome: "REFUND",
      note: "Return",
      amount: "100",
      method: "Bank",
      bankMethod: "CCP_BARIDIMOB",
    },
    "manager",
  );
  expect(count("cash_adjustments")).toBe(0);
  expect(
    h.db.prepare("SELECT credit_minor FROM journals WHERE account='BANK_UNRECONCILED'").get()?.[
      "credit_minor"
    ],
  ).toBe(10000);
});
it("atomic exchange returns original, creates new sale and settles exact price difference", async () => {
  const sale = await open();
  h.db.exec("UPDATE prices SET amount_minor=12000 WHERE store_id='M01'");
  const next = checkout(replacement, "120", { customerId: String(sale?.["customer_id"]) });
  await send(
    "sav.exchange",
    {
      caseId: "case",
      note: "Exchange",
      refundAmount: "100",
      method: "Cash",
      shiftId: shift,
      checkout: next,
    },
    "manager",
  );
  expect(count("sales")).toBe(2);
  expect(count("sav_exchanges")).toBe(1);
  expect(h.db.prepare(`SELECT state FROM phones WHERE id='${unit}'`).get()?.["state"]).toBe(
    "RETURN_BLOCKED",
  );
  expect(h.db.prepare(`SELECT state FROM phones WHERE id='${replacement}'`).get()?.["state"]).toBe(
    "SOLD",
  );
  expect(
    h.db.prepare("SELECT sum(amount_minor) n FROM effective_cash_movements").get()?.["n"],
  ).toBe(12000);
});
it("failed replacement sale rolls entire exchange back", async () => {
  const sale = await open();
  const next = checkout(unit, "100", { customerId: String(sale?.["customer_id"]) });
  await expect(
    send("sav.exchange", {
      caseId: "case",
      note: "Exchange",
      refundAmount: "100",
      method: "Cash",
      shiftId: shift,
      checkout: next,
    }),
  ).rejects.toThrow();
  expect(count("sav_outcomes")).toBe(0);
  expect(count("sales")).toBe(1);
});
const used = (store = "M01") => ({
  store,
  id: "used-unit",
  catalogId: "model",
  barcode: "USED",
  imei: "356938035643809",
  serial: "USED-SERIAL",
  surname: "PrivateSurname",
  givenName: "PrivateName",
  phone: "0555123456",
  photoPending: true,
  amount: "20",
  shiftId: store === "M01" ? shift : "shift2",
});
it.each([
  ["M01", "manager"],
  ["M01", "seller"],
  ["M02", "s2"],
])("used purchase %s/%s denied", async (store, actor) => {
  await expect(send("used.purchase", used(store), actor)).rejects.toThrow("FORBIDDEN");
  expect(count("individual_purchases")).toBe(0);
});
it.each([
  ["M01", "owner"],
  ["M02", "m2"],
])(
  "used purchase %s/%s posts stock/cash with private cost and seller identity",
  async (store, actor) => {
    await send("used.purchase", used(store), actor);
    expect(
      h.db.prepare("SELECT state,attributes_json FROM phones WHERE id='used-unit'").get(),
    ).toMatchObject({ state: "AVAILABLE", attributes_json: '{"condition":"USED"}' });
    expect(h.db.prepare("SELECT amount_minor FROM cash_adjustments").get()?.["amount_minor"]).toBe(
      -2000,
    );
    const mgr = store === "M01" ? "manager" : "m2";
    const info = await svc().individualPurchases(mgr, store);
    expect(info[0]).toMatchObject({ surname: "PrivateSurname", phone: "0555123456" });
    expect(info[0]).not.toHaveProperty("amount_minor");
    expect((await svc().individualPurchases("owner", store))[0]).toHaveProperty(
      "amount_minor",
      2000,
    );
    await expect(
      svc().individualPurchases(store === "M01" ? "seller" : "s2", store),
    ).rejects.toThrow("FORBIDDEN");
    expect(
      JSON.stringify(await svc().read(store === "M01" ? "seller" : "s2", "inventory", store)),
    ).not.toMatch(/PrivateSurname|0555123456|amount_minor":2000/);
    expect(
      String(
        h.db
          .prepare("SELECT payload_json FROM audit_events WHERE operation='used.purchase'")
          .get()?.["payload_json"],
      ),
    ).not.toMatch(/Private|0555123456|amount/);
  },
);
it("used purchase rejects closed shift and duplicate IMEI atomically", async () => {
  h.db.exec("UPDATE shifts SET state='CLOSED' WHERE id='shift2'");
  await expect(send("used.purchase", used("M02"), "m2")).rejects.toThrow("SHIFT_CLOSED");
  await expect(send("used.purchase", { ...used(), imei: "490154203237518" })).rejects.toThrow(
    "REJECTED",
  );
  expect(count("individual_purchases")).toBe(0);
});
it("report Algiers date boundaries aggregate only requested store/day without PII/cost", () => {
  expect(
    salesByDay(
      [
        { store: "M01", at: "2026-11-08T23:30:00Z", total: "100" },
        { store: "M01", at: "2026-11-09T22:30:00Z", total: "20" },
        { store: "M02", at: "2026-11-09T12:00:00Z", total: "30" },
      ],
      "M01",
      "2026-11-09",
      "2026-11-09",
    ),
  ).toEqual([{ store: "M01", day: "2026-11-09", sales: 2, total: "120.00" }]);
  expect(daysSinceSale("2026-11-01T12:00:00Z", now)).toBe(8);
});
it("native report is staff cost-free; Zakat is owner-only and missing costs disclosed", async () => {
  await open();
  const report = await svc().salesReport("seller", {
    store: "M01",
    from: "2026-11-09",
    to: "2026-11-09",
  });
  expect(report).toEqual([{ store: "M01", day: "2026-11-09", sales: 1, total: "100.00" }]);
  await expect(svc().zakatSheet("manager", "M01")).rejects.toThrow("FORBIDDEN");
  await send("used.purchase", used());
  const z = await svc().zakatSheet("owner", "M01");
  expect(z).toMatchObject({ stock: "2000", cash: "208000", known: 1, total: 2, missing: 1 });
  expect(zakatTotals(100n, 200n, 30n, 40n).net).toBe("290");
});
it("used purchase matrix has special M01 owner-only restriction", () => {
  expect(permits("MANAGER", "M01", "M01", "used.purchase")).toBe(false);
  expect(permits("MANAGER", "M02", "M02", "used.purchase")).toBe(true);
  expect(permits("SUPER_ADMIN", "GLOBAL", "M01", "used.purchase")).toBe(true);
});
