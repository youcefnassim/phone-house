import { savTrack, savOutcome, savRestock, usedPurchase, savExchange } from "./batch4b";
import { rolesForOperation } from "./permissions";
import { z } from "zod";
import { settingsSaveValue } from "./intake";
import { databaseMoney, approvedFacilitySchedule } from "./transaction-contracts";
const id = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[A-Za-z0-9-]+$/);
const text = z.string().trim().min(1).max(2000);
const store = z.enum(["M01", "M02"]);
const quantity = z.number().int().min(1).max(2147483647);
const base = { store };
const positive = databaseMoney.refine((v) => {
  const [whole = "0", fraction = ""] = v.split(".");
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0")) > 0n;
});
const phone = z
  .object({
    id,
    imei1: z.string().regex(/^\d{15}$/),
    imei2: z
      .string()
      .regex(/^\d{15}$/)
      .optional(),
    serial: id.optional(),
    barcode: id,
    attributes: z.record(z.string()),
  })
  .strict()
  .refine((p) => p.imei1 !== p.imei2, "IMEI slots must differ");
export const nativePayloads = {
  "sav.exchange": savExchange,
  "sav.track": savTrack,
  "sav.outcome": savOutcome,
  "sav.restock": savRestock,
  "used.purchase": usedPurchase,
  "cash.movement": z
    .object({
      ...base,
      shiftId: id,
      direction: z.enum(["IN", "OUT"]),
      amount: positive,
      reason: text,
      note: z.string().trim().max(2000).default(""),
    })
    .strict()
    .refine((v) => v.reason !== "Autre" || !!v.note, "NOTE_REQUIRED"),
  "repayment.record": z
    .object({
      ...base,
      debtId: id,
      amount: positive,
      method: z.enum(["Cash", "Bank"]),
      shiftId: id.optional(),
      bankMethod: z.enum(["VIREMENT", "CCP_BARIDIMOB"]).optional(),
    })
    .strict()
    .refine((v) => (v.method === "Cash" ? !!v.shiftId : !!v.bankMethod), "PAYMENT_MISMATCH"),
  "repayment.reverse": z
    .object({ ...base, repaymentId: id, reason: text, shiftId: id.optional() })
    .strict(),
  "sale.void": z.object({ ...base, saleId: id, reason: text }).strict(),
  "customer.save": z.object({ ...base, id, name: text, reference: id }).strict(),
  "supplier.save": z
    .object({
      ...base,
      id,
      name: text,
      reference: id,
      phone: z.string().trim().max(80).default(""),
    })
    .strict(),
  "supplier.cost": z
    .object({ ...base, sourceId: id, phoneId: id.optional(), supplierId: id, amount: positive })
    .strict(),
  "supplier.payment": z
    .object({
      ...base,
      supplierId: id,
      amount: positive,
      method: z.enum(["Cash", "Bank"]),
      shiftId: id.optional(),
      bankMethod: z.enum(["VIREMENT", "CCP_BARIDIMOB"]).optional(),
    })
    .strict()
    .refine((v) => (v.method === "Cash" ? !!v.shiftId : !!v.bankMethod), "PAYMENT_MISMATCH"),
  "count.open": z
    .object({ ...base, id, month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/) })
    .strict(),
  "count.entry": z
    .object({
      ...base,
      countId: id,
      itemId: id,
      kind: z.enum(["phone", "accessory"]),
      quantity: z.number().int().min(0).max(2147483647),
    })
    .strict(),
  "count.submit": z.object({ ...base, countId: id }).strict(),
  "stock.adjust": z
    .object({
      ...base,
      itemId: id,
      delta: z
        .number()
        .int()
        .min(-2147483647)
        .max(2147483647)
        .refine((v) => v !== 0),
      reason: text,
      countId: id.optional(),
    })
    .strict(),
  "stock.review": z
    .object({ ...base, adjustmentId: id, outcome: z.enum(["OK", "FLAGGED"]), note: text })
    .strict(),
  "transfer.resolve": z
    .object({
      ...base,
      transferId: id,
      itemId: id,
      outcome: z.enum(["RETURN", "WRITE_OFF"]),
      reason: text,
    })
    .strict(),
  "transfer.cancel": z.object({ ...base, transferId: id, reason: text }).strict(),
  "catalog.save": z
    .object({
      ...base,
      id,
      kind: z.enum(["phone", "accessory"]),
      sku: id,
      name: text,
      attributes: z.record(z.string()),
    })
    .strict(),
  "price.set": z.object({ ...base, itemId: id, amount: positive }).strict(),
  // Owner-only (permissions.ts): shared app settings; value validated per key.
  "settings.save": z
    .object({ ...base, key: z.string(), value: z.unknown() })
    .strict()
    .superRefine((v, c) => {
      const r = settingsSaveValue.safeParse({ key: v.key, value: v.value });
      if (!r.success) c.addIssue({ code: "custom", message: "INVALID_SETTING" });
    }),
  "purchase.save": z
    .object({ ...base, id, supplierId: id, itemId: id, quantity, evidence: text })
    .strict(),
  "purchase.finance": z
    .object({
      ...base,
      purchaseId: id,
      cost: positive.nullable(),
      obligation: databaseMoney.nullable(),
    })
    .strict(),
  // No purchase approval command: externally authorized evidence/terms remain unresolved.
  "stock.receive": z
    .object({
      ...base,
      purchaseId: id,
      evidence: text,
      quantity,
      phones: z.array(phone).max(100).default([]),
    })
    .strict(),
  "cash.open": z.object({ ...base, id, drawerId: id, opening: databaseMoney }).strict(),
  "cash.close": z.object({ ...base, shiftId: id, counted: databaseMoney }).strict(),
  "cash.review": z
    .object({ ...base, shiftId: id, outcome: z.enum(["NO_ISSUE", "FLAGGED"]), note: text })
    .strict(),
  "session.revoke": z.object({ ...base, sessionId: id }).strict(),
  "cash.evidence": z
    .object({
      ...base,
      shiftId: id,
      direction: z.enum(["IN", "OUT"]),
      amount: positive,
      reference: text,
    })
    .strict(),
  "debt.draft": z.object({ ...base, id, customerId: id, saleId: id, amount: positive }).strict(),
  "repayment.draft": z.object({ ...base, debtId: id, amount: positive, reference: id }).strict(),
  "transfer.create": z
    .object({
      ...base,
      id,
      destination: store,
      lines: z
        .array(
          z
            .object({ itemId: id, kind: z.enum(["phone", "accessory"]), quantity, code: id })
            .strict(),
        )
        .min(1)
        .max(100),
    })
    .strict()
    .refine((p) => p.store !== p.destination, "Different stores required"),
  "transfer.approve": z
    .object({ ...base, transferId: id, approval: z.enum(["SUPER_ADMIN", "M02_MANAGER"]) })
    .strict(),
  "transfer.scan": z
    .object({
      ...base,
      transferId: id,
      itemId: id,
      code: id,
      quantity,
      damaged: z.boolean().default(false),
    })
    .strict(),
  "transfer.dispatch": z
    .object({ ...base, transferId: id, evidence: text, carrier: text })
    .strict(),
  "transfer.receive": z.object({ ...base, transferId: id, evidence: text }).strict(),
  "facility.draft": z
    .object({
      store: z.literal("M01"),
      id,
      customerId: id,
      employer: text,
      cashPrice: positive,
      schedule: approvedFacilitySchedule,
    })
    .strict(),
  "facility.evidence": z
    .object({
      store: z.literal("M01"),
      facilityId: id,
      kind: z.enum(["SALARY_DEDUCTION", "BANK_REMITTANCE"]),
      amount: positive,
      document: text,
    })
    .strict(),
  "sav.open": z
    .object({
      ...base,
      id,
      saleId: id,
      phoneId: id,
      customerId: id,
      imei: z.string().regex(/^\d{15}$/),
      issue: text,
    })
    .strict(),
  "sav.event": z.object({ ...base, caseId: id, note: text, evidence: text }).strict(),
  "sav.refund.review": z.object({ ...base, caseId: id, amount: positive, evidence: text }).strict(),
  "expense.draft": z.object({ ...base, id, amount: positive, evidence: text }).strict(),
  "account.provision": z
    .object({ ...base, userId: id, role: z.enum(["MANAGER", "SELLER"]), targetStore: store })
    .strict(),
  "account.revoke": z.object({ ...base, userId: id }).strict(),
  "role.replace": z
    .object({ ...base, userId: id, role: z.enum(["MANAGER", "SELLER"]), targetStore: store })
    .strict(),
  "document.register": z
    .object({
      ...base,
      id,
      mime: z.enum(["application/pdf", "image/jpeg", "image/png"]),
      size: z.number().int().min(1).max(10485760),
      sha256: z.string().regex(/^[a-f0-9]{64}$/),
    })
    .strict(),
} as const;
export type NativeOperation = keyof typeof nativePayloads;
export const nativeEnvelope = z
  .object({
    version: z.literal("native-2026-11-06"),
    key: id.min(16),
    operation: z.enum(Object.keys(nativePayloads) as [NativeOperation, ...NativeOperation[]]),
    payload: z.unknown(),
  })
  .strict();
