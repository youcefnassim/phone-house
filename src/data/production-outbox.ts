import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import { z } from "zod";
import {
  commandEnvelope,
  commandPayloads,
  type BackendCommand,
  type BackendCommandResult,
} from "@/domain/backend";
import { parsePostedCommand } from "@/domain/command-results";

const bindingSchema = z
  .object({
    projectRef: z.string().regex(/^[a-z0-9]{20}$/),
    userId: z.string().uuid(),
    deviceId: z.string().uuid(),
    store: z.enum(["M01", "M02"]),
  })
  .strict();
export type OutboxBinding = z.infer<typeof bindingSchema>;
export type OutboxState =
  | "POLICY_BLOCKED"
  | "PENDING"
  | "SYNCING"
  | "OUTCOME_UNKNOWN"
  | "CONFLICT"
  | "AUTH_BLOCKED"
  | "REJECTED"
  | "CONFIRMED";
export interface OutboxRecord {
  key: string;
  binding: OutboxBinding;
  operation: BackendCommand;
  request: unknown;
  state: OutboxState;
  createdAt: string;
  leaseUntil: number;
  attempts: number;
  transactionId: string | null;
  reason: string | null;
}
interface OutboxDatabase extends DBSchema {
  commands: { key: string; value: OutboxRecord };
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
      .join(",")}}`;
  return JSON.stringify(value) ?? "null";
}
const sameBinding = (a: OutboxBinding, b: OutboxBinding) => canonical(a) === canonical(b);
export interface VerifiedReplayPort {
  // Must revalidate Auth and approved device/offline policy on the server.
  // Browser bindings are routing constraints, not authenticated identities.
  authorize(
    binding: OutboxBinding,
  ): Promise<{ authenticated: boolean; devicePolicyApproved: boolean }>;
  execute(operation: BackendCommand, request: unknown): Promise<BackendCommandResult>;
}
export function createProductionOutbox(databaseName = "phonehouse-production-outbox-v1") {
  let database: Promise<IDBPDatabase<OutboxDatabase>> | undefined;
  const db = () =>
    (database ??= openDB<OutboxDatabase>(databaseName, 1, {
      upgrade(database) {
        database.createObjectStore("commands", { keyPath: "key" });
      },
    }));
  return {
    async enqueue(
      bindingInput: OutboxBinding,
      operation: BackendCommand,
      input: unknown,
    ): Promise<OutboxRecord> {
      const binding = bindingSchema.parse(bindingInput);
      const envelope = commandEnvelope.parse(input);
      const payload = commandPayloads[operation].parse(envelope.payload);
      if (payload.store !== binding.store) throw new Error("STORE_BINDING_CONFLICT");
      const request = { ...envelope, payload };
      const database = await db();
      const tx = database.transaction("commands", "readwrite");
      const existing = await tx.store.get(envelope.idempotencyKey);
      if (existing) {
        if (
          !sameBinding(existing.binding, binding) ||
          existing.operation !== operation ||
          canonical(existing.request) !== canonical(request)
        ) {
          tx.abort();
          await tx.done.catch(() => undefined);
          throw new Error("IDEMPOTENCY_BINDING_CONFLICT");
        }
        await tx.done;
        return structuredClone(existing);
      }
      const record: OutboxRecord = {
        key: envelope.idempotencyKey,
        binding,
        operation,
        request,
        state: "POLICY_BLOCKED",
        createdAt: new Date().toISOString(),
        leaseUntil: 0,
        attempts: 0,
        transactionId: null,
        reason: "OFFLINE_DEVICE_POLICY_UNAPPROVED",
      };
      await tx.store.add(record);
      await tx.done;
      return structuredClone(record);
    },
    async list(bindingInput: OutboxBinding) {
      const binding = bindingSchema.parse(bindingInput);
      return (await (await db()).getAll("commands")).filter((row) =>
        sameBinding(row.binding, binding),
      );
    },
    async replay(
      key: string,
      bindingInput: OutboxBinding,
      port: VerifiedReplayPort,
      now = Date.now(),
    ): Promise<OutboxRecord> {
      const binding = bindingSchema.parse(bindingInput);
      const database = await db();
      const initial = await database.get("commands", key);
      if (!initial || !sameBinding(initial.binding, binding))
        throw new Error("OUTBOX_BINDING_DENIED");
      if (
        initial.state === "CONFIRMED" ||
        initial.state === "CONFLICT" ||
        initial.state === "REJECTED"
      )
        return initial;
      const authorization = await port.authorize(binding);
      const tx = database.transaction("commands", "readwrite");
      const current = await tx.store.get(key);
      if (!current || !sameBinding(current.binding, binding)) {
        tx.abort();
        await tx.done.catch(() => undefined);
        throw new Error("OUTBOX_BINDING_DENIED");
      }
      if (
        current.state === "CONFIRMED" ||
        current.state === "CONFLICT" ||
        current.state === "REJECTED" ||
        (current.state === "SYNCING" && current.leaseUntil > now)
      ) {
        await tx.done;
        return current;
      }
      if (!authorization.authenticated || !authorization.devicePolicyApproved) {
        current.state = authorization.authenticated ? "POLICY_BLOCKED" : "AUTH_BLOCKED";
        current.reason = authorization.authenticated
          ? "OFFLINE_DEVICE_POLICY_UNAPPROVED"
          : "AUTHENTICATION_REQUIRED";
        await tx.store.put(current);
        await tx.done;
        return current;
      }
      current.state = "SYNCING";
      current.leaseUntil = now + 60000;
      current.attempts += 1;
      current.reason = null;
      await tx.store.put(current);
      await tx.done;
      // Never keep a database transaction open over network work. A lease limits
      // concurrent tabs; server idempotency, not IndexedDB, prevents double posting.
      let outcome: Pick<OutboxRecord, "state" | "reason" | "transactionId">;
      try {
        const result = await port.execute(current.operation, structuredClone(current.request));
        if (result.ok) {
          const posted = parsePostedCommand(current.operation, result);
          if (posted.idempotencyKey !== key) throw new Error("RESPONSE_KEY_MISMATCH");
          outcome = { state: "CONFIRMED", transactionId: posted.transactionId, reason: null };
        } else {
          const state: OutboxState =
            result.kind === "AUTHORIZATION"
              ? "AUTH_BLOCKED"
              : result.kind === "CONFLICT"
                ? "CONFLICT"
                : result.kind === "VALIDATION"
                  ? "REJECTED"
                  : "OUTCOME_UNKNOWN";
          outcome = { state, transactionId: null, reason: result.kind };
        }
      } catch {
        outcome = {
          state: "OUTCOME_UNKNOWN",
          transactionId: null,
          reason: "RETAIN_ORIGINAL_KEY_AND_PAYLOAD",
        };
      }
      const finish = database.transaction("commands", "readwrite");
      const row = await finish.store.get(key);
      if (!row) {
        finish.abort();
        await finish.done.catch(() => undefined);
        throw new Error("OUTBOX_RECORD_MISSING");
      }
      // A stale lease response cannot overwrite a later attempt's outcome.
      if (row.attempts === current.attempts && row.state === "SYNCING") {
        Object.assign(row, outcome, { leaseUntil: 0 });
        await finish.store.put(row);
      }
      await finish.done;
      return row;
    },
    async recover(now = Date.now()) {
      const database = await db();
      const tx = database.transaction("commands", "readwrite");
      for (const row of await tx.store.getAll())
        if (row.state === "SYNCING" && row.leaseUntil <= now) {
          row.state = "OUTCOME_UNKNOWN";
          row.reason = "INTERRUPTED_REPLAY_RETAIN_KEY";
          row.leaseUntil = 0;
          await tx.store.put(row);
        }
      await tx.done;
    },
    async close() {
      if (database) {
        (await database).close();
        database = undefined;
      }
    },
  };
}
