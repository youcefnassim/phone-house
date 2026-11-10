import {
  getTestState,
  commitTest,
  reviewActor,
  assertReviewStore,
  openShiftFor,
  expectedCash,
  type TestSale,
} from "./test-workspace";
import { minorUnits, type StoreId } from "@/domain/erp";
import { savTrack, savOutcome, zakatTotals } from "@/domain/batch4b";
export type LocalSav = {
  id: string;
  store: StoreId;
  saleId: string;
  phoneId: string;
  customerId: string;
  issue: string;
  tracking: {
    status: string;
    note: string;
    paidRepairNeeded: boolean;
    at: string;
    actor: string;
  }[];
  outcome?: {
    value: string;
    note: string;
    amount?: string;
    method?: "Cash" | "Bank";
    key: string;
    at: string;
    actor: string;
  };
};
export function openLocalSav(sale: TestSale, phoneId: string, issue: string) {
  assertReviewStore(sale.store, "sav.open");
  const ws = getTestState();
  if (
    !issue.trim() ||
    !ws.sales.some((s) => s.id === sale.id) ||
    !sale.lines.some((l) => l.id === phoneId && l.kind === "phone") ||
    ws.savCases?.some((c) => c.saleId === sale.id && c.phoneId === phoneId)
  )
    throw new Error("REJECTED");
  const row: LocalSav = {
    id: crypto.randomUUID(),
    store: sale.store,
    saleId: sale.id,
    phoneId,
    customerId: sale.customerId,
    issue,
    tracking: [],
  };
  commitTest({ ...ws, savCases: [...(ws.savCases ?? []), row] });
  return row.id;
}
export function trackLocalSav(input: unknown) {
  const v = savTrack.parse(input),
    ws = getTestState(),
    c = ws.savCases?.find((c) => c.id === v.caseId);
  assertReviewStore(v.store, "sav.track");
  if (!c || c.store !== v.store || c.outcome) throw new Error("REJECTED");
  const sale = ws.sales.find((s) => s.id === c.saleId);
  if (
    ["SENT_DISTRIBUTOR", "RETURNED"].includes(v.status) &&
    !sale?.warranties?.some(
      (w) => w.itemId === c.phoneId && w.provider === "MANUFACTURER" && w.requested,
    )
  )
    throw new Error("REJECTED");
  if (v.status === "RETURNED" && c.tracking.at(-1)?.status !== "SENT_DISTRIBUTOR")
    throw new Error("REJECTED");
  commitTest({
    ...ws,
    savCases: ws.savCases?.map((x) =>
      x.id === c.id
        ? {
            ...x,
            tracking: [
              ...x.tracking,
              {
                status: v.status,
                note: v.note,
                paidRepairNeeded: v.paidRepairNeeded,
                at: new Date().toISOString(),
                actor: reviewActor()?.id ?? "",
              },
            ],
          }
        : x,
    ),
  });
}
export function outcomeLocalSav(input: unknown, key: string) {
  const v = savOutcome.parse(input),
    ws = getTestState(),
    c = ws.savCases?.find((c) => c.id === v.caseId),
    actor = assertReviewStore(v.store, "sav.outcome");
  if (!c || c.store !== v.store) throw new Error("NOT_FOUND");
  if (c.outcome?.key === key) return;
  if (c.outcome) throw new Error("REJECTED");
  const sale = ws.sales.find((s) => s.id === c.saleId);
  if (!sale) throw new Error("NOT_FOUND");
  const shift = openShiftFor(v.store);
  if (v.outcome === "REFUND") {
    const paid =
      minorUnits(sale.cashPart ?? (sale.tender === "Cash" ? sale.total : "0")) +
      minorUnits(sale.bankPart ?? (sale.tender === "Bank" ? sale.total : "0")) +
      (ws.creditPayments ?? [])
        .filter(
          (p) => p.saleId === sale.id && !ws.creditReversals?.some((r) => r.paymentId === p.id),
        )
        .reduce((n, p) => n + minorUnits(p.amount), 0n);
    const refunded = (ws.savCases ?? [])
      .filter((x) => x.saleId === sale.id)
      .reduce((n, x) => n + minorUnits(x.outcome?.amount ?? "0"), 0n);
    if (
      minorUnits(v.amount ?? "0") + refunded > paid ||
      ws.saleVoids?.some((x) => x.saleId === sale.id)
    )
      throw new Error("REJECTED");
    if (v.method === "Cash" && (!shift || v.shiftId !== shift.id)) throw new Error("SHIFT_CLOSED");
  }
  const at = new Date().toISOString();
  commitTest({
    ...ws,
    savCases: ws.savCases?.map((x) =>
      x.id === c.id
        ? {
            ...x,
            outcome: {
              value: v.outcome,
              note: v.note,
              ...(v.amount ? { amount: v.amount } : {}),
              ...(v.method ? { method: v.method } : {}),
              key,
              at,
              actor: actor.id,
            },
          }
        : x,
    ),
    phones:
      v.outcome === "REFUND"
        ? ws.phones.map((p) => (p.id === c.phoneId ? { ...p, status: "Inspection" as const } : p))
        : ws.phones,
    cash:
      v.outcome === "REFUND" && v.method === "Cash"
        ? [
            ...ws.cash,
            {
              id: key,
              shiftId: v.shiftId ?? "",
              store: v.store,
              at,
              kind: "CASH_OUT",
              amount: v.amount ?? "0",
              reference: "SAV_REFUND",
              seller: actor.name,
              operatorId: actor.id,
              key,
            },
          ]
        : ws.cash,
  });
}
export function restockLocalSav(phoneId: string) {
  const ws = getTestState(),
    phone = ws.phones.find((p) => p.id === phoneId);
  if (!phone) throw new Error("NOT_FOUND");
  assertReviewStore(phone.store, "sav.restock");
  if (
    phone.status !== "Inspection" ||
    !ws.savCases?.some(
      (c) => c.phoneId === phoneId && ["REFUND", "EXCHANGE"].includes(c.outcome?.value ?? ""),
    )
  )
    throw new Error("REJECTED");
  commitTest({
    ...ws,
    phones: ws.phones.map((p) => (p.id === phoneId ? { ...p, status: "Available" as const } : p)),
  });
}
export async function localZakatSheet() {
  if (reviewActor()?.role !== "SUPER_ADMIN") throw new Error("FORBIDDEN");
  const ws = getTestState();
  const { localSupplierCosts, localSupplierPayables } = await import("./local-supplier-finance");
  const costs = [
    ...(await localSupplierCosts()),
    ...(await import("./local-individual-purchase").then((m) => m.localIndividualCosts())).map(
      (c) => ({ sourceId: c.id, amount: c.amount }),
    ),
  ];
  const stock = [
    ...ws.phones.filter((p) => p.status === "Available").map((p) => ({ id: p.id, q: 1 })),
    ...ws.accessories.filter((p) => p.quantity > 0).map((p) => ({ id: p.id, q: p.quantity })),
  ];
  const known = stock.filter((p) => costs.some((c) => c.sourceId === p.id));
  const stockValue = known.reduce(
    (n, p) => n + minorUnits(costs.find((c) => c.sourceId === p.id)?.amount ?? "0"),
    0n,
  );
  const cash = ws.shifts.reduce((n, s) => n + minorUnits(expectedCash(s.id, ws)), 0n);
  const receivables = ws.sales
    .filter((s) => !ws.saleVoids?.some((v) => v.saleId === s.id))
    .reduce(
      (n, s) =>
        n +
        minorUnits(s.creditAmount ?? "0") -
        (ws.creditPayments ?? [])
          .filter(
            (p) => p.saleId === s.id && !ws.creditReversals?.some((r) => r.paymentId === p.id),
          )
          .reduce((a, p) => a + minorUnits(p.amount), 0n),
      0n,
    );
  const payables = (await localSupplierPayables()).reduce(
    (n, p) => n + BigInt(p.balance_minor),
    0n,
  );
  return {
    ...zakatTotals(stockValue, cash, receivables, payables),
    known: known.length,
    total: stock.length,
    missing: stock.length - known.length,
  };
}

