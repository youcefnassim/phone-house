import { toCentimes } from "./checkout";
import { membershipSql } from "@/domain/permissions";
import type { AtomicSqlPort, VerifiedIdentity } from "./port";

export class NativeWriteError extends Error {
  constructor(
    public code: string,
    public key?: string,
  ) {
    super(code);
  }
}

/** Read-only explanation of a failed atomic batch. Never resubmits writes. */
export async function diagnoseWrite(
  db: AtomicSqlPort,
  identity: VerifiedIdentity,
  key: string,
  hash: string,
  operation: string,
  payload: Record<string, unknown>,
  now: number,
  checkout = false,
  cause?: unknown,
): Promise<unknown> {
  let code = "OUTCOME_UNKNOWN";
  try {
    const rows = await db.read({
      sql: "SELECT actor_id,payload_hash,state,response_json,transaction_id FROM commands WHERE key=?",
      params: [key],
    });
    const command = rows[0];
    if (command && (command["actor_id"] !== identity.userId || command["payload_hash"] !== hash))
      throw new NativeWriteError("IDEMPOTENCY_CONFLICT", key);
    if (command?.["state"] === "DONE") {
      if (typeof command["response_json"] !== "string") throw new Error("INVALID_RESPONSE");
      const result: unknown = JSON.parse(command["response_json"]);
      if (!result || typeof result !== "object") throw new Error("INVALID_RESPONSE");
      return checkout
        ? { transaction_id: command["transaction_id"], response_json: command["response_json"] }
        : result;
    }
    const session = await db.read({
      sql: "SELECT s.revoked,s.expires_at,a.active FROM sessions s JOIN accounts a ON a.id=s.user_id WHERE s.id=? AND s.user_id=?",
      params: [identity.sessionId ?? null, identity.userId],
    });
    if (
      !session[0] ||
      session[0]["revoked"] !== 0 ||
      session[0]["active"] !== 1 ||
      Number(session[0]["expires_at"]) <= now ||
      identity.expiresAt <= now
    )
      throw new NativeWriteError("SESSION_REVOKED", key);
    const store = String(payload["store"]);
    const membership = await db.read({
      sql: `SELECT role FROM memberships WHERE user_id=? AND ${membershipSql(operation)}`,
      params: [identity.userId, store],
    });
    if (!membership.length) throw new NativeWriteError("FORBIDDEN", key);
    if (operation === "pos.checkout" && Number(payload["creditAmount"] ?? 0) > 0) {
      const allowed = await db.read({
        sql: `SELECT role FROM memberships WHERE user_id=? AND ${membershipSql("credit.checkout")}`,
        params: [identity.userId, store],
      });
      if (!allowed.length) throw new NativeWriteError("FORBIDDEN", key);
    }
    if (operation === "repayment.record") {
      const balance = await db.read({
        sql: `SELECT c.balance_minor FROM credit_balances c JOIN sales s ON s.id=c.sale_id WHERE c.sale_id=? AND s.store_id=?`,
        params: [String(payload["debtId"]), store],
      });
      if (balance[0] && Number(balance[0]["balance_minor"]) < toCentimes(String(payload["amount"])))
        throw new NativeWriteError("OVERPAYMENT", key);
    }
    if (typeof payload["shiftId"] === "string" && operation !== "cash.review") {
      const shift = await db.read({
        sql: "SELECT state FROM shifts WHERE id=? AND store_id=?",
        params: [payload["shiftId"], store],
      });
      if (shift[0]?.["state"] !== "OPEN") throw new NativeWriteError("SHIFT_CLOSED", key);
    }
    if (operation === "sale.void") {
      const sale = (
        await db.read({
          sql: "SELECT sh.state FROM sales s JOIN shifts sh ON sh.id=s.shift_id WHERE s.id=? AND s.store_id=?",
          params: [String(payload["saleId"]), store],
        })
      )[0];
      if (sale?.["state"] !== "OPEN") throw new NativeWriteError("USE_SAV", key);
      if (
        (
          await db.read({
            sql: "SELECT 1 FROM sale_voids WHERE sale_id=?",
            params: [String(payload["saleId"])],
          })
        ).length
      )
        throw new NativeWriteError("SALE_VOIDED", key);
    }
    if (operation === "pos.checkout") {
      const discount = String(payload["discountAmount"] ?? "0");
      const row = (
        await db.read({
          sql: "SELECT value_json FROM app_settings WHERE key='pos.discountLimitDzd'",
          params: [],
        })
      )[0];
      const limit = row ? String(JSON.parse(String(row["value_json"]))) : "";
      if (
        Number(discount) > 0 &&
        (!limit ||
          (!membership.some((m) => m["role"] === "SUPER_ADMIN") &&
            Number(discount) > Number(limit)))
      )
        throw new NativeWriteError("REJECTED", key);

      const quantities = new Map<string, number>();
      for (const raw of (payload["lines"] as Record<string, unknown>[] | undefined) ?? []) {
        const id = String(raw["itemId"]);
        if (raw["kind"] === "phone") {
          const phone = await db.read({
            sql: "SELECT state,store_id FROM phones WHERE id=?",
            params: [id],
          });
          if (phone[0]?.["state"] !== "AVAILABLE" || phone[0]?.["store_id"] !== store)
            throw new NativeWriteError("PHONE_NOT_AVAILABLE", key);
        } else quantities.set(id, (quantities.get(id) ?? 0) + Number(raw["quantity"]));
      }
      for (const [id, quantity] of quantities) {
        const balance = await db.read({
          sql: "SELECT quantity FROM accessory_balances WHERE store_id=? AND item_id=?",
          params: [store, id],
        });
        if (!balance[0] || Number(balance[0]["quantity"]) < quantity)
          throw new NativeWriteError("INSUFFICIENT_STOCK", key);
      }
    }
    if (operation === "stock.standalone" || operation === "stock.receive") {
      const seen = new Set<string>();
      for (const phone of (payload["phones"] as Record<string, unknown>[] | undefined) ?? []) {
        for (const field of ["imei1", "imei2", "serial", "barcode"]) {
          const value = phone[field];
          if (typeof value !== "string" || !value) continue;
          const token = `${field.startsWith("imei") ? "imei" : field}:${value}`;
          if (seen.has(token)) throw new NativeWriteError("DUPLICATE_IDENTIFIER", key);
          seen.add(token);
          const found = await db.read({
            sql: field.startsWith("imei")
              ? "SELECT phone_id FROM phone_identifiers WHERE identifier=?"
              : `SELECT id FROM phones WHERE ${field}=?`,
            params: [value],
          });
          if (found.length) throw new NativeWriteError("DUPLICATE_IDENTIFIER", key);
        }
      }
    }
    if (operation.startsWith("transfer.") && typeof payload["transferId"] === "string")
      await diagnoseTransfer(db, identity.userId, operation, payload, key);
    code = command
      ? "OUTCOME_UNKNOWN"
      : isDeterministicRejection(cause)
        ? "REJECTED"
        : "NOT_RECORDED";
  } catch (error) {
    if (error instanceof NativeWriteError) throw error;
    throw new NativeWriteError("OUTCOME_UNKNOWN", key);
  }
  throw new NativeWriteError(code, key);
}

