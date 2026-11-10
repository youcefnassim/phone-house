import {
  getTestState,
  commitTest,
  reviewActor,
  assertReviewStore,
  nextTestId,
  adjustTestAccessory,
} from "./test-workspace";
import type { StoreId } from "@/domain/erp";
import type { StockCountResult } from "@/domain/stock-count";
export interface LocalStockCount {
  id: string;
  store: StoreId;
  month: string;
  state: "OPEN" | "SUBMITTED";
  expected: { itemId: string; kind: "phone" | "accessory"; quantity: number; code: string }[];
  entries: Record<string, number>;
}
export function startLocalCount(store: StoreId, month: string) {
  assertReviewStore(store, "count.open");
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error("VALIDATION");
  const ws = getTestState();
  if (ws.stockCounts?.some((c) => c.store === store && c.month === month))
    throw new Error("REJECTED");
  const row: LocalStockCount = {
    id: nextTestId("COUNT"),
    store,
    month,
    state: "OPEN",
    entries: {},
    expected: [
      ...ws.phones
        .filter((p) => p.store === store && p.status === "Available")
        .map((p) => ({ itemId: p.id, kind: "phone" as const, quantity: 1, code: p.imei })),
      ...ws.accessories
        .filter((p) => p.store === store)
        .map((p) => ({
          itemId: p.id,
          kind: "accessory" as const,
          quantity: p.quantity,
          code: p.code ?? p.id,
        })),
    ],
  };
  commitTest({ ...getTestState(), stockCounts: [...(ws.stockCounts ?? []), row] });
  return row.id;
}
export function enterLocalCount(id: string, code: string, quantity: number) {
  const ws = getTestState(),
    row = ws.stockCounts?.find((c) => c.id === id);
  if (!row) throw new Error("NOT_FOUND");
  assertReviewStore(row.store, "count.entry");
  const item = row.expected.find((e) => e.code === code || e.itemId === code);
  if (
    row.state !== "OPEN" ||
    !item ||
    !Number.isSafeInteger(quantity) ||
    quantity < 0 ||
    (item.kind === "phone" && quantity > 1)
  )
    throw new Error("VALIDATION");
  commitTest({
    ...ws,
    stockCounts: ws.stockCounts?.map((c) =>
      c.id === id ? { ...c, entries: { ...c.entries, [item.itemId]: quantity } } : c,
    ),
  });
}
export function submitLocalCount(id: string) {
  const ws = getTestState(),
    row = ws.stockCounts?.find((c) => c.id === id);
  if (!row) throw new Error("NOT_FOUND");
  assertReviewStore(row.store, "count.submit");
  if (row.state !== "OPEN") throw new Error("REJECTED");
  commitTest({
    ...ws,
    stockCounts: ws.stockCounts?.map((c) => (c.id === id ? { ...c, state: "SUBMITTED" } : c)),
  });
}
export function localCountProjection(id: string): StockCountResult {
  const row = getTestState().stockCounts?.find((c) => c.id === id);
  if (!row) throw new Error("NOT_FOUND");
  assertReviewStore(row.store);
  const owner = reviewActor()?.role === "SUPER_ADMIN";
  return {
    session: { id: row.id, month: row.month, state: row.state },
    rows:
      row.state === "OPEN"
        ? Object.entries(row.entries).map(([item_id, counted]) => ({
            item_id,
            kind: row.expected.find((e) => e.itemId === item_id)?.kind ?? "accessory",
            counted,
          }))
        : row.expected
            .filter((e) => e.kind === "accessory" || owner)
            .map((e) => ({
              item_id: e.itemId,
              kind: e.kind,
              expected: e.quantity,
              counted: row.entries[e.itemId] ?? 0,
              difference: (row.entries[e.itemId] ?? 0) - e.quantity,
              imei: e.kind === "phone" ? e.code : null,
            })),
  };
}
export function adjustLocalCount(id: string, itemId: string, reason: string) {
  const p = localCountProjection(id),
    row = p.rows.find((r) => r.item_id === itemId);
  const c = getTestState().stockCounts?.find((c) => c.id === id);
  if (!c || p.session.state !== "SUBMITTED" || !row || row.kind !== "accessory" || !row.difference)
    throw new Error("REJECTED");
  if (getTestState().adjustmentReviews?.some((r) => r.countId === id && r.itemId === itemId))
    throw new Error("REJECTED");
  adjustTestAccessory(itemId, c.store, String(row.difference), reason);
  const ws = getTestState();
  commitTest({
    ...ws,
    adjustmentReviews: ws.adjustmentReviews?.map((r) =>
      r.movementId === ws.movements[0]?.id ? { ...r, countId: id } : r,
    ),
  });
}
export function reviewLocalAdjustment(movementId: string, outcome: "OK" | "FLAGGED", note: string) {
  const ws = getTestState();
  const row = ws.adjustmentReviews?.find((r) => r.movementId === movementId);
  if (!row || !note.trim()) throw new Error("VALIDATION");
  assertReviewStore(row.store, "stock.review");
  if (row.outcome !== "PENDING") throw new Error("REJECTED");
  commitTest({
    ...ws,
    adjustmentReviews: ws.adjustmentReviews?.map((r) =>
      r === row
        ? {
            ...r,
            outcome,
            note,
            reviewedBy: reviewActor()?.id ?? "",
            reviewedAt: new Date().toISOString(),
          }
        : r,
    ),
  });
}
