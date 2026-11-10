import { z } from "zod";

export const intakeAttributeKeys = [
  "ean",
  "brand",
  "model",
  "condition",
  "category",
  "lowStockThreshold",
  "photoPending",
];
export const nativeDailySettings = z
  .object({ store: z.enum(["M01", "M02"]), settings: z.record(z.unknown()) })
  .strict();
export const nativeDailyQuery = z.object({ store: z.enum(["M01", "M02"]) }).strict();
/** Cost-free receiving catalog and physical drawers, authorized independently of stock. */
export const nativeDailyResources = z
  .object({
    source: z.literal("SERVER"),
    store: z.enum(["M01", "M02"]),
    catalog: z.array(
      z
        .object({
          id: z.string(),
          kind: z.enum(["phone", "accessory"]),
          sku: z.string(),
          name: z.string(),
          barcode: z.string(),
          variant: z.string().nullable(),
          amountMinor: z.number().int().safe().positive().nullable(),
          ean: z.string().optional(),
          brand: z.string().optional(),
          model: z.string().optional(),
          condition: z.string().optional(),
          category: z.string().optional(),
          lowStockThreshold: z.string().optional(),
          photoPending: z.string().optional(),
        })
        .strict(),
    ),
    drawers: z.array(z.object({ id: z.string() }).strict()),
  })
  .strict();
export type NativeDailyResources = z.infer<typeof nativeDailyResources>;
