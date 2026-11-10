import { z } from "zod";
const store = z.enum(["M01", "M02"]);
const id = z.string().min(1).max(80);
const minor = z.number().int().safe().min(0);
const page = {
  limit: z.number().int().min(1).max(200).default(100),
  offset: z.number().int().min(0).max(1000000).default(0),
};
// Transfers: full detail for the dual-approval M01<->M02 flow. Cost-free.
export const nativeTransferDetailQuery = z.object({ store, transferId: id }).strict();
export const nativeTransferDetailResult = z
  .object({
    source: z.literal("SERVER"),
    store,
    transfer: z
      .object({
        id,
        sourceStore: store,
        destinationStore: store,
        stage: z.enum([
          "DRAFT",
          "APPROVALS",
          "DISPATCH",
          "IN_TRANSIT",
          "RECEIPT",
          "COMPLETED",
          "POLICY_BLOCKED",
        ]),
      })
      .strict(),
    lines: z
      .array(
        z
          .object({
            itemId: z.string(),
            kind: z.enum(["phone", "accessory"]),
            quantity: z.number().int().min(1),
            code: z.string(),
          })
          .strict(),
      )
      .max(100),
    approvals: z.array(
      z.object({ approval: z.enum(["SUPER_ADMIN", "M02_MANAGER"]), actorId: z.string() }).strict(),
    ),
    dispatch: z
      .object({ actorId: z.string(), evidence: z.string(), carrier: z.string().optional() })
      .strict()
      .nullable(),
    discrepancies: z
      .array(
        z
          .object({
            itemId: z.string(),
            quantity: z.number().int().positive(),
            kind: z.enum(["MISSING", "DAMAGED"]),
            outcome: z.enum(["RETURN", "WRITE_OFF"]).nullable(),
          })
          .strict(),
      )
      .optional(),
    receipt: z.object({ actorId: z.string(), evidence: z.string() }).strict().nullable(),
    cancellation: z
      .object({ actorId: z.string(), reason: z.string() })
      .strict()
      .nullable()
      .optional(),
  })
  .strict();
export type NativeTransferDetailResult = z.infer<typeof nativeTransferDetailResult>;
// SAV: service cases with append-only events. Refund/exchange stay POLICY_BLOCKED.
export const nativeSavQuery = z
  .object({ store, ...page, search: z.string().trim().max(80).optional() })
  .strict();
export const nativeSavResult = z
  .object({
    source: z.literal("SERVER"),
    store,
    cases: z
      .array(
        z
          .object({
            id,
            saleId: z.string(),
            soldAt: z.number().nullable().optional(),
            daysSinceSale: z.number().nullable().optional(),
            tracking: z
              .array(
                z
                  .object({ status: z.string(), note: z.string(), paidRepairNeeded: z.number() })
                  .strict(),
              )
              .optional(),
            outcome: z.string().nullable().optional(),
            publicRef: z.string().nullable().optional(),
            warrantyProvider: z.enum(["SHOP", "MANUFACTURER"]).nullable().optional(),
            phoneId: z.string(),
            customerId: z.string(),
            customerName: z.string().nullable(),
            state: z.enum(["INSPECTION", "POLICY_BLOCKED"]),
            issue: z.string(),
            imei1: z.string().nullable(),
            events: z.array(
              z.object({ id: z.string(), actorId: z.string(), note: z.string() }).strict(),
            ),
          })
          .strict(),
      )
      .max(200),
  })
  .strict();
export type NativeSavResult = z.infer<typeof nativeSavResult>;
// Debts: drafts/blocked obligations with repayment drafts. Never collected money.
export const nativeDebtsQuery = z.object({ store, ...page }).strict();
export const nativeDebtsResult = z
  .object({
    source: z.literal("SERVER"),
    store,
    debts: z
      .array(
        z
          .object({
            id,
            customerId: z.string(),
            customerName: z.string().nullable(),
            saleId: z.string(),
            amountMinor: minor,
            state: z.enum(["DRAFT", "POLICY_BLOCKED", "AUTHORIZED", "OPEN", "PAID", "VOID"]),
            balanceMinor: minor.optional(),
            dueDate: z.string().nullable().optional(),
            repayments: z.array(
              z
                .object({
                  id: z.string(),
                  amountMinor: minor,
                  reference: z.string(),
                  state: z.enum(["DRAFT", "POLICY_BLOCKED", "RECORDED", "REVERSED"]),
                })
                .strict(),
            ),
          })
          .strict(),
      )
      .max(200),
  })
  .strict();
export type NativeDebtsResult = z.infer<typeof nativeDebtsResult>;
// Facility: M01-only public-sector salary deduction, bank evidence only.
export const nativeFacilityQuery = z.object({ store: z.literal("M01"), ...page }).strict();
export const nativeFacilityResult = z
  .object({
    source: z.literal("SERVER"),
    store: z.literal("M01"),
    facilities: z
      .array(
        z
          .object({
            id,
            customerId: z.string(),
            customerName: z.string().nullable(),
            employer: z.string(),
            cashPriceMinor: minor,
            contractPriceMinor: minor,
            state: z.enum(["DRAFT", "POLICY_BLOCKED"]),
            installments: z.array(z.object({ month: z.string(), amountMinor: minor }).strict()),
            evidence: z.array(
              z
                .object({
                  id: z.string(),
                  kind: z.enum(["SALARY_DEDUCTION", "BANK_REMITTANCE"]),
                  amountMinor: minor,
                  state: z.enum(["UNVERIFIED"]),
                })
                .strict(),
            ),
          })
          .strict(),
      )
      .max(200),
  })
  .strict();
export type NativeFacilityResult = z.infer<typeof nativeFacilityResult>;
// Expenses: explicit drafts only; categories/profit stay undecided (OD-14).
export const nativeExpensesQuery = z.object({ store, ...page }).strict();
export const nativeExpensesResult = z
  .object({
    source: z.literal("SERVER"),
    store,
    expenses: z
      .array(
        z
          .object({
            id,
            amountMinor: minor,
            evidenceKey: z.string(),
            state: z.enum(["DRAFT", "POLICY_BLOCKED"]),
          })
          .strict(),
      )
      .max(200),
  })
  .strict();
export type NativeExpensesResult = z.infer<typeof nativeExpensesResult>;
// Standalone receipt provenance correction (owner-only, append-only).
export const nativeStandaloneCorrection = z
  .object({
    key: z.string().min(16).max(160),
    store,
    receiptId: z.string().min(1).max(120),
    supplierId: z.string().min(1).max(80).nullable(),
    reason: z.string().trim().min(1).max(500),
  })
  .strict();