export interface NativeCommandResult {
  key: string;
  transactionId: string;
  status: "RECORDED" | "DRAFT" | "POLICY_BLOCKED";
}
/** Server-assigned status per operation (mirrors the SQL planner; asserted by local SQLite tests). */
export const nativeOperationStatus: Record<NativeOperation, NativeCommandResult["status"]> = {
  "sav.exchange": "RECORDED",
  "sav.track": "RECORDED",
  "sav.outcome": "RECORDED",
  "sav.restock": "RECORDED",
  "used.purchase": "RECORDED",
  "supplier.cost": "RECORDED",
  "supplier.payment": "RECORDED",
  "count.open": "RECORDED",
  "count.entry": "RECORDED",
  "count.submit": "RECORDED",
  "stock.adjust": "RECORDED",
  "stock.review": "RECORDED",
  "transfer.resolve": "RECORDED",
  "transfer.cancel": "RECORDED",
  "cash.movement": "RECORDED",
  "repayment.record": "RECORDED",
  "repayment.reverse": "RECORDED",
  "sale.void": "RECORDED",
  "cash.review": "RECORDED",
  "session.revoke": "RECORDED",
  "customer.save": "RECORDED",
  "supplier.save": "RECORDED",
  "catalog.save": "RECORDED",
  "price.set": "RECORDED",
  "settings.save": "RECORDED",
  "purchase.save": "DRAFT",
  "purchase.finance": "RECORDED",
  "stock.receive": "RECORDED",
  "cash.open": "RECORDED",
  "cash.close": "RECORDED",
  "cash.evidence": "POLICY_BLOCKED",
  "debt.draft": "POLICY_BLOCKED",
  "repayment.draft": "DRAFT",
  "transfer.create": "DRAFT",
  "transfer.approve": "RECORDED",
  "transfer.scan": "RECORDED",
  "transfer.dispatch": "RECORDED",
  "transfer.receive": "RECORDED",
  "facility.draft": "POLICY_BLOCKED",
  "facility.evidence": "POLICY_BLOCKED",
  "sav.open": "RECORDED",
  "sav.event": "RECORDED",
  "sav.refund.review": "POLICY_BLOCKED",
  "expense.draft": "POLICY_BLOCKED",
  "account.provision": "RECORDED",
  "account.revoke": "RECORDED",
  "role.replace": "RECORDED",
  "document.register": "DRAFT",
};
export const ownerOnlyOperations: readonly NativeOperation[] = (
  Object.keys(nativePayloads) as NativeOperation[]
).filter((operation) => rolesForOperation(operation).length === 1);
