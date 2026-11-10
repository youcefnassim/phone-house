import { z } from "zod";
const store = z.enum(["M01", "M02"]);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const limit = z.number().int().min(1).max(200).default(50);
const offset = z.number().int().min(0).max(1000000).default(0);

export const nativeCustomerSummary = z
  .object({
    id: z.string(),
    name: z.string(),
    reference: z.string(),
    surname: z.string().nullable(),
    givenName: z.string().nullable(),
    contact: z.string().nullable(),
  })
  .strict();
export type NativeCustomerSummary = z.infer<typeof nativeCustomerSummary>;

export const nativeCustomerSearchQuery = z
  .object({ store, search: z.string().trim().max(80).default(""), limit })
  .strict();
export const nativeCustomerSearchResult = z
  .object({
    source: z.literal("SERVER"),
    store,
    customers: z.array(nativeCustomerSummary),
  })
  .strict();
export type NativeCustomerSearchResult = z.infer<typeof nativeCustomerSearchResult>;

export const nativeSaleLine = z
  .object({
    kind: z.enum(["phone", "accessory"]),
    name: z.string(),
    quantity: z.number().int().min(1),
    unitMinor: z.number().int().min(1),
    imei1: z.string().nullable(),
    serial: z.string().nullable(),
  })
  .strict();
export const nativeSaleSummary = z
  .object({
    id: z.string(),
    soldAt: z.number().int(),
    sellerId: z.string(),
    customerId: z.string().nullable(),
    customerName: z.string().nullable(),
    totalMinor: z.number().int().min(1),
    tender: z.enum(["Cash", "Bank", "Split"]),
    voided: z.number().int().min(0).max(1).optional(),
    lines: z.array(nativeSaleLine),
  })
  .strict();
export type NativeSaleSummary = z.infer<typeof nativeSaleSummary>;

export const nativeCustomerHistoryQuery = z
  .object({ store, customerId: z.string().min(1).max(80), limit })
  .strict();
export const nativeCustomerHistoryResult = z
  .object({
    source: z.literal("SERVER"),
    store,
    customer: nativeCustomerSummary,
    sales: z.array(nativeSaleSummary),
  })
  .strict();
export type NativeCustomerHistoryResult = z.infer<typeof nativeCustomerHistoryResult>;

export const nativeSalesHistoryQuery = z
  .object({
    store,
    from: day.optional(),
    to: day.optional(),
    imei: z
      .string()
      .regex(/^\d{15}$/)
      .optional(),
    customerId: z.string().min(1).max(80).optional(),
    sellerId: z.string().min(1).max(80).optional(),
    tender: z.enum(["Cash", "Bank", "Split"]).optional(),
    limit,
    offset,
  })
  .strict();
export const nativeSalesHistoryResult = z
  .object({
    source: z.literal("SERVER"),
    store,
    sales: z.array(nativeSaleSummary),
    hasMore: z.boolean(),
  })
  .strict();
export type NativeSalesHistoryResult = z.infer<typeof nativeSalesHistoryResult>;

export const nativeCashLedgerQuery = z.object({ store, limit, offset }).strict();
export const nativeShiftSummary = z
  .object({
    id: z.string(),
    sellerId: z.string(),
    state: z.enum(["OPEN", "CLOSED"]),
    openingMinor: z.number().int().min(0),
    countedMinor: z.number().int().min(0).nullable(),
    closedAt: z.number().int().nullable(),
    expectedMinor: z.number().int().min(0).nullable(),
    reviewState: z.enum(["PENDING", "OPTIONAL"]).nullable(),
    reviewOutcome: z.enum(["NO_ISSUE", "FLAGGED"]).nullable(),
  })
  .strict();
export const nativeCashMovement = z
  .object({
    id: z.string(),
    shiftId: z.string(),
    sellerId: z.string(),
    amountMinor: z.number().int(),
    reason: z.string(),
  })
  .strict();
export const nativeCashLedgerResult = z
  .object({
    source: z.literal("SERVER"),
    store,
    shifts: z.array(nativeShiftSummary),
    movements: z.array(nativeCashMovement),
  })
  .strict();
export type NativeCashLedgerResult = z.infer<typeof nativeCashLedgerResult>;
