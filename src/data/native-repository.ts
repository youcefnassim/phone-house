import { stockCountResult, supplierPayablesResult } from "@/domain/stock-count";
import { ownerDashboardResult } from "@/domain/owner-dashboard";
import {
  nativeProjection,
  nativeRouteModules,
  ownerFinanceProjection,
  type NativePageQuery,
  type NativeRoute,
  type NativeState,
  type OwnerFinanceProjection,
} from "@/domain/native-repository";
import { nativeEnvelope, type NativeCommandResult } from "@/domain/native-commands";
import { nativeCheckoutEnvelope } from "@/domain/native-checkout";
import { nativeReceiving } from "@/domain/native-receiving";
import { nativeDailyQuery, nativeDailyResources, nativeDailySettings } from "@/domain/native-daily";
import { resolveSettings } from "@/domain/intake";
import { nativeReceipt, nativeReceiptQuery, nativeSupplierLookup } from "@/domain/native-documents";
import { z } from "zod";
import { provenanceQuery, provenanceResult } from "@/domain/native-provenance";
import {
  nativePosSearchQuery,
  nativePosSearchResult,
  type NativePosSearchResult,
} from "@/domain/native-pos-search";
import {
  nativeCashLedgerQuery,
  nativeCashLedgerResult,
  nativeCustomerHistoryQuery,
  nativeCustomerHistoryResult,
  nativeCustomerSearchQuery,
  nativeCustomerSearchResult,
  nativeSalesHistoryQuery,
  nativeSalesHistoryResult,
  type NativeCashLedgerResult,
  type NativeCustomerHistoryResult,
  type NativeCustomerSearchResult,
  type NativeSalesHistoryResult,
} from "@/domain/native-history";
import {
  nativeDebtsQuery,
  nativeDebtsResult,
  nativeExpensesQuery,
  nativeExpensesResult,
  nativeFacilityQuery,
  nativeFacilityResult,
  nativeSavQuery,
  nativeSavResult,
  nativeStandaloneCorrection,
  nativeTransferDetailQuery,
  nativeTransferDetailResult,
  type NativeDebtsResult,
  type NativeExpensesResult,
  type NativeFacilityResult,
  type NativeSavResult,
  type NativeTransferDetailResult,
} from "@/domain/native-operations";
export interface NativeTransportStatus {
  connected: boolean;
  verified: boolean;
  synthetic?: boolean;
  memberships?: { store: string; role: string }[] | undefined;
}
export interface ProtectedNativeTransport {
  ownerDashboard?(): Promise<unknown>;
  status(): Promise<NativeTransportStatus>;
  read(module: string, store: "M01" | "M02", page?: NativePageQuery): Promise<unknown>;
  execute(command: unknown): Promise<unknown>;
  outcome?(key: string): Promise<unknown>;
  finance?(store: "M01" | "M02"): Promise<unknown>;
  checkout?(command: unknown): Promise<unknown>;
  receive?(command: unknown): Promise<unknown>;
  receipt?(query: unknown): Promise<unknown>;
  supplierLookup?(query: unknown): Promise<unknown>;
  supplierHistory?(query: unknown): Promise<unknown>;
  posSearch?(query: unknown): Promise<unknown>;
  dailyResources?(query: unknown): Promise<unknown>;
  customerSearch?(query: unknown): Promise<unknown>;
  customerHistory?(query: unknown): Promise<unknown>;
  salesHistory?(query: unknown): Promise<unknown>;
  cashLedger?(query: unknown): Promise<unknown>;
  settings?(query: unknown): Promise<unknown>;
  stockCount?(query: unknown): Promise<unknown>;
  supplierPayables?(query: unknown): Promise<unknown>;
  transferDetail?(query: unknown): Promise<unknown>;
  savCases?(query: unknown): Promise<unknown>;
  individualPurchases?(query: unknown): Promise<unknown>;
  salesReport?(query: unknown): Promise<unknown>;
  zakatSheet?(query: unknown): Promise<unknown>;
  debtList?(query: unknown): Promise<unknown>;
  facilityList?(query: unknown): Promise<unknown>;
  expenseList?(query: unknown): Promise<unknown>;
  correctStandaloneSupplier?(command: unknown): Promise<unknown>;
}
export class TransportError extends Error {
  constructor(
    public code: string,
    public key?: string,
  ) {
    super(code);
  }
}
const definitiveWriteCodes = [
  "FORBIDDEN",
  "UNAUTHORIZED",
  "BAD_REQUEST",
  "NOT_CONNECTED",
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
];
export const disconnectedNativeTransport: ProtectedNativeTransport = {
  status: async () => ({ connected: false, verified: false }),
  read: async () => {
    throw new TransportError("NOT_CONNECTED");
  },
  execute: async () => {
    throw new TransportError("NOT_CONNECTED");
  },
};
const validResult = (raw: unknown, key: string): NativeCommandResult | null => {
  if (
    !raw ||
    typeof raw !== "object" ||
    !("key" in raw) ||
    raw.key !== key ||
    !("transactionId" in raw) ||
    typeof raw.transactionId !== "string" ||
    !("status" in raw) ||
    !["RECORDED", "DRAFT", "POLICY_BLOCKED"].includes(String(raw.status))
  )
    return null;
  return {
    key,
    transactionId: raw.transactionId,
    status: raw.status as NativeCommandResult["status"],
  };
};
export function createNativeRepository(transport: ProtectedNativeTransport) {
  const verified = async () => {
    const status = await transport.status();
    if (!status.connected) throw new TransportError("NOT_CONNECTED");
    if (!status.verified || status.synthetic) throw new TransportError("UNAUTHORIZED");
  };
  return {
    async ownerDashboard() {
      await verified();
      if (!transport.ownerDashboard) throw new TransportError("NOT_CONNECTED");
      return ownerDashboardResult.parse(await transport.ownerDashboard());
    },
    async settings(store: "M01" | "M02") {
      await verified();
      if (!transport.settings) throw new TransportError("NOT_CONNECTED");
      const result = nativeDailySettings.parse(
        await transport.settings(nativeDailyQuery.parse({ store })),
      );
      if (result.store !== store) throw new TransportError("PROJECTION_SCOPE_MISMATCH");
      return resolveSettings(result.settings);
    },
    async dailyResources(store: "M01" | "M02") {
      await verified();
      if (!transport.dailyResources) throw new TransportError("NOT_CONNECTED");
      const result = nativeDailyResources.parse(
        await transport.dailyResources(nativeDailyQuery.parse({ store })),
      );
      if (result.store !== store) throw new TransportError("PROJECTION_SCOPE_MISMATCH");
      return result;
    },
    async supplierHistory(input: unknown) {
      const query = provenanceQuery.parse(input);
      await verified();
      if (!transport.supplierHistory) throw new TransportError("NOT_CONNECTED");
      const result = provenanceResult.parse(await transport.supplierHistory(query));
      if (result.store !== query.store || result.receipts.length > query.limit)
        throw new TransportError("PROJECTION_SCOPE_MISMATCH");
      return result;
    },
    async receive(input: unknown): Promise<NativeCommandResult> {
      const command = nativeReceiving.parse(input);
      await verified();
      if (!transport.receive) throw new TransportError("NOT_CONNECTED");
      try {
        const result = z
          .object({
            key: z.literal(command.key),
            transactionId: z.string(),
            status: z.literal("RECORDED"),
          })
          .strict()
          .parse(await transport.receive(command));
        return result;
      } catch (error) {
        if (error instanceof TransportError && definitiveWriteCodes.includes(error.code))
          throw error;
        throw new TransportError("OUTCOME_UNKNOWN", command.key);
      }
    },
    async receipt(input: unknown) {
      const query = nativeReceiptQuery.parse(input);
      await verified();
      if (!transport.receipt) throw new TransportError("NOT_CONNECTED");
      const result = nativeReceipt.parse(await transport.receipt(query));
      if (result.saleId !== query.id || result.store !== query.store)
        throw new TransportError("PROJECTION_SCOPE_MISMATCH");
      return result;
    },
    async stockCount(store: "M01" | "M02", countId: string) {
      await verified();
      if (!transport.stockCount) throw new TransportError("NOT_CONNECTED");
      return stockCountResult.parse(await transport.stockCount({ store, countId }));
    },
    async supplierPayables(store: "M01" | "M02") {
      await verified();
      if (!transport.supplierPayables) throw new TransportError("NOT_CONNECTED");
      return supplierPayablesResult.parse(await transport.supplierPayables({ store }));
    },
    async supplierLookup(store: "M01" | "M02") {
      await verified();
      if (!transport.supplierLookup) throw new TransportError("NOT_CONNECTED");
      return nativeSupplierLookup.parse(await transport.supplierLookup({ store }));
    },
    async posSearch(input: unknown): Promise<NativePosSearchResult> {
      const query = nativePosSearchQuery.parse(input);
      const status = await transport.status();
      if (!status.connected || !transport.posSearch) throw new TransportError("NOT_CONNECTED");
      if (!status.verified || status.synthetic) throw new TransportError("UNAUTHORIZED");
      const result = nativePosSearchResult.parse(await transport.posSearch(query));
      if (result.store !== query.store || result.items.some((item) => item.store !== query.store))
        throw new TransportError("PROJECTION_SCOPE_MISMATCH");
      return result;
    },
    async customerSearch(input: unknown): Promise<NativeCustomerSearchResult> {
      const query = nativeCustomerSearchQuery.parse(input);
      const status = await transport.status();
      if (!status.connected || !transport.customerSearch) throw new TransportError("NOT_CONNECTED");
      if (!status.verified || status.synthetic) throw new TransportError("UNAUTHORIZED");
      const result = nativeCustomerSearchResult.parse(await transport.customerSearch(query));
      if (result.store !== query.store) throw new TransportError("PROJECTION_SCOPE_MISMATCH");
      return result;
    },
    async customerHistory(input: unknown): Promise<NativeCustomerHistoryResult> {
      const query = nativeCustomerHistoryQuery.parse(input);
      const status = await transport.status();
      if (!status.connected || !transport.customerHistory)
        throw new TransportError("NOT_CONNECTED");
      if (!status.verified || status.synthetic) throw new TransportError("UNAUTHORIZED");
      const result = nativeCustomerHistoryResult.parse(await transport.customerHistory(query));
      if (result.store !== query.store || result.customer.id !== query.customerId)
        throw new TransportError("PROJECTION_SCOPE_MISMATCH");
      return result;
    },
    async salesHistory(input: unknown): Promise<NativeSalesHistoryResult> {
      const query = nativeSalesHistoryQuery.parse(input);
      const status = await transport.status();
      if (!status.connected || !transport.salesHistory) throw new TransportError("NOT_CONNECTED");
      if (!status.verified || status.synthetic) throw new TransportError("UNAUTHORIZED");
      const result = nativeSalesHistoryResult.parse(await transport.salesHistory(query));
      if (result.store !== query.store) throw new TransportError("PROJECTION_SCOPE_MISMATCH");
      return result;
    },
    async cashLedger(input: unknown): Promise<NativeCashLedgerResult> {
      const query = nativeCashLedgerQuery.parse(input);
      const status = await transport.status();
      if (!status.connected || !transport.cashLedger) throw new TransportError("NOT_CONNECTED");
      if (!status.verified || status.synthetic) throw new TransportError("UNAUTHORIZED");
      const result = nativeCashLedgerResult.parse(await transport.cashLedger(query));
      if (result.store !== query.store) throw new TransportError("PROJECTION_SCOPE_MISMATCH");
      return result;
    },
    async transferDetail(input: unknown): Promise<NativeTransferDetailResult> {
      const query = nativeTransferDetailQuery.parse(input);
      const status = await transport.status();
      if (!status.connected || !transport.transferDetail) throw new TransportError("NOT_CONNECTED");
      if (!status.verified || status.synthetic) throw new TransportError("UNAUTHORIZED");
      const result = nativeTransferDetailResult.parse(await transport.transferDetail(query));
      if (
        result.store !== query.store ||
        result.transfer.id !== query.transferId ||
        (result.transfer.sourceStore !== query.store &&
          result.transfer.destinationStore !== query.store)
      )
        throw new TransportError("PROJECTION_SCOPE_MISMATCH");
      return result;
    },
    async savCases(input: unknown): Promise<NativeSavResult> {
      const query = nativeSavQuery.parse(input);
      const status = await transport.status();
      if (!status.connected || !transport.savCases) throw new TransportError("NOT_CONNECTED");
      if (!status.verified || status.synthetic) throw new TransportError("UNAUTHORIZED");
      const result = nativeSavResult.parse(await transport.savCases(query));
      if (result.store !== query.store) throw new TransportError("PROJECTION_SCOPE_MISMATCH");
      return result;
    },
    async debtList(input: unknown): Promise<NativeDebtsResult> {
      const query = nativeDebtsQuery.parse(input);
      const status = await transport.status();
      if (!status.connected || !transport.debtList) throw new TransportError("NOT_CONNECTED");
      if (!status.verified || status.synthetic) throw new TransportError("UNAUTHORIZED");
      const result = nativeDebtsResult.parse(await transport.debtList(query));
      if (result.store !== query.store) throw new TransportError("PROJECTION_SCOPE_MISMATCH");
      return result;
    },
    async facilityList(input: unknown): Promise<NativeFacilityResult> {
      const query = nativeFacilityQuery.parse(input);
      const status = await transport.status();
      if (!status.connected || !transport.facilityList) throw new TransportError("NOT_CONNECTED");
      if (!status.verified || status.synthetic) throw new TransportError("UNAUTHORIZED");
      const result = nativeFacilityResult.parse(await transport.facilityList(query));
      if (result.store !== "M01") throw new TransportError("PROJECTION_SCOPE_MISMATCH");
      return result;
    },
    async expenseList(input: unknown): Promise<NativeExpensesResult> {
      const query = nativeExpensesQuery.parse(input);
      const status = await transport.status();
      if (!status.connected || !transport.expenseList) throw new TransportError("NOT_CONNECTED");
      if (!status.verified || status.synthetic) throw new TransportError("UNAUTHORIZED");
      const result = nativeExpensesResult.parse(await transport.expenseList(query));
      if (result.store !== query.store) throw new TransportError("PROJECTION_SCOPE_MISMATCH");
      return result;
    },
    /** Owner-only append-only standalone receipt correction; key-bound result. */
    async correctStandaloneSupplier(input: unknown): Promise<{ key: string; status: "RECORDED" }> {
      const command = nativeStandaloneCorrection.parse(input);
      const status = await transport.status();
      if (!status.connected || !transport.correctStandaloneSupplier)
        throw new TransportError("NOT_CONNECTED");
      if (!status.verified || status.synthetic) throw new TransportError("UNAUTHORIZED");
      const raw = await transport.correctStandaloneSupplier(command);
      if (
        !raw ||
        typeof raw !== "object" ||
        !("key" in raw) ||
        raw.key !== command.key ||
        !("status" in raw) ||
        raw.status !== "RECORDED"
      )
        throw new TransportError("OUTCOME_UNKNOWN", command.key);
      return { key: command.key, status: "RECORDED" };
    },
    async checkout(input: unknown) {
      const e = nativeCheckoutEnvelope.parse(input);
      const status = await transport.status();
      if (!status.connected || !transport.checkout) throw new TransportError("NOT_CONNECTED");
      if (!status.verified || status.synthetic) throw new TransportError("UNAUTHORIZED");
      let raw: unknown;
      try {
        raw = await transport.checkout(e);
      } catch (error) {
        const code = error instanceof TransportError ? error.code : "OUTCOME_UNKNOWN";
        if (definitiveWriteCodes.includes(code)) throw new TransportError(code, e.idempotencyKey);
        throw new TransportError("OUTCOME_UNKNOWN", e.idempotencyKey);
      }
      if (
        !raw ||
        typeof raw !== "object" ||
        !("response_json" in raw) ||
        typeof raw.response_json !== "string"
      )
        throw new TransportError("OUTCOME_UNKNOWN", e.idempotencyKey);
      let result: unknown;
      try {
        result = JSON.parse(raw.response_json);
      } catch {
        throw new TransportError("OUTCOME_UNKNOWN", e.idempotencyKey);
      }
      if (
        !result ||
        typeof result !== "object" ||
        !("key" in result) ||
        result.key !== e.idempotencyKey ||
        !("saleId" in result) ||
        typeof result.saleId !== "string"
      )
        throw new TransportError("OUTCOME_UNKNOWN", e.idempotencyKey);
      return result;
    },
    async checkoutOutcome(key: string) {
      z.string()
        .regex(/^[A-Za-z0-9-]{16,80}$/)
        .parse(key);
      await verified();
      if (!transport.outcome) throw new TransportError("NOT_CONNECTED");
      const raw = await transport.outcome(key);
      const parsed = z
        .discriminatedUnion("found", [
          z.object({ found: z.literal(false) }).strict(),
          z
            .object({
              found: z.literal(true),
              result: z
                .object({
                  key: z.literal(key),
                  saleId: z.string(),
                  totalMinor: z.number().int().safe(),
                  changeMinor: z.number().int().safe(),
                })
                .strict(),
            })
            .strict(),
        ])
        .safeParse(raw);
      if (!parsed.success) throw new TransportError("OUTCOME_UNKNOWN", key);
      return parsed.data.found ? parsed.data.result : null;
    },
    status: () =>
      transport
        .status()
        .catch(() => ({ connected: false, verified: false }) as NativeTransportStatus),
    async read(
      route: NativeRoute,
      store: "M01" | "M02",
      page: NativePageQuery = { limit: 50, offset: 0 },
    ): Promise<NativeState> {
      try {
        const status = await transport.status();
        if (!status.connected) return { state: "NOT_CONNECTED" };
        if (!status.verified || (status.synthetic && !import.meta.env.DEV))
          return { state: "UNAUTHORIZED" };
        const projection = nativeProjection.parse(
          await transport.read(nativeRouteModules[route], store, page),
        );
        if (projection.module !== nativeRouteModules[route]) throw new Error("MODULE_MISMATCH");
        for (const row of projection.rows) {
          for (const column of ["store_id", "store"]) {
            const value = row[column];
            if (
              value !== undefined &&
              value !== store &&
              !(route === "/users" && value === "GLOBAL")
            )
              throw new TransportError("PROJECTION_SCOPE_MISMATCH");
          }
          if (
            route === "/transfers" &&
            row["source_store"] !== store &&
            row["destination_store"] !== store
          )
            throw new TransportError("PROJECTION_SCOPE_MISMATCH");
        }
        if (
          projection.page &&
          (projection.page.offset !== page.offset ||
            projection.page.limit !== page.limit ||
            projection.rows.length > page.limit)
        )
          throw new TransportError("PROJECTION_PAGE_MISMATCH");
        return { state: "READY", projection };
      } catch (error) {
        const message = error instanceof Error ? error.message : "";
        return {
          state:
            message === "FORBIDDEN"
              ? "FORBIDDEN"
              : message === "UNAUTHORIZED"
                ? "UNAUTHORIZED"
                : message === "NOT_CONNECTED"
                  ? "NOT_CONNECTED"
                  : "ERROR",
        };
      }
    },
    /** Never optimistic: resolves only with a schema-valid result bound to the same key. */
    async execute(input: unknown): Promise<NativeCommandResult> {
      const command = nativeEnvelope.parse(input);
      const status = await transport.status();
      if (!status.connected) throw new TransportError("NOT_CONNECTED");
      if (!status.verified) throw new TransportError("UNAUTHORIZED");
      let raw: unknown;
      try {
        raw = await transport.execute(command);
      } catch (error) {
        const code = error instanceof TransportError ? error.code : "OUTCOME_UNKNOWN";
        if (definitiveWriteCodes.includes(code)) throw new TransportError(code, command.key);
        throw new TransportError("OUTCOME_UNKNOWN", command.key);
      }
      const result = validResult(raw, command.key);
      if (!result) throw new TransportError("OUTCOME_UNKNOWN", command.key);
      return result;
    },
    /** Reconciliation readback for an unknown outcome; same key, never a new submission. */
    async outcome(key: string): Promise<NativeCommandResult | null> {
      const status = await transport.status();
      if (!status.connected) throw new TransportError("NOT_CONNECTED");
      if (!status.verified || (status.synthetic && !import.meta.env.DEV))
        throw new TransportError("UNAUTHORIZED");
      if (!transport.outcome) throw new TransportError("NOT_CONNECTED");
      const raw = await transport.outcome(key);
      if (!raw || typeof raw !== "object" || !("found" in raw))
        throw new TransportError("OUTCOME_UNKNOWN", key);
      if (raw.found !== true) return null;
      const result = validResult((raw as { result?: unknown }).result, key);
      if (!result) throw new TransportError("OUTCOME_UNKNOWN", key);
      return result;
    },
    async finance(
      store: "M01" | "M02",
    ): Promise<
      | { state: "READY"; data: OwnerFinanceProjection }
      | { state: "FORBIDDEN" | "NOT_CONNECTED" | "ERROR" }
    > {
      try {
        if (!transport.finance) return { state: "NOT_CONNECTED" };
        const s = await transport.status();
        if (!s.connected) return { state: "NOT_CONNECTED" };
        if (!s.verified) return { state: "FORBIDDEN" };
        return {
          state: "READY",
          data: ownerFinanceProjection.parse(await transport.finance(store)),
        };
      } catch (error) {
        const m = error instanceof Error ? error.message : "";
        return {
          state:
            m === "FORBIDDEN" || m === "UNAUTHORIZED"
              ? "FORBIDDEN"
              : m === "NOT_CONNECTED"
                ? "NOT_CONNECTED"
                : "ERROR",
        };
      }
    },
  };
}
export type NativeRepository = ReturnType<typeof createNativeRepository>;
// No default URL or cookie/token fabrication. Approved same-origin API must
// authenticate independently; no cross-origin credentials are forwarded.
export function createProtectedNativeTransport(
  basePath: string,
  credential: () => Promise<string | null>,
  request: typeof fetch = fetch,
): ProtectedNativeTransport {
  if (!/^\/api\/[^?#]+$/.test(basePath) || basePath.includes("..") || basePath.includes("//"))
    throw new Error("INVALID_API_PATH");
  const call = async (action: string, body: unknown, auth = true) => {
    const token = await credential();
    if (!token && auth) throw new TransportError("UNAUTHORIZED");
    const r = await request(`${basePath}/${action}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
      credentials: "same-origin",
      cache: "no-store",
    });
    if (!r.ok) {
      let payload: { error?: unknown; key?: unknown } = {};
      try {
        payload = (await r.json()) as typeof payload;
      } catch {
        /* opaque */
      }
      const code =
        typeof payload.error === "string" && /^[A-Z_]{3,40}$/.test(payload.error)
          ? payload.error
          : r.status === 403
            ? "FORBIDDEN"
            : r.status === 401
              ? "UNAUTHORIZED"
              : r.status === 400
                ? "BAD_REQUEST"
                : "BACKEND_ERROR";
      throw new TransportError(code, typeof payload.key === "string" ? payload.key : undefined);
    }
    return r.json() as Promise<unknown>;
  };
  return {
    status: async () => {
      const raw = await call("status", {}, false);
      if (!raw || typeof raw !== "object" || !("connected" in raw) || !("verified" in raw))
        throw new Error("INVALID_STATUS");
      return z
        .object({
          connected: z.boolean(),
          verified: z.boolean(),
          memberships: z
            .array(
              z
                .object({
                  store: z.enum(["GLOBAL", "M01", "M02"]),
                  role: z.enum(["SUPER_ADMIN", "MANAGER", "SELLER"]),
                })
                .strict(),
            )
            .optional(),
        })
        .strict()
        .parse(raw);
    },
    read: (module, store, page) => call("read", { module, store, ...(page ?? {}) }),
    ownerDashboard: () => call("owner/dashboard", {}),
    posSearch: (query) => call("pos/search", query),
    dailyResources: (query) => call("daily/resources", query),
    customerSearch: (query) => call("customers/search", query),
    customerHistory: (query) => call("customers/history", query),
    salesHistory: (query) => call("sales/history", query),
    cashLedger: (query) => call("cash/ledger", query),
    settings: (query) => call("settings/read", query),
    stockCount: (query) => call("stock/count", query),
    supplierPayables: (query) => call("suppliers/payables", query),
    individualPurchases: (query) => call("individual/purchases", query),
    salesReport: (query) => call("reports/sales", query),
    zakatSheet: (query) => call("reports/zakat", query),
    transferDetail: (query) => call("transfers/detail", query),
    savCases: (query) => call("sav/cases", query),
    debtList: (query) => call("debts/list", query),
    facilityList: (query) => call("facility/list", query),
    expenseList: (query) => call("expenses/list", query),
    correctStandaloneSupplier: (command) => call("suppliers/correct-standalone", command),
    execute: (command) => call("execute", command),
    checkout: (command) => call("checkout", command),
    receive: (command) => call("receive", command),
    receipt: (query) => call("receipt", query),
    supplierLookup: (query) => call("suppliers/lookup", query),
    supplierHistory: (query) => call("suppliers/history", query),
    outcome: (key) => call("outcome", { key }),
    finance: (store) => call("finance", { store }),
  };
}
