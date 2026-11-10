import { z } from "zod";
export const nativeRouteModules = {
  "/": "reports",
  "/waiting": "reports",
  "/pos": "sales",
  "/sales": "sales",
  "/cash": "cash",
  "/stock/phones": "inventory",
  "/stock/accessories": "catalog",
  "/catalog": "catalog",
  "/transfers": "transfers",
  "/customers": "customers",
  "/debts": "debts",
  "/suppliers": "suppliers",
  "/purchases": "purchases",
  "/expenses": "expenses",
  "/facility": "facility",
  "/sav": "sav",
  "/reports": "reports",
  "/users": "users",
  "/audit": "audit",
  "/settings": "settings",
} as const;
export type NativeRoute = keyof typeof nativeRouteModules;
const scalar = z.union([z.string(), z.number().int().safe(), z.null()]);
export const confidentialColumn = /cost|margin|profit|obligation|cogs|object_key/i;
export const nativeProjection = z
  .object({
    module: z.enum([
      "inventory",
      "catalog",
      "purchases",
      "suppliers",
      "customers",
      "sales",
      "cash",
      "transfers",
      "debts",
      "facility",
      "sav",
      "expenses",
      "reports",
      "documents",
      "audit",
      "users",
      "settings",
    ]),
    source: z.literal("SERVER"),
    rows: z.array(z.record(scalar)),
    page: z
      .object({
        limit: z.number().int().min(1).max(100),
        offset: z.number().int().min(0),
        hasMore: z.boolean(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((p, ctx) => {
    for (const row of p.rows)
      for (const key of Object.keys(row))
        if (confidentialColumn.test(key))
          ctx.addIssue({
            code: "custom",
            message: "Confidential column in operational projection",
          });
  });
export type NativeProjection = z.infer<typeof nativeProjection>;
export type NativeState =
  | { state: "NOT_CONNECTED" | "UNAUTHORIZED" | "FORBIDDEN" | "ERROR" }
  | { state: "READY"; projection: NativeProjection };
// Owner-only confidential projection; separate DTO, never merged into operational rows.
export const ownerFinanceProjection = z
  .object({
    source: z.literal("SERVER"),
    confidential: z.literal(true),
    rows: z.array(
      z
        .object({
          purchase_id: z.string(),
          cost_minor: z.number().int().safe().nullable(),
          obligation_minor: z.number().int().safe().nullable(),
        })
        .strict(),
    ),
  })
  .strict();
export type OwnerFinanceProjection = z.infer<typeof ownerFinanceProjection>;
export interface NativePageQuery {
  limit: number;
  offset: number;
  search?: string | undefined;
}
