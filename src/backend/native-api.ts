import { z } from "zod";
import { nativeModules, type NativeModule, type NativeService } from "./sqlite/service";
import { NativeWriteError } from "./sqlite/write-diagnostics";

// Portable Workers-compatible fetch handler (standard Request/Response only).
// NOT deployed: Lovable does not deploy to Cloudflare. A separately approved host
// constructs the service with a real D1 binding, a verified identity adapter and a
// private R2 port, then calls `handle(request)`. Standalone Worker source is kept
// outside the app graph; no deployed bindings, URLs or credentials exist.
export interface NativeApiConfig {
  /** Explicit same-origin allowlist, e.g. "https://erp.example". No wildcard. */
  allowedOrigin: string;
  /** False until the owner approves a verified host + identity provider. */
  enabled: boolean;
  timeoutMs?: number;
  basePath?: string;
}
export interface NativeApiLog {
  (event: { requestId: string; route: string; status: number; code?: string; ms: number }): void;
}
const store = z.enum(["M01", "M02"]);
const bodies = {
  read: z
    .object({
      module: z.enum(nativeModules),
      store,
      limit: z.number().int().min(1).max(100).default(50),
      offset: z.number().int().min(0).max(1000000).default(0),
      search: z.string().trim().max(80).optional(),
    })
    .strict(),
  outcome: z.object({ key: z.string().regex(/^[A-Za-z0-9-]{16,80}$/) }).strict(),
  finance: z.object({ store }).strict(),
  receipt: z.object({ id: z.string().min(1).max(80), store }).strict(),
  finalize: z.object({ id: z.string().regex(/^[A-Za-z0-9-]{1,80}$/), store }).strict(),
  replay: z
    .object({ deviceId: z.string().regex(/^[A-Za-z0-9-]{1,80}$/), store, envelope: z.unknown() })
    .strict(),
};
const known = [
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "ATOMICITY_UNAVAILABLE",
  "INVALID_DOCUMENT",
  "STALE_DOCUMENT_STATE",
  "UNKNOWN_MODULE",
  "TIMEOUT",
  "SESSION_REVOKED",
  "SHIFT_CLOSED",
  "PHONE_NOT_AVAILABLE",
  "INSUFFICIENT_STOCK",
  "DUPLICATE_IDENTIFIER",
  "IDEMPOTENCY_CONFLICT",
  "VALIDATION",
  "NOT_RECORDED",
  "REJECTED",
  "USE_SAV",
  "SALE_VOIDED",
  "OVERPAYMENT",
  "TRANSFER_STATE",
  "SAME_PERSON",
] as const;
type Code =
  | (typeof known)[number]
  | "BAD_REQUEST"
  | "OUTCOME_UNKNOWN"
  | "METHOD_NOT_ALLOWED"
  | "ORIGIN_REJECTED"
  | "NOT_CONNECTED"
  | "INTERNAL";
const statusFor: Record<Code, number> = {
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  ATOMICITY_UNAVAILABLE: 503,
  INVALID_DOCUMENT: 400,
  STALE_DOCUMENT_STATE: 409,
  UNKNOWN_MODULE: 400,
  TIMEOUT: 504,
  BAD_REQUEST: 400,
  OUTCOME_UNKNOWN: 503,
  METHOD_NOT_ALLOWED: 405,
  ORIGIN_REJECTED: 403,
  NOT_CONNECTED: 503,
  INTERNAL: 500,
  SESSION_REVOKED: 401,
  SHIFT_CLOSED: 409,
  PHONE_NOT_AVAILABLE: 409,
  INSUFFICIENT_STOCK: 409,
  DUPLICATE_IDENTIFIER: 409,
  IDEMPOTENCY_CONFLICT: 409,
  VALIDATION: 422,
  NOT_RECORDED: 503,
  REJECTED: 409,
  USE_SAV: 409,
  SALE_VOIDED: 409,
  OVERPAYMENT: 409,
  TRANSFER_STATE: 409,
  SAME_PERSON: 409,
};

