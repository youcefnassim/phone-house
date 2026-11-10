import { z } from "zod";
import { transactionPayloads, transactionEnvelope } from "./transaction-contracts";
const buyer = z
  .object({
    surname: z.string().trim().min(1).max(120),
    givenName: z.string().trim().min(1).max(120),
    contact: z.string().trim().max(160).default(""),
  })
  .strict();
export const nativeCheckoutPayload = transactionPayloads["pos.checkout"]
  .innerType()
  .extend({
    buyer: buyer.optional(),
    warranties: z
      .array(
        z
          .object({
            itemId: z.string().uuid(),
            requested: z.boolean(),
            provider: z.enum(["SHOP", "MANUFACTURER"]).optional(),
            months: z.union([z.literal(1), z.literal(3), z.literal(6), z.literal(12)]).optional(),
          })
          .strict(),
      )
      .max(100),
  })
  .strict()
  .superRefine((v, c) => {
    const phones = v.lines.filter((l) => l.kind === "phone");
    if (phones.length && !v.buyer)
      c.addIssue({ code: "custom", message: "PHONE_CUSTOMER_REQUIRED" });
    const credit = v.creditAmount !== undefined && Number(v.creditAmount) > 0;
    if (
      credit &&
      (!v.buyer?.contact.trim() ||
        !v.dueDate ||
        !Number.isFinite(Date.parse(v.dueDate)) ||
        new Date(v.dueDate).toISOString().slice(0, 10) !== v.dueDate)
    )
      c.addIssue({ code: "custom", message: "CREDIT_CUSTOMER_REQUIRED" });
    if (!phones.length && !credit && (v.buyer || v.customerId || v.warranties.length))
      c.addIssue({ code: "custom", message: "ANONYMOUS_ACCESSORIES_ONLY" });
    if (
      v.warranties.length !== phones.length ||
      new Set(v.warranties.map((w) => w.itemId)).size !== phones.length ||
      v.warranties.some(
        (w) =>
          !phones.some((l) => l.itemId === w.itemId) || w.requested !== (w.months !== undefined),
      )
    )
      c.addIssue({ code: "custom", message: "EXPLICIT_WARRANTY_REQUIRED" });
  });
export const nativeCheckoutEnvelope = transactionEnvelope
  .extend({ contractVersion: z.literal("native-pos-2026-11-07"), payload: nativeCheckoutPayload })
  .strict();
export type NativeCheckoutRequest = z.infer<typeof nativeCheckoutEnvelope>;
