import type { RecordRow, StoreId } from "@/domain/erp";
import { decimalValue, minorUnits } from "@/domain/erp";
import { expectedCash, type TestState } from "./test-workspace";
import { algiersDate } from "@/domain/sales-review";

export type LedgerScope = "ALL" | StoreId;
export const LOW_STOCK_THRESHOLD = 3;

/** Read-only figures derived from the current browser-local TEST ledger. Nothing here is a posted or fiscal value. */
export function ledgerView(s: TestState, scope: LedgerScope, now: Date = new Date()) {
  const inScope = (store: StoreId) => scope === "ALL" || store === scope;
  const sales = s.sales.filter(
    (x) => inScope(x.store) && !s.saleVoids?.some((v) => v.saleId === x.id),
  );
  const day = (iso: string) => algiersDate(iso);
  const today = algiersDate(now);
  const sum = (xs: { total: string }[]) => xs.reduce((a, x) => a + minorUnits(x.total), 0n);
  const todaySales = sales.filter((x) => day(x.at) === today);
  const rows: RecordRow[] = [...sales]
    .reverse()
    .slice(0, 8)
    .map((x) => ({
      id: x.id,
      name: x.customer,
      detail: `${x.seller} · ${x.lines.map((l) => l.name).join(", ")}`,
      store: x.store,
      status: "Closed",
      amount: x.total,
      date: x.at,
    }));
  const openShifts = s.shifts.filter((x) => x.status === "OPEN" && inScope(x.store));
  const drawers = openShifts.reduce((a, x) => a + minorUnits(expectedCash(x.id, s)), 0n);
  const week = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(`${today}T12:00:00+01:00`);
    d.setUTCDate(d.getUTCDate() - (6 - i));
    const key = algiersDate(d);
    const of = (st: StoreId) =>
      inScope(st) ? Number(sum(sales.filter((x) => x.store === st && day(x.at) === key))) / 100 : 0;
    return { day: key.slice(5), M01: of("M01"), M02: of("M02") };
  });
  const accessories = s.accessories.filter((a) => inScope(a.store));
  return {
    rows,
    saleCount: sales.length,
    total: decimalValue(sum(sales)),
    todayCount: todaySales.length,
    todayTotal: decimalValue(sum(todaySales)),
    availablePhones: s.phones.filter((p) => p.status === "Available" && inScope(p.store)).length,
    accessoryUnits: accessories.reduce((a, x) => a + (x.quantity ?? 0), 0),
    accessorySkus: accessories.length,
    lowStock: accessories.filter((a) => (a.quantity ?? 0) <= LOW_STOCK_THRESHOLD).length,
    openShifts: openShifts.length,
    expectedDrawers: decimalValue(drawers),
    pendingTransfers: s.transfers.filter(
      (t) => t.stage !== "COMPLETED" && (inScope(t.from) || inScope(t.to)),
    ).length,
    pendingReviews: s.shifts.filter(
      (x) => inScope(x.store) && x.status === "CLOSED" && x.reviewStatus === "REVIEW_PENDING",
    ).length,
    stores: (["M01", "M02"] as const).filter(inScope).map((store) => ({
      store,
      total: decimalValue(sum(todaySales.filter((x) => x.store === store))),
      count: todaySales.filter((x) => x.store === store).length,
    })),
    week,
  };
}
