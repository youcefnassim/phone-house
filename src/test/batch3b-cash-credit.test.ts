import { beforeEach, afterEach, it, expect } from "vitest";
import { sqliteHarness } from "./sqlite-harness";
import { createNativeService } from "@/backend/sqlite/service";
import { creditIsLate, canFollowCredit } from "@/domain/credit";
let h: ReturnType<typeof sqliteHarness>;
const now = Date.parse("2026-11-09T12:00:00Z"),
  acc = "22222222-2222-4222-8222-222222222222",
  shift = "33333333-3333-4333-8333-333333333333";
const service = () =>
  createNativeService(
    h.port,
    { verify: async (userId) => ({ userId, sessionId: userId, expiresAt: now + 100000 }) },
    { get: async () => null, put: async () => {} },
    () => now,
  );
const sale = (patch: Record<string, unknown> = {}, idempotencyKey = "batch3b-credit-sale") => ({
  contractVersion: "native-pos-2026-11-07",
  idempotencyKey,
  clientRequestId: crypto.randomUUID(),
  payload: {
    store: "M01",
    shiftId: shift,
    buyer: { surname: "Buyer", givenName: "Name", contact: "0550123456" },
    lines: [{ itemId: acc, kind: "accessory", quantity: "1" }],
    tender: "Split",
    cashAmount: "20",
    bankAmount: "30",
    bankMethod: "VIREMENT",
    tenderedAmount: "25",
    creditAmount: "50",
    dueDate: "2026-11-08",
    warranties: [],
    ...patch,
  },
});
const cmd = (operation: string, payload: Record<string, unknown>, key = "batch3b-command-key") => ({
  version: "native-2026-11-06",
  key,
  operation,
  payload: { store: "M01", ...payload },
});
const id = () => String(h.db.prepare("SELECT id FROM sales").get()?.["id"]);
beforeEach(() => {
  h = sqliteHarness();
  h.db.exec(
    `INSERT INTO accounts VALUES('owner',1),('manager',1),('seller',1),('other',1);INSERT INTO memberships VALUES('owner','GLOBAL','SUPER_ADMIN'),('manager','M01','MANAGER'),('seller','M01','SELLER'),('other','M02','MANAGER');INSERT INTO sessions SELECT id,id,${now + 100000},0 FROM accounts;INSERT INTO catalog VALUES('${acc}','accessory','ACC','Cable','{}');INSERT INTO prices VALUES('M01','${acc}',10000);INSERT INTO accessory_balances VALUES('M01','${acc}',10);INSERT INTO drawers VALUES('d','M01');INSERT INTO shifts VALUES('${shift}','M01','d','seller','OPEN',0,NULL);`,
  );
});
afterEach(() => h.db.close());
it("credit accessory sale atomically records deposit split, due date and linked debt; journals balance", async () => {
  await service().checkout("manager", sale());
  expect(h.db.prepare("SELECT total_minor,change_minor FROM sales").get()).toMatchObject({
    total_minor: 10000,
    change_minor: 500,
  });
  expect(h.db.prepare("SELECT cash_minor,bank_minor FROM sale_settlements").get()).toEqual({
    cash_minor: 2000,
    bank_minor: 3000,
  });
  expect(
    h.db.prepare("SELECT amount_minor,due_date,balance_minor,state FROM credit_balances").get(),
  ).toEqual({ amount_minor: 5000, due_date: "2026-11-08", balance_minor: 5000, state: "OPEN" });
  expect(h.db.prepare("SELECT sum(debit_minor-credit_minor) n FROM journals").get()?.["n"]).toBe(0);
  expect(await service().receipt("manager", id(), "M01")).toMatchObject({ creditMinor: 5000 });
});
it("credit without phone refused without creating buyer, sale or stock changes", async () => {
  await expect(
    service().checkout("manager", sale({ buyer: { surname: "B", givenName: "N" } })),
  ).rejects.toThrow("VALIDATION");
  expect(h.db.prepare("SELECT count(*) n FROM sales").get()?.["n"]).toBe(0);
});
it.each(["seller", "other"])("%s cannot complete credit in M01", async (u) => {
  await expect(service().checkout(u, sale())).rejects.toThrow("FORBIDDEN");
  expect(h.db.prepare("SELECT count(*) n FROM customers").get()?.["n"]).toBe(0);
});
it("cash movement in and out counts in expected at blind close", async () => {
  await service().execute(
    "manager",
    cmd("cash.movement", {
      shiftId: shift,
      direction: "IN",
      amount: "100",
      reason: "Autre",
      note: "Owner deposit",
    }),
  );
  await service().execute(
    "manager",
    cmd(
      "cash.movement",
      { shiftId: shift, direction: "OUT", amount: "25", reason: "Loyer", note: "" },
      "batch3b-cash-out-key",
    ),
  );
  await service().execute(
    "seller",
    cmd("cash.close", { shiftId: shift, counted: "75" }, "batch3b-close-key"),
  );
  expect(h.db.prepare("SELECT expected_minor FROM shift_closures").get()?.["expected_minor"]).toBe(
    7500,
  );
  expect(
    h.db.prepare("SELECT count(*) n FROM audit_events WHERE operation='cash.movement'").get()?.[
      "n"
    ],
  ).toBe(2);
});
it("cash movement seller refused", async () => {
  await expect(
    service().execute(
      "seller",
      cmd("cash.movement", {
        shiftId: shift,
        direction: "IN",
        amount: "10",
        reason: "Frais",
        note: "",
      }),
    ),
  ).rejects.toThrow("FORBIDDEN");
});
it("cash movement closed shift refused", async () => {
  h.db.exec(`UPDATE shifts SET state='CLOSED' WHERE id='${shift}'`);
  await expect(
    service().execute(
      "manager",
      cmd("cash.movement", {
        shiftId: shift,
        direction: "IN",
        amount: "10",
        reason: "Frais",
        note: "",
      }),
    ),
  ).rejects.toThrow("SHIFT_CLOSED");
});
it("Autre requires note; unconfigured reasons refused; staff cannot edit reasons", async () => {
  await expect(
    service().execute(
      "manager",
      cmd("cash.movement", {
        shiftId: shift,
        direction: "IN",
        amount: "10",
        reason: "Autre",
        note: "",
      }),
    ),
  ).rejects.toThrow("VALIDATION");
  h.db.exec("INSERT INTO app_settings VALUES('cash.movementReasons','[]',1)");
  await expect(
    service().execute(
      "manager",
      cmd("cash.movement", {
        shiftId: shift,
        direction: "IN",
        amount: "10",
        reason: "Frais",
        note: "",
      }),
    ),
  ).rejects.toThrow("REJECTED");
  await expect(
    service().execute(
      "seller",
      cmd("settings.save", { key: "cash.movementReasons", value: ["Frais"] }),
    ),
  ).rejects.toThrow("FORBIDDEN");
});
it("staff cash repayment enters OPEN drawer; bank stays outside; PAID at zero", async () => {
  await service().checkout("manager", sale());
  await service().execute(
    "seller",
    cmd("repayment.record", { debtId: id(), amount: "20", method: "Cash", shiftId: shift }),
  );
  await service().execute(
    "manager",
    cmd(
      "repayment.record",
      { debtId: id(), amount: "30", method: "Bank", bankMethod: "CCP_BARIDIMOB" },
      "batch3b-bank-repay",
    ),
  );
  expect(h.db.prepare("SELECT balance_minor,state FROM credit_balances").get()).toEqual({
    balance_minor: 0,
    state: "PAID",
  });
  expect(
    h.db.prepare("SELECT sum(amount_minor) n FROM effective_cash_movements").get()?.["n"],
  ).toBe(4000);
  const history = await service().debtList("seller", { store: "M01", limit: 200, offset: 0 });
  expect(history.debts[0]?.repayments).toHaveLength(2);
});
it("concurrent overpayments allow exactly one with no partial entries", async () => {
  await service().checkout("manager", sale());
  const results = await Promise.allSettled(
    ["A", "B"].map((k) =>
      service().execute(
        "seller",
        cmd(
          "repayment.record",
          { debtId: id(), amount: "40", method: "Cash", shiftId: shift },
          `batch3b-concurrent-${k}`,
        ),
      ),
    ),
  );
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(h.db.prepare("SELECT balance_minor FROM credit_balances").get()?.["balance_minor"]).toBe(
    1000,
  );
  expect(h.db.prepare("SELECT count(*) n FROM credit_repayments").get()?.["n"]).toBe(1);
});
it("repayment reversal owner-only, append-only and restores balance and drawer", async () => {
  await service().checkout("manager", sale());
  await service().execute(
    "seller",
    cmd("repayment.record", { debtId: id(), amount: "50", method: "Cash", shiftId: shift }),
  );
  const p = String(h.db.prepare("SELECT id FROM credit_repayments").get()?.["id"]);
  const before = h.db.prepare("SELECT * FROM credit_repayments").get();
  await expect(
    service().execute(
      "manager",
      cmd(
        "repayment.reverse",
        { repaymentId: p, reason: "Correction", shiftId: shift },
        "batch3b-reverse-key",
      ),
    ),
  ).rejects.toThrow("FORBIDDEN");
  await service().execute(
    "owner",
    cmd(
      "repayment.reverse",
      { repaymentId: p, reason: "Correction", shiftId: shift },
      "batch3b-reverse-key",
    ),
  );
  expect(h.db.prepare("SELECT * FROM credit_repayments").get()).toEqual(before);
  expect(h.db.prepare("SELECT balance_minor,state FROM credit_balances").get()).toEqual({
    balance_minor: 5000,
    state: "OPEN",
  });
  expect(
    h.db.prepare("SELECT sum(amount_minor) n FROM effective_cash_movements").get()?.["n"],
  ).toBe(2000);
});
it("cash repayment closed refused; bank can repay after close", async () => {
  await service().checkout("manager", sale());
  h.db.exec(`UPDATE shifts SET state='CLOSED' WHERE id='${shift}'`);
  await expect(
    service().execute(
      "seller",
      cmd("repayment.record", { debtId: id(), amount: "10", method: "Cash", shiftId: shift }),
    ),
  ).rejects.toThrow("SHIFT_CLOSED");
  await service().execute(
    "seller",
    cmd("repayment.record", { debtId: id(), amount: "10", method: "Bank", bankMethod: "VIREMENT" }),
  );
  expect(h.db.prepare("SELECT balance_minor FROM credit_balances").get()?.["balance_minor"]).toBe(
    4000,
  );
});
it("overdue after due day only, positive balance, scoped manager/owner only", () => {
  expect(creditIsLate("2026-11-09", 100, new Date(now))).toBe(false);
  expect(creditIsLate("2026-11-08", 100, new Date(now))).toBe(true);
  expect(creditIsLate("2026-11-08", 0, new Date(now))).toBe(false);
  expect(canFollowCredit("MANAGER", "M01", "M01")).toBe(true);
  expect(canFollowCredit("MANAGER", "M01", "M02")).toBe(false);
  expect(canFollowCredit("SELLER", "M01", "M01")).toBe(false);
  expect(canFollowCredit("SUPER_ADMIN", "GLOBAL", "M02")).toBe(true);
});
it.each(["Cash", "Bank"])("free full credit with zero %s deposit is accepted", async (tender) => {
  await service().checkout("owner", sale({ tender, tenderedAmount: "0", creditAmount: "100" }));
  expect(h.db.prepare("SELECT amount_minor FROM sale_credits").get()?.["amount_minor"]).toBe(10000);
  expect(h.db.prepare("SELECT count(*) n FROM cash_movements").get()?.["n"]).toBe(0);
});

