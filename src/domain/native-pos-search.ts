import { z } from "zod";
const minor = z.number().int().safe().min(1).nullable();
export const nativePosSearchQuery = z
  .object({
    store: z.enum(["M01", "M02"]),
    search: z.string().trim().max(80).default(""),
    limit: z.number().int().min(1).max(100).default(30),
  })
  .strict();
export const nativePosItem = z
  .object({
    id: z.string(),
    kind: z.enum(["phone", "accessory"]),
    store: z.enum(["M01", "M02"]),
    name: z.string(),
    brand: z.string().nullable().optional(),
    model: z.string().nullable().optional(),
    condition: z.string().nullable().optional(),
    barcode: z.string(),
    quantity: z.number().int().min(0),
    amountMinor: minor,
    imei1: z.string().nullable(),
    imei2: z.string().nullable(),
    serial: z.string().nullable(),
    variant: z.string().nullable(),
  })
  .strict();
export const nativePosSearchResult = z
  .object({
    source: z.literal("SERVER"),
    store: z.enum(["M01", "M02"]),
    items: z.array(nativePosItem),
  })
  .strict();
export type NativePosSearchResult = z.infer<typeof nativePosSearchResult>;
