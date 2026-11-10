import { z } from "zod";
import { transactionVersion } from "./transaction-contracts";
const id = z.string().uuid();
const store = z.enum(["M01", "M02"]);
const text = z.string().trim().min(1);
const amount = z.string().regex(/^[0-9]+(\.[0-9]{1,2})?$/);
// Structures are reviewable; these operations MUST NOT be dispatched to a posting RPC.
export const policyBlockedPayloads = {
  "debt.create": z
    .object({ store, customerId: id, saleId: id, amount, authorizationReference: text })
    .strict(),
  "supplier.settlement": z.object({ store, purchaseId: id, amount, bankReference: text }).strict(),
  "facility.bank.allocate": z
    .object({ store: z.literal("M01"), installmentId: id, amount, bankReference: text })
    .strict(),
  "expense.post": z.object({ store, amount, evidenceReference: text, description: text }).strict(),
  "sav.refund": z.object({ store, caseId: id, amount, evidenceReference: text }).strict(),
  "journal.reverse": z
    .object({ store, journalId: id, reason: text, evidenceReference: text })
    .strict(),
  "transfer.dispatch": z.object({ store, transferId: id, evidenceReference: text }).strict(),
  "transfer.receive": z.object({ store, transferId: id, scans: z.array(text).min(1) }).strict(),
} as const;
export const commandCapabilityManifest = {
  version: transactionVersion,
  sourceOnly: [
    "customer.create",
    "phone.intake",
    "accessory.receiving",
    "cash.shift.open",
    "cash.shift.close",
    "pos.checkout",
    "debt.repayment",
    "transfer.approve",
  ],
  blocked: ["cash.movement", ...Object.keys(policyBlockedPayloads)],
  activation: "DISABLED",
} as const;
export function prepareBlockedOperation(
  operation: keyof typeof policyBlockedPayloads,
  payload: unknown,
) {
  policyBlockedPayloads[operation].parse(payload);
  return {
    ok: false as const,
    kind: "POLICY_UNCONFIGURED" as const,
    operation,
    posted: false as const,
  };
}