it("same-key repayment and reversal replay do not duplicate records; another reversal refused", async () => {
  await service().checkout("manager", sale());
  const repay = cmd("repayment.record", {
    debtId: id(),
    amount: "50",
    method: "Bank",
    bankMethod: "VIREMENT",
  });
  await service().execute("seller", repay);
  await service().execute("seller", repay);
  expect(h.db.prepare("SELECT count(*) n FROM credit_repayments").get()?.["n"]).toBe(1);
  const repaymentId = String(h.db.prepare("SELECT id FROM credit_repayments").get()?.["id"]);
  const reverse = cmd(
    "repayment.reverse",
    { repaymentId, reason: "Correction" },
    "batch3b-reverse-bank",
  );
  await service().execute("owner", reverse);
  await service().execute("owner", reverse);
  expect(h.db.prepare("SELECT count(*) n FROM credit_repayment_reversals").get()?.["n"]).toBe(1);
  await expect(
    service().execute("owner", { ...reverse, key: "batch3b-second-reverse" }),
  ).rejects.toThrow("REJECTED");
  expect(h.db.prepare("SELECT balance_minor FROM credit_balances").get()?.["balance_minor"]).toBe(
    5000,
  );
});
it("credit rejected deposit mismatch rolls back debt, customer, stock and numbering", async () => {
  await expect(service().checkout("manager", sale({ bankAmount: "29.99" }))).rejects.toThrow(
    "REJECTED",
  );
  for (const t of ["customers", "sales", "sale_credits", "invoice_sequences"])
    expect(h.db.prepare(`SELECT count(*) n FROM ${t}`).get()?.["n"]).toBe(0);
  expect(h.db.prepare("SELECT quantity FROM accessory_balances").get()?.["quantity"]).toBe(10);
});
it("credit phone sale requires contact and retains warranty and sold unit snapshot", async () => {
  const phone = "11111111-1111-4111-8111-111111111111";
  h.db.exec(
    `INSERT INTO catalog VALUES('model','phone','PHONE','Phone','{}');INSERT INTO prices VALUES('M01','model',10000);INSERT INTO phones(id,store_id,catalog_id,barcode,state,attributes_json,serial) VALUES('${phone}','M01','model','UNIT','AVAILABLE','{}','SERIAL');`,
  );
  await service().checkout(
    "manager",
    sale({
      lines: [{ itemId: phone, kind: "phone", quantity: "1" }],
      warranties: [{ itemId: phone, requested: false }],
    }),
  );
  expect(h.db.prepare("SELECT state FROM phones").get()?.["state"]).toBe("SOLD");
  expect(h.db.prepare("SELECT amount_minor FROM sale_credits").get()?.["amount_minor"]).toBe(5000);
  await service().execute("manager", cmd("sale.void", { saleId: id(), reason: "Correction" }));
  expect(h.db.prepare("SELECT balance_minor,state FROM credit_balances").get()).toEqual({
    balance_minor: 0,
    state: "VOID",
  });
  expect(h.db.prepare("SELECT sum(debit_minor-credit_minor) n FROM journals").get()?.["n"]).toBe(0);
});
