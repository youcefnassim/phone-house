import { nativeCheckoutEnvelope } from "./native-checkout";
import { z } from "zod";
import { databaseMoney } from "./transaction-contracts";
import { algiersDate } from "./sales-review";
import { minorUnits, decimalValue, type StoreId } from "./erp";
const id = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[A-Za-z0-9-]+$/);
const text = z.string().trim().min(1).max(2000);
const store = z.enum(["M01", "M02"]);
const amount = databaseMoney.refine((v) => minorUnits(v) > 0n);
export const savTrack = z
  .object({
    store,
    caseId: id,
    status: z.enum(["IN_HOUSE", "EXTERNAL", "IN_REPAIR", "READY", "SENT_DISTRIBUTOR", "RETURNED"]),
    note: text,
    paidRepairNeeded: z.boolean().default(false),
  })
  .strict();
export const savOutcome = z
  .object({
    store,
    caseId: id,
    outcome: z.enum(["REPAIR_RETURN", "REFUND", "REFUSAL"]),
    note: text,
    amount: amount.optional(),
    method: z.enum(["Cash", "Bank"]).optional(),
    shiftId: id.optional(),
    bankMethod: z.enum(["VIREMENT", "CCP_BARIDIMOB"]).optional(),
    // Money due but not paid back: must be stated explicitly with a reason (never a silent zero).
    refundDeclined: z.literal(true).optional(),
    declineReason: text.optional(),
  })
  .strict()
  .superRefine((v, c) => {
    // Full decline: reason, no payment. Partial refund: amount + reason for the unrefunded remainder.
    if (
      (v.refundDeclined || v.declineReason) &&
      (v.outcome !== "REFUND" ||
        !v.declineReason ||
        (v.refundDeclined ? !!(v.amount || v.method || v.shiftId || v.bankMethod) : !v.amount))
    )
      c.addIssue({ code: "custom", message: "DECLINE_MISMATCH" });
    if (
      v.outcome === "REFUND" &&
      // A return with no money back (debt absorbs the line) carries no payment fields at all.
      (v.amount || v.method || v.shiftId || v.bankMethod) &&
      (!v.amount || !v.method || (v.method === "Cash" ? !v.shiftId : !v.bankMethod))
    )
      c.addIssue({ code: "custom", message: "PAYMENT_MISMATCH" });
    if (v.outcome !== "REFUND" && (v.amount || v.method || v.shiftId || v.bankMethod))
      c.addIssue({ code: "custom", message: "VALIDATION" });
  });
export const savExchange = z
  .object({
    store,
    caseId: id,
    note: text,
    // "0" is allowed only when the remaining debt absorbs the returned line (checked in SQL).
    refundAmount: databaseMoney,
    method: z.enum(["Cash", "Bank"]),
    shiftId: id.optional(),
    bankMethod: z.enum(["VIREMENT", "CCP_BARIDIMOB"]).optional(),
    // Reason for the unrefunded remainder when refundAmount is below what is due.
    declineReason: text.optional(),
    checkout: nativeCheckoutEnvelope,
  })
  .strict()
  .superRefine((v, c) => {
    if (
      v.checkout.payload.store !== v.store ||
      v.checkout.payload.lines.length !== 1 ||
      v.checkout.payload.lines[0]?.kind !== "phone" ||
      Number(v.checkout.payload.creditAmount ?? 0) > 0 ||
      v.checkout.payload.tender !== v.method ||
      (v.method === "Cash"
        ? !v.shiftId || v.shiftId !== v.checkout.payload.shiftId
        : !v.bankMethod || v.bankMethod !== v.checkout.payload.bankMethod)
    )
      c.addIssue({ code: "custom", message: "PAYMENT_MISMATCH" });
  });
export const savRestock = z.object({ store, phoneId: id, note: text }).strict();
export const usedPurchase = z
  .object({
    store,
    id,
    catalogId: id,
    barcode: id,
    imei: z.string().regex(/^\d{15}$/),
    serial: id,
    surname: text,
    givenName: text,
    phone: text,
    photoPending: z.literal(true),
    shiftId: id,
    amount,
  })
  .strict();
export type SaleDay = { store: StoreId; day: string; sales: number; total: string };
export function salesByDay(
  rows: { store: StoreId; at: string | number; total: string; voided?: boolean }[],
  store: StoreId | "ALL",
  from: string,
  to: string,
): SaleDay[] {
  const result = new Map<string, { store: StoreId; day: string; sales: number; minor: bigint }>();
  for (const row of rows) {
    const day = algiersDate(new Date(row.at));
    if (
      row.voided ||
      (store !== "ALL" && row.store !== store) ||
      (from && day < from) ||
      (to && day > to)
    )
      continue;
    const key = row.store + day;
    const r = result.get(key) ?? { store: row.store, day, sales: 0, minor: 0n };
    r.sales++;
    r.minor += minorUnits(row.total);
    result.set(key, r);
  }
  return [...result.values()]
    .sort((a, b) => a.day.localeCompare(b.day) || a.store.localeCompare(b.store))
    .map(({ minor, ...r }) => ({ ...r, total: decimalValue(minor) }));
}
export function daysSinceSale(at: string | number, now = Date.now()) {
  return Math.max(
    0,
    Math.floor(
      (Date.parse(algiersDate(new Date(now))) - Date.parse(algiersDate(new Date(at)))) / 86400000,
    ),
  );
}
export function zakatTotals(stock: bigint, cash: bigint, receivables: bigint, payables: bigint) {
  return {
    stock: stock.toString(),
    cash: cash.toString(),
    receivables: receivables.toString(),
    payables: payables.toString(),
    net: (stock + cash + receivables - payables).toString(),
  };
}
