import { z } from "zod";
import { resolveSettings } from "@/domain/intake";
import type { NativeRepository } from "./native-repository";
import { TransportError } from "./native-repository";
import { nativePayloads, type NativeCommandResult } from "@/domain/native-commands";
import { nativeCheckoutEnvelope, type NativeCheckoutRequest } from "@/domain/native-checkout";
import { nativeReceiving } from "@/domain/native-receiving";
import type { NativeReceipt } from "@/domain/native-documents";
import {
  nativeSalesHistoryQuery,
  type NativeCashLedgerResult,
  type NativeCustomerHistoryResult,
  type NativeSalesHistoryResult,
} from "@/domain/native-history";
import type { NativePosSearchResult } from "@/domain/native-pos-search";
import type { NativeDailyResources } from "@/domain/native-daily";

export type DailyState<T> =
  | { state: "IDLE" | "LOADING" }
  | { state: "READY"; data: T }
  | { state: "ERROR" | "UNAUTHORIZED" | "FORBIDDEN" | "NOT_CONNECTED"; code: string }
  | { state: "OUTCOME_UNKNOWN" | "NOT_RECORDED"; key: string };
export type DailySaleReview = {
  receipt: NativeReceipt;
  stock: NativePosSearchResult;
  cash: NativeCashLedgerResult;
  sales: NativeSalesHistoryResult;
  customer: NativeCustomerHistoryResult | null;
};
export type DailyResult =
  | DailySaleReview
  | NativeCommandResult
  | NativeCashLedgerResult
  | NativePosSearchResult
  | NativeSalesHistoryResult
  | NativeCustomerHistoryResult
  | NativeReceipt;
type ResourceResult = NativeDailyResources;
const checkoutResult = z
  .object({
    key: z.string(),
    saleId: z.string(),
    totalMinor: z.number().int().safe(),
    changeMinor: z.number().int().safe(),
  })
  .strict();
type Pending =
  | { kind: "checkout"; key: string; store: "M01" | "M02" }
  | { kind: "command"; key: string; store: "M01" | "M02" }
  | { kind: "receive"; key: string; store: "M01" | "M02" };

/** Executable presentation/controller seam. No workspace import, fixture fallback,
 * actor assertion, price override, credential storage or automatic retry. Native
 * DTOs stay distinct from local draft types. All mutations require readback. */
