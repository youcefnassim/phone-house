import { z } from "zod";
export const stockCountResult = z
  .object({
    session: z
      .object({ id: z.string(), month: z.string(), state: z.enum(["OPEN", "SUBMITTED"]) })
      .strict(),
    adjustments: z
      .array(
        z
          .object({
            id: z.string(),
            item_id: z.string(),
            delta: z.number().int(),
            reason: z.string(),
            outcome: z.enum(["PENDING", "OK", "FLAGGED"]),
          })
          .strict(),
      )
      .optional(),
    rows: z.array(
      z
        .object({
          item_id: z.string(),
          kind: z.enum(["phone", "accessory"]),
          counted: z.number().int().min(0),
          expected: z.number().int().min(0).optional(),
          difference: z.number().int().optional(),
          imei: z.string().nullable().optional(),
        })
        .strict(),
    ),
  })
  .strict();
export type StockCountResult = z.infer<typeof stockCountResult>;
export const supplierPayablesResult = z.array(
  z
    .object({
      supplier_id: z.string(),
      name: z.string(),
      cost_minor: z.number().int().safe(),
      paid_minor: z.number().int().safe(),
      balance_minor: z.number().int().safe(),
    })
    .strict(),
);