export function createNativeApiHandler(
  service: NativeService | null,
  config: NativeApiConfig,
  log: NativeApiLog = () => {},
) {
  const base = (config.basePath ?? "/api/native").replace(/\/$/, "");
  if (
    !/^https:\/\/[a-z0-9.-]+(:\d+)?$/i.test(config.allowedOrigin) &&
    !/^http:\/\/localhost(:\d+)?$/.test(config.allowedOrigin)
  )
    throw new Error("INVALID_ALLOWED_ORIGIN");
  const json = (status: number, body: unknown, requestId: string) =>
    new Response(JSON.stringify(body), {
      status,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Request-Id": requestId,
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer",
        Vary: "Origin",
      },
    });
  const withTimeout = <T>(p: Promise<T>) => {
    const ms = config.timeoutMs ?? 10000;
    let timer: ReturnType<typeof setTimeout> | undefined;
    return Promise.race([
      p,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("TIMEOUT")), ms);
      }),
    ]).finally(() => clearTimeout(timer));
  };
  return async function handle(request: Request): Promise<Response> {
    const started = Date.now();
    const requestId = crypto.randomUUID();
    const url = new URL(request.url);
    const route = url.pathname.startsWith(`${base}/`) ? url.pathname.slice(base.length + 1) : "";
    const fail = (code: Code, extra: Record<string, unknown> = {}) => {
      const status = statusFor[code];
      log({ requestId, route, status, code, ms: Date.now() - started });
      return json(
        status,
        {
          error: code,
          requestId,
          ...(code === "USE_SAV" || code === "SALE_VOIDED" ? { retryable: false } : {}),
          ...extra,
        },
        requestId,
      );
    };
    const ok = (body: unknown) => {
      log({ requestId, route, status: 200, ms: Date.now() - started });
      return json(200, body, requestId);
    };
    if (
      ![
        "status",
        "owner/dashboard",
        "read",
        "pos/search",
        "daily/resources",
        "settings/read",
        "execute",
        "checkout",
        "receive",
        "receipt",
        "stock/count",
        "suppliers/payables",
        "suppliers/lookup",
        "suppliers/sources",
        "suppliers/history",
        "suppliers/correct",
        "customers/search",
        "customers/history",
        "sales/history",
        "cash/ledger",
        "transfers/detail",
        "sav/cases",
        "individual/purchases",
        "reports/sales",
        "reports/zakat",
        "debts/list",
        "facility/list",
        "expenses/list",
        "suppliers/correct-standalone",
        "outcome",
        "finance",
        "document/finalize",
        "replay",
      ].includes(route)
    )
      return fail("NOT_FOUND");
    // Methods: POST only (status also GET). No CORS preflight is answered: the API
    // is same-origin; cross-origin callers are rejected before any work.
    if (request.method !== "POST" && !(route === "status" && request.method === "GET"))
      return fail("METHOD_NOT_ALLOWED");
    const origin = request.headers.get("Origin");
    if (request.method === "POST" && origin !== config.allowedOrigin)
      return fail("ORIGIN_REJECTED");
    if (
      request.method === "POST" &&
      !(request.headers.get("Content-Type") ?? "").toLowerCase().startsWith("application/json")
    )
      return fail("BAD_REQUEST");
    if (!config.enabled || !service) {
      if (route === "status") return ok({ connected: false, verified: false });
      return fail("NOT_CONNECTED");
    }
    // Bearer transport only (no ambient cookies => no CSRF-able credential).
    const auth = request.headers.get("Authorization") ?? "";
    const credential = /^Bearer [A-Za-z0-9._~+/=-]{16,4096}$/.test(auth) ? auth.slice(7) : null;
    try {
      if (route === "status") {
        if (!credential) return ok({ connected: true, verified: false });
        try {
          const s = await withTimeout(service.session(credential));
          return ok({ connected: true, verified: true, memberships: s.memberships });
        } catch {
          return ok({ connected: true, verified: false });
        }
      }
      if (!credential) return fail("UNAUTHORIZED");
      const raw = await request.text();
      if (raw.length > 262144) return fail("BAD_REQUEST");
      let body: unknown;
      try {
        body = JSON.parse(raw || "{}");
      } catch {
        return fail("BAD_REQUEST");
      }
      if (route === "owner/dashboard") {
        z.object({}).strict().parse(body);
        return ok(await withTimeout(service.ownerDashboard(credential)));
      }
      if (route === "pos/search") return ok(await withTimeout(service.posSearch(credential, body)));
      if (route === "daily/resources")
        return ok(await withTimeout(service.dailyResources(credential, body)));
      if (route === "read") {
        const b = bodies.read.parse(body);
        const rows = await withTimeout(
          service.read(credential, b.module as NativeModule, b.store, {
            limit: b.limit + 1,
            offset: b.offset,
            search: b.search || undefined,
          }),
        );
        return ok({
          module: b.module,
          source: "SERVER",
          rows: rows.slice(0, b.limit),
          page: { limit: b.limit, offset: b.offset, hasMore: rows.length > b.limit },
        });
      }
      if (route === "stock/count") {
        const b = z
          .object({ store: z.enum(["M01", "M02"]), countId: z.string().min(1).max(80) })
          .strict()
          .parse(body);
        return ok(await withTimeout(service.stockCount(credential, b.store, b.countId)));
      }
      if (route === "suppliers/payables") {
        const b = bodies.finance.parse(body);
        return ok(await withTimeout(service.supplierPayables(credential, b.store)));
      }
      if (route === "execute") return ok(await withTimeout(service.execute(credential, body)));
      if (route === "checkout") return ok(await withTimeout(service.checkout(credential, body)));
      if (route === "receive") return ok(await withTimeout(service.receive(credential, body)));
      if (route === "receipt") {
        const b = bodies.receipt.parse(body);
        return ok(await withTimeout(service.receipt(credential, b.id, b.store)));
      }
      if (route === "suppliers/lookup") {
        const b = bodies.finance.parse(body);
        return ok(await withTimeout(service.supplierLookup(credential, b.store)));
      }
      if (route === "suppliers/sources") {
        const b = bodies.finance.parse(body);
        return ok(await withTimeout(service.supplierSources(credential, b.store)));
      }
      if (route === "suppliers/history")
        return ok(await withTimeout(service.supplierHistory(credential, body)));
      if (route === "suppliers/correct")
        return ok(await withTimeout(service.correctSupplier(credential, body)));
      if (route === "customers/search")
        return ok(await withTimeout(service.customerSearch(credential, body)));
      if (route === "customers/history")
        return ok(await withTimeout(service.customerHistory(credential, body)));
      if (route === "sales/history")
        return ok(await withTimeout(service.salesHistory(credential, body)));
      if (route === "settings/read")
        return ok(await withTimeout(service.settings(credential, body)));
      if (route === "cash/ledger")
        return ok(await withTimeout(service.cashLedger(credential, body)));
      if (route === "transfers/detail")
        return ok(await withTimeout(service.transferDetail(credential, body)));
      if (route === "individual/purchases" || route === "reports/zakat") {
        const b = z
          .object({ store: z.enum(["M01", "M02"]) })
          .strict()
          .parse(body);
        if (route === "individual/purchases")
          return ok(await withTimeout(service.individualPurchases(credential, b.store)));
        return ok(await withTimeout(service.zakatSheet(credential, b.store)));
      }
      if (route === "reports/sales")
        return ok(await withTimeout(service.salesReport(credential, body)));
      if (route === "sav/cases") return ok(await withTimeout(service.savCases(credential, body)));
      if (route === "debts/list") return ok(await withTimeout(service.debtList(credential, body)));
      if (route === "facility/list")
        return ok(await withTimeout(service.facilityList(credential, body)));
      if (route === "expenses/list")
        return ok(await withTimeout(service.expenseList(credential, body)));
      if (route === "suppliers/correct-standalone")
        return ok(await withTimeout(service.correctStandaloneSupplier(credential, body)));
      if (route === "outcome") {
        const b = bodies.outcome.parse(body);
        const rows = await withTimeout(service.outcome(credential, b.key));
        const r = rows[0]?.["response_json"];
        return ok(
          typeof r === "string"
            ? { found: true, result: JSON.parse(r) as unknown }
            : { found: false },
        );
      }
      if (route === "finance") {
        const b = bodies.finance.parse(body);
        return ok({
          source: "SERVER",
          confidential: true,
          rows: await withTimeout(service.ownerFinance(credential, b.store)),
        });
      }
      if (route === "document/finalize") {
        const b = bodies.finalize.parse(body);
        return ok(await withTimeout(service.finalizeDocument(credential, b.id, b.store)));
      }
      const b = bodies.replay.parse(body);
      return ok(
        await withTimeout(service.replayOffline(credential, b.deviceId, b.store, b.envelope)),
      );
    } catch (error) {
      if (error instanceof NativeWriteError)
        return fail(error.code as Code, {
          ...(error.key ? { key: error.key } : {}),
          ...(error.code === "NOT_RECORDED" ? { retryable: true } : {}),
        });
      if (error instanceof z.ZodError)
        return fail(
          ["checkout", "execute", "receive"].includes(route) ? "VALIDATION" : "BAD_REQUEST",
        );
      const message = error instanceof Error ? error.message : "";
      if (message.startsWith("OUTCOME_UNKNOWN:"))
        return fail("OUTCOME_UNKNOWN", { key: message.slice(16) });
      const code = (known as readonly string[]).includes(message) ? (message as Code) : "INTERNAL";
      return fail(code);
    }
  };
}
