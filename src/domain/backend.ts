import { z } from "zod";
import { idempotencyKeySchema } from "./command-primitives";
import { productionOperationalSchema } from "./production-reads";
import {
  transactionPayloads,
  transactionEnvelope,
  transactionVersion,
} from "./transaction-contracts";

// Browser-safe shapes only. Identity and privileges are never request inputs.
export const commandPayloads = transactionPayloads;
export type BackendCommand = keyof typeof commandPayloads;
export type CommandInput<K extends BackendCommand> = {
  contractVersion: typeof transactionVersion;
  idempotencyKey: string;
  clientRequestId: string;
  payload: z.input<(typeof commandPayloads)[K]>;
};
export const commandEnvelope = transactionEnvelope;
export const postedResultSchema = z
  .object({
    ok: z.literal(true),
    transactionId: z.string().uuid(),
    idempotencyKey: idempotencyKeySchema,
    replayed: z.boolean(),
    data: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])),
  })
  .strict();
export const commandErrorSchema = z.discriminatedUnion("kind", [
  z
    .object({
      ok: z.literal(false),
      kind: z.literal("VALIDATION"),
      issues: z.array(z.object({ path: z.string(), message: z.string() }).strict()),
      retrySafe: z.literal(false),
    })
    .strict(),
  z
    .object({
      ok: z.literal(false),
      kind: z.literal("AUTHORIZATION"),
      reason: z.string(),
      retrySafe: z.literal(false),
    })
    .strict(),
  z
    .object({
      ok: z.literal(false),
      kind: z.literal("CONFLICT"),
      reason: z.string(),
      retrySafe: z.boolean(),
    })
    .strict(),
  z
    .object({
      ok: z.literal(false),
      kind: z.literal("RETRYABLE"),
      reason: z.string(),
      retrySafe: z.literal(true),
    })
    .strict(),
  z
    .object({
      ok: z.literal(false),
      kind: z.literal("BACKEND_UNAVAILABLE"),
      reason: z.string(),
      retrySafe: z.literal(true),
    })
    .strict(),
  z
    .object({
      ok: z.literal(false),
      kind: z.literal("BACKEND_ERROR"),
      reason: z.string(),
      retrySafe: z.literal(false),
    })
    .strict(),
]);
export const commandResultSchema = z.union([postedResultSchema, commandErrorSchema]);
export type BackendCommandResult = z.infer<typeof commandResultSchema>;

// Production reads deliberately do not reuse session-draft business shapes.
export const operationalSnapshotSchema = productionOperationalSchema;
export const ownerFinanceSchema = z
  .object({
    purchaseId: z.string().uuid(),
    unitCost: z
      .string()
      .regex(/^\d+(\.\d{1,2})?$/)
      .nullable(),
    obligation: z
      .string()
      .regex(/^\d+(\.\d{1,2})?$/)
      .nullable(),
    paid: z.string().regex(/^\d+(\.\d{1,2})?$/),
  })
  .strict();
