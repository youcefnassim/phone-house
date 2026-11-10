// P0/P1 money rules for SAV returns (Phase 1 audit, 2026-11-10).
// Rule: a SAV refund or exchange return never exceeds the returned line's NET amount
// (line price minus its price-proportional share of the sale discount) nor what was paid.
// On a credit sale the debt drops by the returned line's NET amount only, and the refund
// is only the part of that net amount the remaining debt does not absorb.
import { beforeEach, it, expect, describe } from "vitest";
import { sqliteHarness } from "./sqlite-harness";
import { createNativeService } from "@/backend/sqlite/service";

let h: ReturnType<typeof sqliteHarness>,
  n = 0;
const now = Date.parse("2026-11-10T12:00:00Z");
const phone = "11111111-1111-4111-8111-111111111111",
  replacement = "22222222-2222-4222-8222-222222222222",
  acc = "33333333-3333-4333-8333-333333333333",
  shift = "44444444-4444-4444-8444-444444444444";
const svc = () =>
  createNativeService(
    h.port,
    { verify: async (u) => ({ userId: u, sessionId: u, expiresAt: now + 100000 }) },
    { get: async () => null, put: async () => {} },
    () => now,
  );
const send = (operation: string, payload: Record<string, unknown>, actor = "owner") =>
  svc().execute(actor, {
    version: "native-2026-11-06",
    key: `sav-net-command-${++n}`,
    operation,
    payload: { store: "M01", ...payload },
  });
const one = (sql: string) => {
  const row = h.db.prepare(sql).get() as Record<string, unknown> | undefined;
  return row ? Object.values(row)[0] : undefined;
};
const count = (table: string) => one(`SELECT count(*) FROM ${table}`);
const checkoutEnvelope = (
  lines: Array<{ kind: "phone" | "accessory"; itemId: string }>,
  patch: Record<string, unknown>,
) => ({
  contractVersion: "native-pos-2026-11-07",
  idempotencyKey: `sav-net-checkout-${++n}`,
  clientRequestId: crypto.randomUUID(),
  payload: {
    store: "M01",
    shiftId: shift,
    buyer: { surname: "Buyer", givenName: "Name", contact: "0555555555" },
    lines: lines.map((l) => ({ ...l, quantity: "1" })),
    tender: "Cash",
    warranties: lines
      .filter((l) => l.kind === "phone")
      .map((l) => ({ itemId: l.itemId, requested: false })),
    ...patch,
  },
});
/** Sell, then open a SAV case on the phone. Returns the case id and sale id. */
async function sellAndOpen(
  withAccessory: boolean,
  patch: Record<string, unknown>,
): Promise<{ saleId: string; customerId: string }> {
  const lines: Array<{ kind: "phone" | "accessory"; itemId: string }> = [
    { kind: "phone", itemId: phone },
  ];
  if (withAccessory) lines.push({ kind: "accessory", itemId: acc });
  await svc().checkout("owner", checkoutEnvelope(lines, patch));
  const sale = h.db.prepare("SELECT id,customer_id FROM sales").get() as Record<string, string>;
  await send("sav.open", {
    id: "case",
    saleId: sale["id"],
    phoneId: phone,
    customerId: sale["customer_id"],
    imei: "490154203237518",
    issue: "Screen",
  });
  return { saleId: String(sale["id"]), customerId: String(sale["customer_id"]) };
}
const refund = (amount: string | undefined, method: "Cash" | "Bank" = "Cash") =>
  send(
    "sav.outcome",
    amount === undefined
      ? { caseId: "case", outcome: "REFUND", note: "Return" }
      : method === "Cash"
        ? { caseId: "case", outcome: "REFUND", note: "Return", amount, method, shiftId: shift }
        : {
            caseId: "case",
            outcome: "REFUND",
            note: "Return",
            amount,
            method,
            bankMethod: "VIREMENT",
          },
    "manager",
  );