export function createDailyNativeController(repository: NativeRepository, store: "M01" | "M02") {
  let state: DailyState<DailyResult | ResourceResult> = { state: "IDLE" };
  let pending: Pending | null = null;
  let busy = false;
  let retryWork: (() => Promise<DailyResult | ResourceResult>) | null = null;
  const listeners = new Set<() => void>();
  const publish = (next: DailyState<DailyResult | ResourceResult>) => {
    state = next;
    listeners.forEach((fn) => fn());
  };
  const failure = (error: unknown) => {
    const code =
      error instanceof TransportError
        ? error.code
        : error instanceof z.ZodError
          ? "VALIDATION"
          : "READBACK_FAILED";
    if (pending && code === "NOT_RECORDED") publish({ state: "NOT_RECORDED", key: pending.key });
    else if (pending && code === "OUTCOME_UNKNOWN")
      publish({ state: "OUTCOME_UNKNOWN", key: pending.key });
    else if (pending && code === "READBACK_FAILED")
      publish({ state: "OUTCOME_UNKNOWN", key: pending.key });
    else {
      // Definitive denial clears pending. Committed-but-denied readback never
      // fabricates a successful review; the immutable key remains with caller.
      pending = null;
      retryWork = null;
      publish({
        state:
          code === "SESSION_REVOKED"
            ? "UNAUTHORIZED"
            : ["UNAUTHORIZED", "FORBIDDEN", "NOT_CONNECTED"].includes(code)
              ? (code as "UNAUTHORIZED" | "FORBIDDEN" | "NOT_CONNECTED")
              : "ERROR",
        code,
      });
    }
  };
  async function run<T extends DailyResult | ResourceResult>(
    work: () => Promise<T>,
    mutation?: Pending,
  ) {
    if (busy || pending) throw new TransportError("ACTION_LOCKED", pending?.key);
    busy = true;
    publish({ state: "LOADING" });
    try {
      if (mutation) {
        pending = mutation;
        retryWork = work;
      }
      const data = await work();
      pending = null;
      retryWork = null;
      publish({ state: "READY", data });
      return data;
    } catch (error) {
      failure(error);
      throw error;
    } finally {
      busy = false;
    }
  }
  function checkStore(input: { store: string }) {
    if (input.store !== store) throw new TransportError("FORBIDDEN");
  }
  async function review(saleId: string): Promise<DailySaleReview> {
    const receipt = await repository.receipt({ store, id: saleId });
    const [stock, cash, sales, customer] = await Promise.all([
      repository.posSearch({ store }),
      repository.cashLedger({ store }),
      repository.salesHistory({ store }),
      receipt.customerId
        ? repository.customerHistory({ store, customerId: receipt.customerId })
        : Promise.resolve(null),
    ]);
    return { receipt, stock, cash, sales, customer };
  }
  async function cashCommand<
    K extends "cash.open" | "cash.close" | "cash.review" | "cash.evidence",
  >(operation: K, key: string, payload: z.input<(typeof nativePayloads)[K]>) {
    const parsed = nativePayloads[operation].parse(payload);
    checkStore(parsed);
    return run(
      async () => {
        const result = await repository.execute({
          version: "native-2026-11-06",
          key,
          operation,
          payload: parsed,
        });
        await repository.cashLedger({ store });
        return result;
      },
      { kind: "command", key, store },
    );
  }
  return {
    async voidSale(key: string, saleId: string, reason: string) {
      return run(
        async () => {
          const result = await repository.execute({
            version: "native-2026-11-06",
            key,
            operation: "sale.void",
            payload: { store, saleId, reason },
          });
          await Promise.all([
            repository.cashLedger({ store }),
            repository.posSearch({ store }),
            repository.salesHistory({ store }),
          ]);
          return result;
        },
        { kind: "command", key, store },
      );
    },
    source: "NATIVE" as const,
    store,
    getSnapshot: () => state,
    subscribe(fn: () => void) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    search(search: string, exact = false) {
      return run(async () => {
        const result = await repository.posSearch({ store, search });
        return exact
          ? {
              ...result,
              items: result.items.filter((i) =>
                [i.barcode, i.imei1, i.imei2, i.serial].includes(search.trim()),
              ),
            }
          : result;
      });
    },
    customers(search: string) {
      return repository.customerSearch({ store, search });
    },
    suppliers() {
      return repository.supplierLookup(store);
    },
    resources() {
      return run(() => repository.dailyResources(store));
    },
    /** Read-only; unavailable settings resolve to owner defaults (empty URL/label size hide features). */
    async settings() {
      try {
        return await repository.settings(store);
      } catch {
        return resolveSettings({});
      }
    },
    saveSetting(key: string, value: unknown) {
      return repository.execute({
        version: "native-2026-11-06",
        key: `settings-${crypto.randomUUID()}`,
        operation: "settings.save",
        payload: { store, key, value },
      });
    },
    catalogCommand<K extends "catalog.save" | "price.set">(
      operation: K,
      key: string,
      payload: z.input<(typeof nativePayloads)[K]>,
    ) {
      const parsed = nativePayloads[operation].parse(payload);
      checkStore(parsed);
      return run(
        async () => {
          const result = await repository.execute({
            version: "native-2026-11-06",
            key,
            operation,
            payload: parsed,
          });
          await repository.dailyResources(store);
          return result;
        },
        { kind: "command", key, store },
      );
    },
    receive(input: z.input<typeof nativeReceiving>) {
      const command = nativeReceiving.parse(input);
      checkStore(command);
      return run(
        async () => {
          const result = await repository.receive(command);
          await repository.posSearch({ store });
          return result;
        },
        { kind: "receive", key: command.key, store },
      );
    },
    checkout(input: NativeCheckoutRequest) {
      const command = nativeCheckoutEnvelope.parse(input);
      checkStore(command.payload);
      return run(
        async () => {
          const result = checkoutResult.parse(await repository.checkout(command));
          return review(result.saleId);
        },
        { kind: "checkout", key: command.idempotencyKey, store },
      );
    },
    openDrawer: (key: string, payload: z.input<(typeof nativePayloads)["cash.open"]>) =>
      cashCommand("cash.open", key, payload),
    closeDrawer: (key: string, payload: z.input<(typeof nativePayloads)["cash.close"]>) =>
      cashCommand("cash.close", key, payload),
    reviewClose: (key: string, payload: z.input<(typeof nativePayloads)["cash.review"]>) =>
      cashCommand("cash.review", key, payload),
    // Existing cash evidence is policy-blocked, never represented as cash posting.
    cashEvidence: (key: string, payload: z.input<(typeof nativePayloads)["cash.evidence"]>) =>
      cashCommand("cash.evidence", key, payload),
    cash() {
      return run(() => repository.cashLedger({ store }));
    },
    history(filters: Omit<z.input<typeof nativeSalesHistoryQuery>, "store"> = {}) {
      return run(() => repository.salesHistory({ ...filters, store }));
    },
    customerHistory(customerId: string) {
      return run(() => repository.customerHistory({ store, customerId }));
    },
    specimen(saleId: string) {
      return run(() => repository.receipt({ store, id: saleId }));
    },
    async reconcile() {
      if (busy || !pending || state.state !== "OUTCOME_UNKNOWN")
        throw new TransportError("NO_PENDING_OUTCOME");
      busy = true;
      const saved = pending;
      publish({ state: "LOADING" });
      try {
        const result =
          saved.kind === "checkout"
            ? await repository.checkoutOutcome(saved.key)
            : await repository.outcome(saved.key);
        // Absence does NOT authorize resubmitting under a new key.
        if (!result) {
          publish({ state: "OUTCOME_UNKNOWN", key: saved.key });
          return null;
        }
        const data =
          saved.kind === "checkout" && "saleId" in result
            ? await review(result.saleId)
            : saved.kind === "receive"
              ? await repository.posSearch({ store })
              : await repository.cashLedger({ store });
        pending = null;
        publish({ state: "READY", data });
        return data;
      } catch (error) {
        failure(error);
        throw error;
      } finally {
        busy = false;
      }
    },
    /** Discards a pending transaction that was definitively not recorded (or rejected) and unlocks the screen. */
    cancel() {
      if (busy || (state.state !== "NOT_RECORDED" && state.state !== "ERROR"))
        throw new TransportError("NO_CANCELLABLE_COMMAND");
      pending = null;
      retryWork = null;
      publish({ state: "IDLE" });
    },
    async retryNotRecorded() {
      if (busy || !pending || !retryWork || state.state !== "NOT_RECORDED")
        throw new TransportError("NO_RETRYABLE_COMMAND");
      const saved = pending;
      const work = retryWork;
      pending = null;
      return run(work, saved);
    },
  };
}
export type DailyNativeController = ReturnType<typeof createDailyNativeController>;
