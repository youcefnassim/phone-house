import { z } from "zod";
const nullableText = z.string().nullable();
export const nativeReceiptQuery = z
  .object({ id: z.string().min(1).max(80), store: z.enum(["M01", "M02"]) })
  .strict();
export const nativeReceipt = z
  .object({
    specimen: z.literal(1),
    saleId: z.string(),
    invoiceNumber: z.string().nullable().optional(),
    publicRef: z.string().nullable().optional(),
    store: z.enum(["M01", "M02"]),
    operator: z.string(),
    shift: z.string(),
    customerId: nullableText,
    buyer: z
      .object({
        name: z.string(),
        surname: nullableText,
        givenName: nullableText,
        contact: nullableText,
      })
      .strict()
      .nullable(),
    payment: z.enum(["Cash", "Bank", "Split"]),
    creditMinor: z.number().int().nonnegative().optional(),
    dueDate: z.string().nullable().optional(),
    cashMinor: z.number().int().nonnegative().optional(),
    bankMinor: z.number().int().nonnegative().optional(),
    bankMethod: z.enum(["VIREMENT", "CCP_BARIDIMOB"]).nullable().optional(),
    discountMinor: z.number().int().nonnegative().optional(),
    totalMinor: z.number().int().safe().positive(),
    tenderedMinor: z.number().int().safe().nonnegative(),
    changeMinor: z.number().int().safe().nonnegative(),
    bankReference: nullableText,
    soldAt: z.number().int().safe(),
    lines: z
      .array(
        z
          .object({
            itemId: z.string(),
            kind: z.enum(["phone", "accessory"]),
            quantity: z.number().int().positive(),
            unitMinor: z.number().int().safe().positive(),
            name: z.string(),
            reference: z.string(),
            barcode: nullableText,
            serial: nullableText,
            imei1: nullableText,
            imei2: nullableText,
          })
          .strict(),
      )
      .min(1),
    warranties: z.array(
      z
        .object({
          itemId: z.string(),
          requested: z.boolean(),
          provider: z.enum(["SHOP", "MANUFACTURER"]).optional(),
          months: z.union([z.literal(1), z.literal(3), z.literal(6), z.literal(12)]).optional(),
          start: z.string().optional(),
          end: z.string().optional(),
        })
        .strict(),
    ),
  })
  .strict();
export const nativeSupplierLookup = z.array(
  z.object({ id: z.string(), name: z.string() }).strict(),
);
export type NativeReceipt = z.infer<typeof nativeReceipt>;