/** Local rehearsal exchange records a new immutable sale; no hosted authority is simulated. */
export function exchangeLocalSav(
  caseId: string,
  replacementId: string,
  method: "Cash" | "Bank",
  note: string,
) {
  const ws = getTestState(),
    c = ws.savCases?.find((c) => c.id === caseId);
  if (!c) throw new Error("NOT_FOUND");
  assertReviewStore(c.store, "sav.exchange");
  const sale = ws.sales.find((s) => s.id === c.saleId),
    replacement = ws.phones.find(
      (p) => p.id === replacementId && p.store === c.store && p.status === "Available",
    );
  if (
    !sale ||
    sale.lines.length !== 1 ||
    minorUnits(sale.creditAmount ?? "0") > 0n ||
    !replacement?.amount ||
    !note.trim()
  )
    throw new Error("REJECTED");
  const shift = openShiftFor(c.store);
  if (!shift) throw new Error("SHIFT_CLOSED");
  const paid =
    minorUnits(sale.cashPart ?? (sale.tender === "Cash" ? sale.total : "0")) +
    minorUnits(sale.bankPart ?? (sale.tender === "Bank" ? sale.total : "0"));
  const now = new Date().toISOString();
  if (c.outcome) throw new Error("REJECTED");
  const key = crypto.randomUUID(),
    id = crypto.randomUUID(),
    actor = reviewActor();
  if (!actor) throw new Error("FORBIDDEN");
  const {
    publicRef: oldRef,
    invoiceNumber: oldInvoice,
    creditAmount: oldCredit,
    ...snapshot
  } = sale;
  void oldRef;
  void oldInvoice;
  void oldCredit;
  const next: TestSale = {
    ...snapshot,
    id,
    key,
    at: now,
    shiftId: shift.id,
    total: replacement.amount,
    paid: replacement.amount,
    change: "0.00",
    tender: method,
    cashPart: method === "Cash" ? replacement.amount : "0.00",
    bankPart: method === "Bank" ? replacement.amount : "0.00",
    bankMethod: method === "Bank" ? "VIREMENT" : undefined,
    discountAmount: "0.00",
    lines: [
      {
        id: replacement.id,
        kind: "phone",
        name: replacement.name,
        quantity: 1,
        unitPrice: replacement.amount,
        lineTotal: replacement.amount,
        imei: replacement.imei,
      },
    ],
    warranties: [
      {
        itemId: replacement.id,
        requested: false,
        duration: "",
        start: "",
        end: "",
        status: "NONE",
      },
    ],
  };
  commitTest({
    ...ws,
    sales: [...ws.sales, next],
    savCases: ws.savCases?.map((x) =>
      x.id === c.id
        ? {
            ...x,
            outcome: {
              value: "EXCHANGE",
              note,
              amount: (paid / 100n).toString() + "." + (paid % 100n).toString().padStart(2, "0"),
              method,
              key,
              at: now,
              actor: actor.id,
            },
          }
        : x,
    ),
    phones: ws.phones.map((p) =>
      p.id === c.phoneId
        ? { ...p, status: "Inspection" as const }
        : p.id === replacement.id
          ? { ...p, status: "Sold" as const }
          : p,
    ),
    cash:
      method === "Cash"
        ? [
            ...ws.cash,
            {
              id: key + "-refund",
              key,
              shiftId: shift.id,
              store: c.store,
              at: now,
              kind: "CASH_OUT",
              amount: sale.total,
              reference: "SAV_EXCHANGE",
              seller: actor.name,
              operatorId: actor.id,
            },
            {
              id: key + "-sale",
              key: key + "-sale",
              shiftId: shift.id,
              store: c.store,
              at: now,
              kind: "SALE",
              amount: replacement.amount,
              reference: id,
              seller: actor.name,
              operatorId: actor.id,
            },
          ]
        : ws.cash,
  });
  return next;
}
