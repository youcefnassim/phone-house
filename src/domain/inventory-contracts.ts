import { z } from "zod";

const id = z.string().uuid();
const text = z.string().trim().min(1);
export const phoneDetailsSchema = z
  .object({
    color: text,
    storage: text,
    batteryHealth: z.number().min(0).max(100).nullable(),
    conditionRemarks: z.string(),
  })
  .strict();
export type InventoryRead = z.infer<typeof inventoryReadSchema>;
export const catalogModelSchema = z.object({ id, brandId: id, name: text }).strict();
export const phoneVariantSchema = z
  .object({ id, modelId: id, color: text, storage: text })
  .strict();
export const accessoryVariantSchema = z
  .object({
    id,
    categoryId: id,
    sku: text,
    name: text,
    color: z.string().nullable(),
    variant: text,
  })
  .strict();
export const physicalPhoneSchema = phoneDetailsSchema
  .extend({
    id,
    modelId: id,
    variantId: id,
    brandId: id,
    store: z.enum(["M01", "M02"]),
    imei1: z.string().regex(/^[0-9]{15}$/),
    imei2: z
      .string()
      .regex(/^[0-9]{15}$/)
      .nullable(),
    serial: z.string().nullable(),
    barcode: text,
    condition: z.enum(["NEW", "USED"]),
    packaging: z.enum(["SEALED", "OPEN_BOX", "NO_BOX"]),
    salePrice: z.string().regex(/^[0-9]+(\.[0-9]{1,2})?$/),
    status: z.enum(["AVAILABLE", "SOLD", "IN_TRANSIT", "RETURNED"]),
    receiptId: id,
  })
  .strict();
export const inventoryReadSchema = z
  .object({
    phones: z.array(physicalPhoneSchema),
    accessories: z.array(
      z
        .object({
          store: z.enum(["M01", "M02"]),
          skuId: id,
          quantity: z.number().int().nonnegative(),
        })
        .strict(),
    ),
    receipts: z.array(
      z
        .object({
          id,
          purchaseId: id,
          store: z.enum(["M01", "M02"]),
          quantity: z.number().int().positive(),
          receivedBy: id,
          reference: text,
        })
        .strict(),
    ),
    shifts: z.array(
      z
        .object({
          id,
          store: z.enum(["M01", "M02"]),
          drawerId: id,
          state: z.enum(["OPEN", "CLOSED"]),
        })
        .strict(),
    ),
  })
  .strict();