const exchange = (refundAmount: string, customerId: string) =>
  send(
    "sav.exchange",
    {
      caseId: "case",
      note: "Exchange",
      refundAmount,
      method: "Cash",
      shiftId: shift,
      checkout: checkoutEnvelope([{ kind: "phone", itemId: replacement }], {
        customerId,
        tenderedAmount: "300",
      }),
    },
    "manager",
  );
const nothingRecorded = () => {
  expect(count("sav_outcomes")).toBe(0);
  expect(count("sav_refunds")).toBe(0);
  expect(count("sav_holding")).toBe(0);
  expect(count("sav_exchanges")).toBe(0);
  expect(one(`SELECT state FROM phones WHERE id='${phone}'`)).toBe("SOLD");
};

beforeEach(() => {
  h = sqliteHarness();
  h.db.exec(
    `INSERT INTO accounts VALUES('owner',1),('seller',1),('manager',1);
     INSERT INTO memberships VALUES('owner','GLOBAL','SUPER_ADMIN'),('seller','M01','SELLER'),('manager','M01','MANAGER');
     INSERT INTO sessions SELECT id,id,${now + 100000},0 FROM accounts;
     INSERT INTO catalog VALUES('model','phone','MODEL','Phone','{"condition":"NEW"}'),('${acc}','accessory','ACC','Charger','{}');
     INSERT INTO accessory_balances VALUES('M01','${acc}',5);
     INSERT INTO phones(id,store_id,catalog_id,barcode,state,attributes_json,serial) VALUES('${phone}','M01','model','UNIT','AVAILABLE','{}','SN'),('${replacement}','M01','model','REPLACEMENT','AVAILABLE','{}','SN2');
     INSERT INTO phone_identifiers VALUES('490154203237518','${phone}',1);
     INSERT INTO drawers VALUES('d','M01');
     INSERT INTO shifts VALUES('${shift}','M01','d','seller','OPEN',1000000,NULL);
     INSERT INTO app_settings VALUES('pos.discountLimitDzd','"1000.00"',${now});`,
  );
});
const prices = (phoneMinor: number, accMinor: number) =>
  h.db.exec(`INSERT INTO prices VALUES('M01','model',${phoneMinor}),('M01','${acc}',${accMinor})`);

describe("P0: refund bounded by the returned line's net amount", () => {
  it("cash sale phone 300 + accessory 1000: refunding 1300 for the phone is rejected, nothing recorded", async () => {
    prices(30000, 100000);
    await sellAndOpen(true, { tenderedAmount: "1300" });
    await expect(refund("1300", "Bank")).rejects.toThrow("REJECTED");
    nothingRecorded();
    await expect(refund("300.01", "Bank")).rejects.toThrow("REJECTED");
    nothingRecorded();
    await refund("300");
    expect(one("SELECT sum(amount_minor) FROM sav_refunds")).toBe(30000);
  });

  it("discount is split by price: phone 1000 + accessory 500, discount 150 -> phone net 900", async () => {
    prices(100000, 50000);
    await sellAndOpen(true, { tenderedAmount: "1350", discountAmount: "150" });
    expect(one("SELECT total_minor FROM sales")).toBe(135000);
    await expect(refund("1000")).rejects.toThrow("REJECTED");
    await expect(refund("900.01")).rejects.toThrow("REJECTED");
    nothingRecorded();
    await refund("900");
    expect(one("SELECT sum(amount_minor) FROM sav_refunds")).toBe(90000);
  });

  it("net share is rounded down to the centime (never over-refunds)", async () => {
    prices(10000, 5000);
    // gross 150.00, discount 0.01 -> total 149.99; phone net = floor(10000*14999/15000) = 9999
    await sellAndOpen(true, { tenderedAmount: "149.99", discountAmount: "0.01" });
    await expect(refund("100")).rejects.toThrow("REJECTED");
    nothingRecorded();
    await refund("99.99");
    expect(one("SELECT sum(amount_minor) FROM sav_refunds")).toBe(9999);
  });

  it("exchange refund is bounded the same way", async () => {
    prices(30000, 100000);
    const { customerId } = await sellAndOpen(true, { tenderedAmount: "1300" });
    await expect(exchange("300.01", customerId)).rejects.toThrow("REJECTED");
    nothingRecorded();
    expect(count("sales")).toBe(1);
  });

  it("SQL trigger enforces the bound even if the server layer is bypassed", async () => {
    prices(30000, 100000);
    const { saleId } = await sellAndOpen(true, { tenderedAmount: "1300" });
    h.db.exec("PRAGMA foreign_keys=OFF");
    h.db.exec(`INSERT INTO sav_outcomes VALUES('case','raw-outcome','REFUND','raw','manager',0)`);
    expect(() =>
      h.db.exec(
        `INSERT INTO sav_refunds VALUES('raw','raw-refund','case','${saleId}',30001,'Bank','VIREMENT',NULL,'manager',0)`,
      ),
    ).toThrow("REJECTED");
    h.db.exec(
      `INSERT INTO sav_refunds VALUES('raw','raw-refund','case','${saleId}',30000,'Bank','VIREMENT',NULL,'manager',0)`,
    );
    expect(count("sav_refunds")).toBe(1);
  });
});

