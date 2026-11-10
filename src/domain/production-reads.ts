import { z } from "zod";

const id = z.string().uuid();
const store = z.enum(["M01", "M02"]);
const money = z.string().regex(/^\d+(\.\d{1,2})?$/);
const source = z.literal("Database");
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const availability = z.enum(["AVAILABLE", "FORBIDDEN"]);
export const productionOperationalSchema = z
  .object({
    availability: z.object({ sales: availability, repayments: availability }).strict(),
    customers: z.array(
      z
        .object({
          id,
          store,
          name: z.string(),
          contact: z.string(),
          reference: z.string(),
          address: z.string(),
          notes: z.string(),
          source,
        })
        .strict(),
    ),
    sales: z.array(
      z
        .object({ id, customerId: id.nullable(), store, item: z.string(), amount: money, date })
        .strict(),
    ),
    debts: z.array(
      z
        .object({
          id,
          customerId: id,
          store,
          saleReference: id,
          amount: money,
          dueDate: date,
          authorizationReference: z.string(),
          notes: z.string(),
          source,
        })
        .strict(),
    ),
    repayments: z.array(
      z
        .object({
          id,
          subjectId: id,
          source,
          amount: money,
          date,
          method: z.enum(["Cash", "Bank"]),
          reference: z.string(),
          authorizationReference: z.string(),
        })
        .strict(),
    ),
    suppliers: z.array(
      z
        .object({
          id,
          name: z.string(),
          contact: z.string(),
          store,
          documentReference: z.string(),
          notes: z.string(),
          source,
        })
        .strict(),
    ),
    purchases: z.array(
      z
        .object({
          id,
          supplierId: id,
          store,
          kind: z.enum(["Phone", "Accessory"]),
          product: z.string(),
          quantity: z.string().regex(/^[1-9]\d*$/),
          documentReference: z.string(),
          expectedDate: date,
          notes: z.string(),
          source,
        })
        .strict(),
    ),
    expenses: z
      .object({ status: z.literal("UNIMPLEMENTED_POLICY_BLOCKED"), data: z.null() })
      .strict(),
    facilities: z.array(
      z
        .object({
          id,
          customerId: id,
          store: z.literal("M01"),
          employer: z.string(),
          contractReference: z.string(),
          contractPrice: money,
          installments: z.array(
            z
              .object({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/), amount: money })
              .strict(),
          ),
          source,
        })
        .strict(),
    ),
    // Persisted stage is not relabelled as a synthetic Closed draft. History is unavailable, not empty.
    cases: z.array(
      z
        .object({
          id,
          customerId: id,
          store,
          saleReference: id,
          imei: z.string(),
          issue: z.string(),
          requestedAction: z.string(),
          documentReference: z.string(),
          notes: z.string(),
          stage: z.string(),
          history: z
            .object({ status: z.literal("UNIMPLEMENTED_POLICY_BLOCKED"), data: z.null() })
            .strict(),
          source,
        })
        .strict(),
    ),
  })
  .strict()
  .superRefine((value, ctx) => {
    for (const resource of ["sales", "repayments"] as const) {
      if (value.availability[resource] === "FORBIDDEN" && value[resource].length !== 0)
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [resource],
          message: "Forbidden collection must not contain rows",
        });
    }
  });
export type ProductionOperationalSnapshot = z.infer<typeof productionOperationalSchema>;
