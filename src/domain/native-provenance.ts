import { z } from "zod";
export const provenanceQuery = z
  .object({
    store: z.enum(["M01", "M02"]),
    limit: z.number().int().min(1).max(100).default(50),
    offset: z.number().int().min(0).max(1000000).default(0),
  })
  .strict();
const review = z
  .object({
    actorId: z.string(),
    reviewedAt: z.number().int().safe(),
    reason: z.string(),
    oldSupplierId: z.string().nullable(),
    newSupplierId: z.string().nullable(),
  })
  .strict();
export const provenanceResult = z
  .object({
    source: z.literal("SERVER"),
    store: z.enum(["M01", "M02"]),
    hasMore: z.boolean(),
    receipts: z
      .array(
        z
          .object({
            id: z.string(),
            kind: z.enum(["PURCHASE_LINKED", "STANDALONE"]),
            itemId: z.string(),
            quantity: z.number().int().positive(),
            receivedAt: z.number().int().safe(),
            actorId: z.string(),
            reference: z.string().nullable(),
            originalSupplierId: z.string().nullable(),
            effectiveSupplierId: z.string().nullable(),
            originalSupplierName: z.string().nullable(),
            reviews: z.array(review),
          })
          .strict(),
      )
      .max(100),
  })
  .strict();
