import { z } from "zod";
const money = z.number().int().safe();
const store = z.enum(["M01", "M02"]);
export const ownerDashboardResult = z
  .object({
    source: z.literal("SERVER"),
    day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    sales: z.array(
      z.object({ store, count: z.number().int().nonnegative(), amountMinor: money }).strict(),
    ),
    drawers: z.array(z.object({ store, id: z.string(), amountMinor: money }).strict()),
    lowStock: z.array(
      z
        .object({
          store,
          id: z.string(),
          name: z.string(),
          quantity: z.number().int(),
          threshold: z.number().int(),
        })
        .strict(),
    ),
    lateCredits: z.array(
      z.object({ store, id: z.string(), due: z.string(), balanceMinor: money }).strict(),
    ),
    waiting: z.array(
      z
        .object({
          store,
          id: z.string(),
          kind: z.enum(["cash", "approval", "dispatch", "adjustment", "discrepancy", "sav"]),
          countId: z.string().nullable(),
        })
        .strict(),
    ),
  })
  .strict();
export type OwnerDashboardResult = z.infer<typeof ownerDashboardResult>;
