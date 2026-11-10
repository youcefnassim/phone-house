import { z } from "zod";
import {
  commandEnvelope,
  commandPayloads,
  commandResultSchema,
  operationalSnapshotSchema,
  ownerFinanceSchema,
  type BackendCommand,
} from "@/domain/backend";
import type { Scope } from "@/domain/erp";
import { parsePostedCommand } from "@/domain/command-results";
import { inventoryReadSchema } from "@/domain/inventory-contracts";

// INACTIVE preparation: no route, createServerFn, environment read, client
// construction or connection. Supply context.supabase after activation.
// An adapter implementing this port must call Auth getUser (not getSession),
// and RPC using the SAME authenticated user's client. Never supabaseAdmin.
export interface UserBoundPostgresPort {
  getVerifiedUser(): Promise<{ id: string } | null>;
  rpc(
    name: string,
    args: Record<string, unknown>,
  ): Promise<{ data: unknown; error: { code?: string } | null }>;
}
const scopeSchema = z.enum(["ALL", "M01", "M02"]);
const rpcNames: Record<BackendCommand, string> = {
  "transfer.approve": "command_transfer_approve",
  "customer.create": "command_customer_create",
  "supplier.create": "command_supplier_create",
  "sav.case.create": "command_sav_case_create",
  "sav.event.record": "command_sav_event_record",
  "phone.intake": "command_phone_intake",
  "accessory.receiving": "command_accessory_receiving",
  "pos.checkout": "command_pos_checkout",
  "cash.shift.open": "command_cash_shift_open",
  "cash.movement": "command_cash_movement",
  "cash.shift.close": "command_cash_shift_close",
  "debt.repayment": "command_debt_repayment",
};
export type GatewayFailure =
  | "AUTHORIZATION"
  | "VALIDATION"
  | "CONFLICT"
  | "RETRYABLE"
  | "BACKEND_UNAVAILABLE"
  | "BACKEND_ERROR";
export function classifySqlError(code?: string): GatewayFailure {
  if (code === "42501" || code === "PGRST301") return "AUTHORIZATION";
  if (code?.startsWith("22") || code === "23502") return "VALIDATION";
  if (code === "23505" || code === "23514" || code === "23503") return "CONFLICT";
  if (code === "40001" || code === "40P01") return "RETRYABLE";
  if (code?.startsWith("08") || code === "57P01" || code === "PGRST000")
    return "BACKEND_UNAVAILABLE";
  return "BACKEND_ERROR";
}
export class GatewayError extends Error {
  constructor(readonly kind: GatewayFailure) {
    super(kind);
  }
}
export function prepareAuthenticatedGateway(client: UserBoundPostgresPort) {
  async function call(name: string, args: Record<string, unknown>) {
    const user = await client.getVerifiedUser();
    if (!user) throw new GatewayError("AUTHORIZATION");
    const result = await client.rpc(name, args);
    if (result.error) throw new GatewayError(classifySqlError(result.error.code));
    return result.data;
  }
  function readDto<T>(schema: z.ZodType<T>, value: unknown): T {
    const parsed = schema.safeParse(value);
    if (!parsed.success) throw new GatewayError("BACKEND_ERROR");
    return parsed.data;
  }
  return {
    // Unsupported resource reads must never masquerade as authoritative empty data.
    async readCapability(resource: "expenses" | "transfers" | "catalog-write") {
      if (!(await client.getVerifiedUser())) throw new GatewayError("AUTHORIZATION");
      return { resource, status: "UNIMPLEMENTED_POLICY_BLOCKED" as const, data: null };
    },
    async readInventory(input: { scope: Scope }) {
      return readDto(
        inventoryReadSchema,
        await call("read_inventory_snapshot", { requested_scope: scopeSchema.parse(input.scope) }),
      );
    },
    async readOperational(input: { scope: Scope }) {
      return readDto(
        operationalSnapshotSchema,
        await call("read_operational_snapshot", {
          requested_scope: scopeSchema.parse(input.scope),
        }),
      );
    },
    async execute(input: { operation: BackendCommand; request: unknown }) {
      try {
        const schema = commandPayloads[input.operation];
        if (!schema) throw new Error("Unknown operation");
        const request = commandEnvelope.parse(input.request);
        const payload = schema.parse(request.payload);
        // Entire command, audit and idempotency commit in ONE PostgreSQL RPC.
        // The RPC must resolve role, store, seller, price and balances itself.
        let response: unknown;
        try {
          response = await call(rpcNames[input.operation], { request: { ...request, payload } });
        } catch (error) {
          // A lost/undecodable response may follow a committed transaction.
          // Reconcile using this same key; never replace it or claim rollback.
          if (
            error instanceof GatewayError &&
            ["BACKEND_UNAVAILABLE", "BACKEND_ERROR"].includes(error.kind)
          ) {
            return {
              ok: false as const,
              kind: "BACKEND_ERROR" as const,
              reason: "TRANSPORT_OUTCOME_UNKNOWN_RETAIN_IDEMPOTENCY_KEY",
              retrySafe: false as const,
            };
          }
          throw error;
        }
        try {
          const posted = parsePostedCommand(input.operation, response);
          if (posted.idempotencyKey !== request.idempotencyKey)
            throw new Error("Response key mismatch");
          return posted;
        } catch {
          // The RPC may already have committed. Never report this as rejected input
          // or encourage a new-key resubmission; outcome requires same-key readback.
          return {
            ok: false as const,
            kind: "BACKEND_ERROR" as const,
            reason: "RESPONSE_CONTRACT_INVALID_OUTCOME_UNKNOWN_RETAIN_IDEMPOTENCY_KEY",
            retrySafe: false as const,
          };
        }
      } catch (error) {
        if (error instanceof z.ZodError)
          return {
            ok: false as const,
            kind: "VALIDATION" as const,
            issues: error.issues.map((i) => ({
              path: i.path.join("."),
              message: "Invalid command input",
            })),
            retrySafe: false as const,
          };
        if (!(error instanceof GatewayError)) throw error;
        if (error.kind === "VALIDATION")
          return {
            ok: false as const,
            kind: "VALIDATION" as const,
            issues: [{ path: "payload", message: "Invalid command input" }],
            retrySafe: false as const,
          };
        return commandResultSchema.parse({
          ok: false,
          kind: error.kind,
          reason: error.kind,
          retrySafe: error.kind === "RETRYABLE" || error.kind === "BACKEND_UNAVAILABLE",
        });
      }
    },
    async readOwnerFinance(input: { purchaseId: string }) {
      const id = z.string().uuid().parse(input.purchaseId);
      const rows = await call("owner_purchase_finance", { _purchase_id: id });
      const row = z
        .array(
          z
            .object({
              purchase_id: z.string().uuid(),
              unit_cost: z.string().nullable(),
              obligation: z.string().nullable(),
              paid: z.string(),
            })
            .strict(),
        )
        .max(1)
        .safeParse(rows);
      if (!row.success) throw new GatewayError("BACKEND_ERROR");
      const finance = row.data[0];
      if (!finance) return null;
      if (finance.purchase_id !== id) throw new GatewayError("BACKEND_ERROR");
      return readDto(ownerFinanceSchema, {
        purchaseId: finance.purchase_id,
        unitCost: finance.unit_cost,
        obligation: finance.obligation,
        paid: finance.paid,
      });
    },
  };
}