describe("P0: credit sale debt drops by the returned line's net amount only", () => {
  it("phone 1000 + accessory 500, discount 150, paid 350, credit 1000: returning the phone leaves 100 owed", async () => {
    prices(100000, 50000);
    await sellAndOpen(true, {
      tenderedAmount: "350",
      creditAmount: "1000",
      dueDate: "2026-12-10",
      discountAmount: "150",
    });
    await refund(undefined);
    // net phone 900; debt 1000 - 900 = 100; accessory net 450 = 350 paid + 100 owed.
    expect(one("SELECT balance_minor FROM credit_balances")).toBe(10000);
    expect(one("SELECT state FROM credit_balances")).toBe("OPEN");
    expect(count("sav_refunds")).toBe(0);
  });
});

describe("P1: exchange on credit when the remaining debt absorbs the return", () => {
  it("phone 300 + accessory 700, paid 200, credit 800: zero-refund exchange is atomic and linked", async () => {
    prices(30000, 70000);
    const { saleId, customerId } = await sellAndOpen(true, {
      tenderedAmount: "200",
      creditAmount: "800",
      dueDate: "2026-12-10",
    });
    await exchange("0", customerId);
    expect(count("sav_refunds")).toBe(0);
    expect(one("SELECT outcome FROM sav_outcomes")).toBe("REFUND");
    expect(one(`SELECT state FROM phones WHERE id='${phone}'`)).toBe("RETURN_BLOCKED");
    expect(one(`SELECT state FROM phones WHERE id='${replacement}'`)).toBe("SOLD");
    // The exchange row links the SAV case to the replacement sale.
    const link = h.db
      .prepare(
        "SELECT e.case_id,c.sale_id original,s.id replacement FROM sav_exchanges e JOIN service_cases c ON c.id=e.case_id JOIN sales s ON s.command_key=e.new_sale_key",
      )
      .get() as Record<string, string>;
    expect(link["case_id"]).toBe("case");
    expect(link["original"]).toBe(saleId);
    expect(link["replacement"]).not.toBe(saleId);
    // Debt 800 - returned net 300 = 500; drawer: 200 original + 300 replacement.
    expect(one("SELECT balance_minor FROM credit_balances")).toBe(50000);
    expect(one("SELECT sum(amount_minor) FROM effective_cash_movements")).toBe(20000 + 30000);
    expect(one("SELECT sum(debit_minor-credit_minor) FROM journals")).toBe(0);
  });

  it("zero-refund exchange is refused when money is actually due back (cash sale)", async () => {
    prices(30000, 100000);
    const { customerId } = await sellAndOpen(true, { tenderedAmount: "1300" });
    await expect(exchange("0", customerId)).rejects.toThrow("REJECTED");
    nothingRecorded();
    expect(count("sales")).toBe(1);
  });
});