/** Constraint/trigger failures are deterministic business rejections, never retryable. */
export function isDeterministicRejection(cause: unknown) {
  const e = (cause ?? {}) as { message?: unknown; errstr?: unknown; cause?: { message?: unknown } };
  const text = `${String(e.message ?? cause ?? "")} ${String(e.errstr ?? "")} ${String(e.cause?.message ?? "")}`;
  return (
    /constraint|SQLITE_CONSTRAINT/i.test(text) ||
    triggerMessages.some((message) => text.includes(message))
  );
}
/** RAISE(ABORT, ...) messages declared by db/sqlite triggers. */
const triggerMessages = [
  "DRAWER_SCOPE",
  "REPAYMENT_CAP",
  "SHIFT_CLOSED",
  "APPEND_ONLY",
  "APPROVER_ROLE",
  "DEBT_SALE_PROVENANCE",
  "RECEIPT_CAP_OR_AUTHORIZATION",
  "SAV_SALE_PROVENANCE",
  "SOURCE_SCOPE",
  "IMMUTABLE_CLOSE",
];

async function diagnoseTransfer(
  db: AtomicSqlPort,
  actor: string,
  operation: string,
  payload: Record<string, unknown>,
  key: string,
) {
  const id = String(payload["transferId"]);
  const transfer = (
    await db.read({ sql: "SELECT stage FROM transfers WHERE id=?", params: [id] })
  )[0];
  const stage = transfer?.["stage"];
  const fail = (code: string) => {
    throw new NativeWriteError(code, key);
  };
  if (!transfer) fail("TRANSFER_STATE");
  const approvals = await db.read({
    sql: "SELECT approval,actor_id FROM transfer_approvals WHERE transfer_id=?",
    params: [id],
  });
  if (operation === "transfer.approve") {
    if (approvals.some((a) => a["actor_id"] === actor)) fail("SAME_PERSON");
    if (stage !== "APPROVALS" || approvals.some((a) => a["approval"] === payload["approval"]))
      fail("TRANSFER_STATE");
  }
  if (operation === "transfer.scan" && stage !== "APPROVALS" && stage !== "IN_TRANSIT")
    fail("TRANSFER_STATE");
  if (operation === "transfer.dispatch" || operation === "transfer.receive") {
    const dispatch = operation === "transfer.dispatch";
    if (!dispatch) {
      const sent = await db.read({
        sql: "SELECT actor_id FROM transfer_dispatches WHERE transfer_id=?",
        params: [id],
      });
      if (sent[0]?.["actor_id"] === actor) fail("SAME_PERSON");
    }
    if (stage !== (dispatch ? "APPROVALS" : "IN_TRANSIT") || approvals.length !== 2)
      fail("TRANSFER_STATE");
    const missing = await db.read({
      sql: "SELECT 1 FROM transfer_lines l LEFT JOIN transfer_scans s ON s.transfer_id=l.transfer_id AND s.item_id=l.item_id WHERE l.transfer_id=? AND(s.item_id IS NULL OR s.code<>l.code OR s.quantity<>l.quantity)",
      params: [id],
    });
    const partial =
      !dispatch &&
      (
        await db.read({
          sql: "SELECT 1 FROM transfer_dispatches WHERE transfer_id=? AND carrier<>''",
          params: [id],
        })
      ).length > 0;
    if (missing.length && !partial) fail("TRANSFER_STATE");
  }
}

/** Validation happens before a batch, so it cannot be an unknown write outcome. */
export function validatedPlan<T>(plan: () => T): T {
  try {
    return plan();
  } catch {
    throw new NativeWriteError("VALIDATION");
  }
}
