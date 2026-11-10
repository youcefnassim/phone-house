import { z } from "zod";
import { phoneDetailsSchema } from "./inventory-contracts";
const store = z.enum(["M01", "M02"]);
const id = z.string().uuid();
const text = z.string().trim().min(1);
export const exactMoney = z.string().regex(/^[0-9]+(\.[0-9]{1,2})?$/);
// Preserve generic exact decimal parsing; authoritative money inputs must fit
// PostgreSQL NUMERIC(14,2), with no float conversion or rounding.
export const databaseMoney = exactMoney.refine((v) => {
  const [whole = "0", fraction = ""] = v.split(".");
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0")) <= 99999999999999n;
}, "Amount exceeds NUMERIC(14,2)");
const positive = databaseMoney.refine(
  (v) => BigInt(v.replace(".", "").replace(/^0+/, "") || "0") > 0n,
);
const quantity = z
  .string()
  .regex(/^[1-9][0-9]*$/)
  .refine((v) => BigInt(v) <= 2147483647n);
export const transactionVersion = "2026-11-review08" as const;
export const transactionPayloads = {
  "transfer.approve": z
    .object({ store, transferId: id, approval: z.enum(["SUPER_ADMIN", "M02_MANAGER"]) })
    .strict(),
  "customer.create": z
    .object({
      store,
      name: text,
      contact: text,
      reference: text,
      address: z.string().optional(),
      notes: z.string().optional(),
    })
    .strict(),
  "supplier.create": z
    .object({
      store,
      name: text,
      contact: text,
      documentReference: text,
      notes: z.string().optional(),
    })
    .strict(),
  "sav.case.create": z
    .object({
      store,
      saleId: id,
      saleLineId: id,
      customerId: id,
      imei: z.string().regex(/^[0-9]{15}$/),
      issue: text,
      requestedAction: text,
      documentReference: text,
      notes: z.string().optional(),
    })
    .strict(),
  "sav.event.record": z.object({ store, caseId: id, note: text, documentReference: text }).strict(),
  "phone.intake": z
    .object({
      store,
      modelId: id,
      variantId: id,
      purchaseId: id,
      supplierId: id,
      imei1: z.string().regex(/^[0-9]{15}$/),
      imei2: z
        .string()
        .regex(/^[0-9]{15}$/)
        .or(z.literal(""))
        .optional(),
      serial: z.string().optional(),
      barcode: text,
      condition: z.enum(["NEW", "USED"]),
      packaging: z.enum(["SEALED", "OPEN_BOX", "NO_BOX"]),
      documentReference: text,
      ...phoneDetailsSchema.shape,
    })
    .strict()
    .refine((v) => !v.imei2 || v.imei2 !== v.imei1, "IMEI slots must differ"),
  "accessory.receiving": z
    .object({ store, skuId: id, purchaseId: id, supplierId: id, quantity, documentReference: text })
    .strict(),
  "cash.shift.open": z.object({ store, drawerId: id, openingFloat: databaseMoney }).strict(),
  "cash.movement": z
    .object({
      store,
      shiftId: id,
      direction: z.enum(["IN", "OUT"]),
      amount: positive,
      reason: text,
      documentReference: text,
    })
    .strict(),
  "cash.shift.close": z
    .object({ store, shiftId: id, countedAmount: databaseMoney, notes: z.string().optional() })
    .strict(),
  "pos.checkout": z
    .object({
      store,
      shiftId: id,
      customerId: id.optional(),
      lines: z
        .array(z.object({ itemId: id, kind: z.enum(["phone", "accessory"]), quantity }).strict())
        .min(1),
      tender: z.enum(["Cash", "Bank", "Split"]),
      tenderedAmount: databaseMoney,
      creditAmount: databaseMoney.optional(),
      dueDate: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
      cashAmount: databaseMoney.optional(),
      bankAmount: databaseMoney.optional(),
      bankMethod: z.enum(["VIREMENT", "CCP_BARIDIMOB"]).optional(),
      discountAmount: databaseMoney.optional(),
      bankReference: z.string().optional(),
    })
    .strict()
    .refine(
      (v) => !v.lines.some((l) => l.kind === "phone") || !!v.customerId,
      "PHONE_CUSTOMER_REQUIRED",
    ),
  "debt.repayment": z
    .object({
      store,
      debtId: id,
      shiftId: id.optional(),
      amount: positive,
      method: z.enum(["Cash", "Bank"]),
      reference: text,
      authorizationReference: text,
    })
    .strict(),
} as const;
export const transactionEnvelope = z
  .object({
    contractVersion: z.literal(transactionVersion),
    idempotencyKey: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9-]{15,79}$/),
    clientRequestId: id,
    payload: z.unknown(),
  })
  .strict();
export const approvedFacilitySchedule = z
  .object({
    contractPrice: positive,
    installments: z
      .array(
        z
          .object({ month: z.string().regex(/^[0-9]{4}-(0[1-9]|1[0-2])$/), amount: positive })
          .strict(),
      )
      .min(1),
  })
  .strict()
  .superRefine((v, ctx) => {
    const minor = (s: string) => {
      const [a, b = ""] = s.split(".");
      return BigInt(a ?? "0") * 100n + BigInt(b.padEnd(2, "0"));
    };
    if (new Set(v.installments.map((i) => i.month)).size !== v.installments.length)
      ctx.addIssue({ code: "custom", message: "Duplicate installment month" });
    if (v.installments.reduce((sum, i) => sum + minor(i.amount), 0n) !== minor(v.contractPrice))
      ctx.addIssue({ code: "custom", message: "Schedule does not equal contract total" });
  });
