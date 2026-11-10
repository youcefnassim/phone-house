import { z } from "zod";
import { idempotencyKeySchema } from "./command-primitives";
import type { BackendCommand } from "./backend";
const id = z.string().uuid();
const money = z.string().regex(/^[0-9]+(\.[0-9]{1,2})?$/);
const results = {
  "customer.create": z.object({ customerId: id }).strict(),
  "supplier.create": z.object({ supplierId: id }).strict(),
  "sav.case.create": z.object({ caseId: id, stage: z.literal("Inspection") }).strict(),
  "sav.event.record": z.object({ caseId: id, eventId: id }).strict(),
  "phone.intake": z.object({ phoneId: id, receiptId: id }).strict(),
  "accessory.receiving": z
    .object({ receiptId: id, quantity: z.number().int().positive() })
    .strict(),
  "pos.checkout": z.object({ saleId: id, total: money, change: money }).strict(),
  "cash.shift.open": z.object({ shiftId: id, state: z.literal("OPEN") }).strict(),
  "cash.movement": z.object({ movementId: id }).strict(),
  "cash.shift.close": z
    .object({ shiftId: id, state: z.literal("CLOSED"), countedAmount: money })
    .strict(),
  "debt.repayment": z.object({ repaymentId: id, outstanding: money }).strict(),
  "transfer.approve": z.object({ transferId: id, stage: z.literal("APPROVALS") }).strict(),
} satisfies Record<BackendCommand, z.ZodTypeAny>;
export function parsePostedCommand(operation: BackendCommand, result: unknown) {
  return z
    .object({
      ok: z.literal(true),
      transactionId: id,
      idempotencyKey: idempotencyKeySchema,
      replayed: z.boolean(),
      data: results[operation],
    })
    .strict()
    .parse(result);
}
