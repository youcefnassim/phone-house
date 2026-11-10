import { canApproveTransfer } from "@/domain/permissions";
import {
  getTestState,
  commitTest,
  nextTestId,
  reviewActor,
  assertReviewStore,
  workspaceIdentities,
  priceTestBasket,
  WALK_IN,
  type TestAccessory,
  type TestMovement,
  type TestState,
} from "./test-workspace";
import { getSession, addDraft, updateDraft, recordAudit } from "./session-store";
import { projectSnapshot } from "./business-demo";
import {
  debtSchema,
  repaymentSchema,
  facilitySchema,
  facilityEventSchema,
  serviceSchema,
  serviceEventSchema,
  refundSchema,
  facilitySchedule,
  sumMoney,
  outstanding,
  type DebtInput,
  type RepaymentInput,
  type FacilityInput,
  type ServiceInput,
  type Transfer,
  type TransferLine,
  type Debt,
  type Facility,
  type FacilityEvent,
  type ServiceCase,
  type SaleReference,
  type Attachment,
} from "@/domain/business";
import { decimalValue, minorUnits, type StoreId, type Money } from "@/domain/erp";

// Cross-module LOCAL TEST workflows. All state lives in the browser-local test
// workspace (IndexedDB). Nothing here is a server transaction, an authenticated
// approval, a fiscal posting, a bank confirmation or a refund. Every function
// re-validates against current workspace state; UI values are never trusted.
// Policy-dependent execution (credit posting, refunds, returns, partial transfer
// receipt, bank reconciliation) stays blocked until owner decisions exist.

const ALL = () => projectSnapshot("ALL");

/** Test sales exposed as sale references (one per line) for SAV/debt linking. */
export function testSaleReferences(s: TestState = getTestState()): SaleReference[] {
  return s.sales.flatMap((sale) =>
    sale.lines.map((l) => ({
      id: sale.id,
      customerId: sale.customerId,
      store: sale.store,
      item: l.name,
      ...(l.imei ? { imei: l.imei } : {}),
      amount: l.lineTotal,
      date: sale.at.slice(0, 10),
    })),
  );
}

// ---------------- Transfers ----------------
const ACTIVE = (t: Transfer) => t.stage !== "COMPLETED";
function reservedQty(s: TestState, id: string, except?: string) {
  return s.transfers
    .filter(
      (t) => ACTIVE(t) && t.id !== except && ["DRAFT", "APPROVALS", "DISPATCH"].includes(t.stage),
    )
    .flatMap((t) => t.lines)
    .filter((l) => l.id === id)
    .reduce((n, l) => n + l.quantity, 0);
}
function checkSourceStock(
  s: TestState,
  from: StoreId,
  lines: { id: string; quantity: number }[],
  except?: string,
): TransferLine[] {
  if (!lines.length) throw new Error("Select at least one item to transfer.");
  const seen = new Set<string>();
  return lines.map((l) => {
    if (seen.has(l.id)) throw new Error("Each item may appear only once in a transfer.");
    seen.add(l.id);
    if (!Number.isSafeInteger(l.quantity) || l.quantity <= 0)
      throw new Error("Quantity must be a positive whole number.");
    const p = s.phones.find((x) => x.id === l.id);
    if (p) {
      if (p.store !== from) throw new Error("Item is not in the source store.");
      if (p.status !== "Available") throw new Error(`Phone ${p.id} is no longer available.`);
      if (l.quantity !== 1) throw new Error(`Phone ${p.id} can only be sold once.`);
      if (reservedQty(s, p.id, except))
        throw new Error("This phone is already on another active transfer.");
      return {
        id: p.id,
        name: p.name,
        kind: "phone",
        code: p.code ?? p.id,
        imei: p.imei,
        quantity: 1,
      };
    }
    const a = s.accessories.find((x) => x.id === l.id);
    if (!a) throw new Error(`Unknown item ${l.id}.`);
    if (a.store !== from) throw new Error("Item is not in the source store.");
    if (a.quantity - reservedQty(s, a.id, except) < l.quantity)
      throw new Error(`Insufficient stock for ${a.id}.`);
    return {
      id: a.id,
      name: a.name,
      kind: "accessory",
      code: a.code ?? a.id,
      quantity: l.quantity,
    };
  });
}
/** Lines of an undispatched transfer whose source stock is no longer available (e.g. sold at POS). No reservation policy is implied. */
export function transferConflicts(t: Transfer, s: TestState = getTestState()): string[] {
  if (!["DRAFT", "APPROVALS", "DISPATCH"].includes(t.stage)) return [];
  return t.lines
    .filter((l) => {
      const p = s.phones.find((x) => x.id === l.id);
      if (l.kind === "phone") return !p || p.store !== t.from || p.status !== "Available";
      const a = s.accessories.find((x) => x.id === l.id);
      return !a || a.store !== t.from || a.quantity - reservedQty(s, a.id, t.id) < l.quantity;
    })
    .map((l) => l.id);
}
/** Active transfers that list this item but cannot proceed — shown as a warning; never blocks or overrides a sale. */
export function transfersListing(itemId: string, s: TestState = getTestState()): Transfer[] {
  return s.transfers.filter(
    (t) =>
      ["DRAFT", "APPROVALS", "DISPATCH"].includes(t.stage) && t.lines.some((l) => l.id === itemId),
  );
}
const putTransfer = (s: TestState, t: Transfer, extra: Partial<TestState> = {}) =>
  commitTest({ ...s, ...extra, transfers: s.transfers.map((x) => (x.id === t.id ? t : x)) });
const findTransfer = (id: string) => {
  const t = getTestState().transfers.find((x) => x.id === id);
  if (!t) throw new Error("Transfer not found.");
  return t;
};

export function createTestTransfer(input: {
  from: StoreId;
  to: StoreId;
  reference: string;
  lines: { id: string; quantity: number }[];
}): Transfer {
  assertReviewStore(input.from, "transfer.create");
  if (input.from === input.to) throw new Error("Source and destination stores must differ.");
  if (!["M01", "M02"].includes(input.from) || !["M01", "M02"].includes(input.to))
    throw new Error("Select an option");
  if (!input.reference.trim()) throw new Error("Required");
  const lines = checkSourceStock(getTestState(), input.from, input.lines);
  const id = nextTestId("TTR");
  const s = getTestState();
  const t: Transfer = {
    id,
    from: input.from,
    to: input.to,
    reference: input.reference.trim(),
    lines,
    stage: "DRAFT",
    superAdmin: false,
    m02Manager: false,
    scanned: {},
    history: ["DRAFT"],
    discrepancies: [],
    source: "Session draft",
  };
  commitTest({ ...s, transfers: [t, ...s.transfers] });
  recordAudit({
    area: "transfers",
    action: "Test transfer draft",
    subjectId: id,
    detail: `${input.from} → ${input.to} · ${lines.length}`,
    store: input.from,
  });
  return t;
}

/** Preview approval by a named test identity. NOT authenticated approval. */
export function approveTestTransfer(
  id: string,
  kind: "SUPER_ADMIN" | "M02_MANAGER",
  identityId: string,
): Transfer {
  const t = findTransfer(id);
  if (reviewActor()?.role === "SELLER") throw new Error("This identity cannot give this approval.");
  if (t.stage !== "APPROVALS")
    throw new Error("Approvals are only possible at the approval stage.");
  if (transferConflicts(t).length)
    throw new Error(
      "Some items on this transfer are no longer available. Review and revalidate the transfer first.",
    );
  const who = workspaceIdentities().find((u) => u.id === identityId);
  if (!who) throw new Error("Select an option");
  if (!who.active) throw new Error("This identity cannot give this approval.");
  if (
    !who.stores.some((store) =>
      canApproveTransfer(kind, who.role, who.role === "SUPER_ADMIN" ? "GLOBAL" : store),
    )
  )
    throw new Error("This identity cannot give this approval.");
  if (kind === "SUPER_ADMIN" ? t.superAdmin : t.m02Manager)
    throw new Error("This approval was already recorded.");
  const next: Transfer =
    kind === "SUPER_ADMIN"
      ? {
          ...t,
          superAdmin: true,
          superAdminBy: who.name,
          history: [...t.history, `APPROVAL SUPER_ADMIN · ${who.name}`],
        }
      : {
          ...t,
          m02Manager: true,
          m02ManagerBy: who.name,
          history: [...t.history, `APPROVAL M02_MANAGER · ${who.name}`],
        };
  putTransfer(getTestState(), next);
  recordAudit({
    area: "transfers",
    action: "Test approval preview (unauthenticated)",
    subjectId: id,
    detail: `${kind} · ${who.name}`,
    store: t.from,
  });
  return next;
}

export function advanceTestTransfer(id: string, carrier?: string): Transfer {
  const t = findTransfer(id);
  const s = getTestState();
  const at = new Date().toISOString();
  assertReviewStore(["IN_TRANSIT", "RECEIPT"].includes(t.stage) ? t.to : t.from);
  if (transferConflicts(t, s).length)
    throw new Error(
      "Some items on this transfer are no longer available. Review and revalidate the transfer first.",
    );
  switch (t.stage) {
    case "DRAFT": {
      checkSourceStock(s, t.from, t.lines, t.id);
      const n = { ...t, stage: "APPROVALS" as const, history: [...t.history, "APPROVALS"] };
      putTransfer(s, n);
      return n;
    }
    case "APPROVALS": {
      if (!t.superAdmin || !t.m02Manager)
        throw new Error("Both Super Admin and M02 Manager approvals are required.");
      checkSourceStock(s, t.from, t.lines, t.id);
      const n = { ...t, stage: "DISPATCH" as const, history: [...t.history, "DISPATCH"] };
      putTransfer(s, n);
      return n;
    }
    case "DISPATCH": {
      assertReviewStore(t.from, "transfer.dispatch");
      checkSourceStock(s, t.from, t.lines, t.id);
      const ids = new Set(t.lines.filter((l) => l.kind === "phone").map((l) => l.id));
      const dec = new Map(
        t.lines.filter((l) => l.kind === "accessory").map((l) => [l.id, l.quantity]),
      );
      const phones = s.phones.map((p) =>
        ids.has(p.id) ? { ...p, status: "In transit" as const } : p,
      );
      const accessories = s.accessories.map((a) => {
        const q = dec.get(a.id);
        if (!q) return a;
        const n = a.quantity - q;
        return {
          ...a,
          quantity: n,
          status:
            n === 0 ? ("Sold" as const) : n <= 3 ? ("Low stock" as const) : ("Available" as const),
        };
      });
      const out: TestMovement[] = t.lines
        .filter((l) => l.kind === "accessory")
        .map((l, i) => ({
          id: `${t.id}-OUT${i + 1}`,
          at,
          sku: l.id,
          name: l.name,
          store: t.from,
          quantity: -l.quantity,
          reason: "TRANSFER_OUT",
          reference: t.id,
        }));
      const n = {
        ...t,
        ...(carrier?.trim()
          ? { carrier: carrier.trim(), dispatchedBy: reviewActor()?.id ?? "" }
          : {}),
        scanned: {},
        stage: "IN_TRANSIT" as const,
        history: [...t.history, "IN_TRANSIT"],
      };
      putTransfer(s, n, { phones, accessories, movements: [...out, ...s.movements] });
      return n;
    }
    case "IN_TRANSIT": {
      const n = { ...t, stage: "RECEIPT" as const, history: [...t.history, "RECEIPT"] };
      putTransfer(s, n);
      return n;
    }
    case "RECEIPT": {
      assertReviewStore(t.to, "transfer.receive");
      if (t.dispatchedBy === reviewActor()?.id) throw new Error("SAME_PERSON");
      if (!t.carrier && !t.lines.every((l) => (t.scanned[l.id] ?? 0) === l.quantity))
        throw new Error(
          "Every item must be scanned before completion. Partial receipt is blocked (OD unresolved).",
        );
      const ids = new Set(
        t.lines.filter((l) => l.kind === "phone" && (t.scanned[l.id] ?? 0) === 1).map((l) => l.id),
      );
      const phones = s.phones.map((p) =>
        ids.has(p.id) ? { ...p, store: t.to, status: "Available" as const } : p,
      );
      let accessories = [...s.accessories];
      const inMoves: TestMovement[] = [];
      let seq = s.seq;
      t.lines
        .map((l) => ({ ...l, quantity: t.scanned[l.id] ?? 0 }))
        .filter((l) => l.kind === "accessory" && l.quantity > 0)
        .forEach((l, i) => {
          const dest = accessories.find((a) => a.code === l.code && a.store === t.to);
          if (dest) {
            const n = dest.quantity + l.quantity;
            accessories = accessories.map((a) =>
              a === dest ? { ...a, quantity: n, status: n <= 3 ? "Low stock" : "Available" } : a,
            );
            inMoves.push({
              id: `${t.id}-IN${i + 1}`,
              at,
              sku: dest.id,
              name: l.name,
              store: t.to,
              quantity: l.quantity,
              reason: "TRANSFER_IN",
              reference: t.id,
            });
          } else {
            const src = s.accessories.find((a) => a.id === l.id);
            if (!src) throw new Error("NOT_FOUND");
            seq += 1;
            const nid = `TAC-${String(seq).padStart(4, "0")}`;
            const row: TestAccessory = {
              ...src,
              id: nid,
              store: t.to,
              quantity: l.quantity,
              status: l.quantity <= 3 ? "Low stock" : "Available",
            };
            delete row.amount;
            accessories = [row, ...accessories];
            inMoves.push({
              id: `${t.id}-IN${i + 1}`,
              at,
              sku: nid,
              name: l.name,
              store: t.to,
              quantity: l.quantity,
              reason: "TRANSFER_IN",
              reference: t.id,
            });
          }
        });
      const n = {
        ...t,
        discrepancyLines: t.lines
          .filter((l) => (t.scanned[l.id] ?? 0) < l.quantity)
          .map((l) => ({ id: l.id, quantity: l.quantity - (t.scanned[l.id] ?? 0) })),
        stage: "COMPLETED" as const,
        history: [...t.history, "COMPLETED"],
      };
      putTransfer({ ...s, seq }, n, {
        phones,
        accessories,
        movements: [...inMoves, ...s.movements],
      });
      recordAudit({
        area: "transfers",
        action: "Test transfer completed (local simulation)",
        subjectId: t.id,
        detail: `${t.from} → ${t.to}`,
        store: t.to,
      });
      return n;
    }
    default:
      throw new Error("Already complete");
  }
}

/** Explicit user revalidation: removes unavailable lines, clears previous approvals (now stale) and returns to DRAFT. */
export function revalidateTestTransfer(id: string): Transfer {
  const t = findTransfer(id);
  const s = getTestState();
  const bad = new Set(transferConflicts(t, s));
  assertReviewStore(t.from);
  if (!bad.size) throw new Error("No conflict to resolve on this transfer.");
  const lines = t.lines.filter((l) => !bad.has(l.id));
  if (!lines.length) throw new Error("No available items remain on this transfer.");
  const { superAdminBy: _sa, m02ManagerBy: _mg, ...rest } = t;
  void _sa;
  void _mg;
  const n: Transfer = {
    ...rest,
    lines,
    stage: "DRAFT",
    superAdmin: false,
    m02Manager: false,
    history: [...t.history, `REVALIDATED · ${[...bad].join(", ")}`],
  };
  putTransfer(s, n);
  recordAudit({
    area: "transfers",
    action: "Test transfer revalidated",
    subjectId: id,
    detail: [...bad].join(", "),
    store: t.from,
  });
  return n;
}

export function scanTestTransfer(id: string, code: string): Transfer {
  const t = findTransfer(id);
  const c = code.trim();
  assertReviewStore(t.to);
  if (t.stage !== "RECEIPT") throw new Error("Receipt stage required");
  if (!c) throw new Error("Required");
  const l = t.lines.find((x) => x.code === c || x.imei === c);
  if (!l) throw new Error("Scanned code is not on this transfer manifest.");
  if ((t.scanned[l.id] ?? 0) >= l.quantity)
    throw new Error("Excess scan rejected: this line is already complete.");
  const n = {
    ...t,
    scanned: { ...t.scanned, [l.id]: (t.scanned[l.id] ?? 0) + 1 },
    history: [...t.history, `SCAN ${l.imei ?? l.code}`],
  };
  putTransfer(getTestState(), n);
  return n;
}

// ---------------- Debts & repayments ----------------
/** POS: unpaid remainder becomes a CREDIT REQUEST DRAFT. No stock or cash change; posting blocked (credit policy unresolved). */
export function saveCreditRequestDraft(input: {
  store: StoreId;
  customerId: string;
  lines: { id: string; quantity: number }[];
  paid: Money;
  dueDate: string;
  authorizationReference: string;
}): Debt {
  assertReviewStore(input.store);
  if (!input.customerId || input.customerId === WALK_IN)
    throw new Error("A registered customer is required for a credit request.");
  const customer = ALL().customers.find((c) => c.id === input.customerId);
  if (!customer || customer.store !== input.store)
    throw new Error("Customer must belong to the selected store.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.dueDate)) throw new Error("Required");
  if (!input.authorizationReference.trim()) throw new Error("Required");
  const preview = priceTestBasket(input.store, input.lines);
  if (!/^\d+(\.\d{1,2})?$/.test(input.paid))
    throw new Error("Amount must be a non-negative decimal with up to two decimal places.");
  const remainder = minorUnits(preview.total) - minorUnits(input.paid);
  if (remainder <= 0n)
    throw new Error("Nothing remains unpaid; record a normal test sale instead.");
  const id = nextTestId("TCR");
  const debt: Debt = {
    id: `DRAFT-${id}`,
    customerId: customer.id,
    store: input.store,
    saleReference: id,
    amount: decimalValue(remainder),
    dueDate: input.dueDate,
    authorizationReference: input.authorizationReference.trim(),
    notes: preview.lines.map((l) => `${l.quantity}× ${l.name}`).join(", "),
    source: "Session draft",
  };
  addDraft("debts", debt, {
    area: "debts",
    action: "Credit request draft (posting blocked)",
    detail: `${id} · ${debt.amount} DZD`,
    store: input.store,
  });
  return debt;
}

export function saveDebtDraftChecked(input: DebtInput): Debt {
  const v = debtSchema.parse(input);
  assertReviewStore(v.store, "debt.draft");
  const snap = ALL();
  const customer = snap.customers.find((c) => c.id === v.customerId);
  if (!customer || customer.store !== v.store)
    throw new Error("Customer must belong to the selected store.");
  if (getTestState().sales.some((s) => s.id === v.saleReference))
    throw new Error("This sale is fully paid; converting it to credit is blocked.");
  const sale = snap.sales.filter((s) => s.id === v.saleReference);
  if (!sale.length) throw new Error("Original sale not found for this customer and store.");
  if (sale.some((s) => s.customerId !== v.customerId || s.store !== v.store))
    throw new Error("Original sale not found for this customer and store.");
  if (snap.debts.some((d) => d.saleReference === v.saleReference))
    throw new Error("A debt already exists for this sale.");
  if (minorUnits(v.amount) > minorUnits(sumMoney(sale.map((s) => s.amount))))
    throw new Error("Debt amount exceeds the original sale amount.");
  const id = `DRAFT-${nextTestId("TD")}`;
  return addDraft(
    "debts",
    { ...v, id, source: "Session draft" },
    {
      area: "debts",
      action: "Debt draft saved",
      detail: `${v.customerId} · ${v.amount} DZD`,
      store: v.store,
    },
  );
}

/** Separates the recorded obligation, recorded (fixture/database) repayments, unposted
 * repayment drafts and the projected remainder. Drafts are NEVER collected money. */
export interface DebtFigures {
  obligation: Money;
  obligationRecorded: boolean;
  recordedPaid: Money;
  draftRepayments: Money;
  confirmedOutstanding: Money;
  projectedRemaining: Money;
}
export function debtFigures(
  debt: { amount: Money; source: string },
  payments: { amount: Money; source: string }[],
): DebtFigures {
  const rec = payments.filter((p) => p.source !== "Session draft").map((p) => p.amount);
  const dr = payments.filter((p) => p.source === "Session draft").map((p) => p.amount);
  const recordedPaid = sumMoney(rec);
  const draftRepayments = sumMoney(dr);
  return {
    obligation: debt.amount,
    obligationRecorded: debt.source !== "Session draft",
    recordedPaid,
    draftRepayments,
    confirmedOutstanding: outstanding(debt.amount, rec),
    projectedRemaining: outstanding(debt.amount, [...rec, ...dr]),
  };
}
export function debtFiguresFor(debtId: string): DebtFigures {
  const snap = ALL();
  const d = snap.debts.find((x) => x.id === debtId);
  if (!d) throw new Error("Debt not found.");
  return debtFigures(
    d,
    snap.repayments.filter((p) => p.subjectId === debtId),
  );
}
/** Projected remainder (recorded + unposted drafts). Used only as an overpayment guard. */
export function debtBalance(debtId: string): Money {
  return debtFiguresFor(debtId).projectedRemaining;
}
export function saveRepaymentDraftChecked(debtId: string, input: RepaymentInput) {
  const v = repaymentSchema.parse(input);
  const balance = debtBalance(debtId);
  if (minorUnits(v.amount) > minorUnits(balance))
    throw new Error("Amount exceeds outstanding balance.");
  if (
    getSession().repayments.some(
      (r) => r.reference === v.reference.trim() && r.subjectId === debtId,
    )
  )
    throw new Error("This payment reference was already used.");
  const debt = ALL().debts.find((d) => d.id === debtId);
  if (!debt) throw new Error("Unknown debt.");
  assertReviewStore(debt.store, "repayment.draft");
  return addDraft(
    "repayments",
    { ...v, id: `DRAFT-${nextTestId("TPAY")}`, subjectId: debtId, source: "Session draft" },
    {
      area: "debts",
      action: "Repayment preview draft",
      detail: `${debtId} · ${v.amount} DZD`,
      store: debt.store,
    },
  );
}

// ---------------- Facility (M01 only, bank-settled) ----------------
export function saveFacilityDraft(input: FacilityInput): Facility {
  const v = facilitySchema.parse(input);
  assertReviewStore("M01", "facility.draft");
  const snap = ALL();
  if (!snap.customers.some((c) => c.id === v.customerId && c.store === "M01"))
    throw new Error("M01 customer required.");
  if (
    minorUnits(sumMoney(facilitySchedule(v).map((r) => r.amount))) !== minorUnits(v.contractPrice)
  )
    throw new Error(
      "Explicit schedule total must match the stated contract price. No rounding or final-installment formula is inferred.",
    );
  if (snap.facilities.some((f) => f.contractReference === v.contractReference.trim()))
    throw new Error("Contract reference already exists.");
  return addDraft(
    "facilities",
    { ...v, id: `DRAFT-${nextTestId("TFA")}`, source: "Session draft" },
    {
      area: "facility",
      action: "Facility contract draft",
      detail: `${v.contractReference} · ${v.contractPrice} DZD`,
      store: "M01",
    },
  );
}
export function addFacilityEvidence(
  facilityId: string,
  kind: FacilityEvent["kind"],
  input: { month: string; amount: string; reference: string },
  evidence?: string,
): FacilityEvent {
  const v = facilityEventSchema.parse(input);
  const f = ALL().facilities.find((x) => x.id === facilityId);
  if (!f || f.store !== "M01") throw new Error("M01 customer required.");
  assertReviewStore(f.store, "facility.evidence");
  const row = facilitySchedule(f).find((r) => r.month === v.month);
  if (!row) throw new Error("Month is outside this contract schedule.");
  if (kind === "Bank remittance" && !evidence?.trim())
    throw new Error("Bank remittance requires an attached bank evidence document.");
  const prior = getSession().facilityEvents.filter(
    (e) => e.facilityId === facilityId && e.kind === kind,
  );
  if (prior.some((e) => e.reference === v.reference.trim()))
    throw new Error("This evidence reference was already recorded.");
  const sum = sumMoney([
    ...prior.filter((e) => e.month === v.month).map((e) => e.amount),
    v.amount,
  ]);
  if (minorUnits(sum) > minorUnits(row.amount))
    throw new Error("Evidence exceeds the scheduled installment for this month.");
  return addDraft(
    "facilityEvents",
    {
      ...v,
      reference: v.reference.trim(),
      id: `DRAFT-${nextTestId("TFE")}`,
      facilityId,
      kind,
      source: "Session draft",
      ...(evidence ? { evidence } : {}),
    },
    {
      area: "facility",
      action: `${kind} evidence draft (unverified, no cash impact)`,
      detail: `${facilityId} · ${v.month} · ${v.amount} DZD`,
      store: "M01",
    },
  );
}

// ---------------- SAV ----------------
export function serviceCases(): ServiceCase[] {
  return ALL().cases;
}
export function saveServiceCase(input: ServiceInput): ServiceCase {
  const v = serviceSchema.parse(input);
  assertReviewStore(v.store, "sav.open");
  const storedSale = getTestState().sales.find((s) => s.publicRef === v.saleReference.trim());
  const sale = ALL().sales.find(
    (s) =>
      s.id === (storedSale?.id ?? v.saleReference.trim()) &&
      s.customerId === v.customerId &&
      s.store === v.store &&
      s.imei === v.imei.trim(),
  );
  if (!sale) throw new Error("Original sale not found for this customer, store and IMEI.");
  const testSale = getTestState().sales.find((s) => s.id === sale.id);
  if (testSale && !getTestState().phones.some((p) => p.imei === sale.imei && p.status === "Sold"))
    throw new Error("This unit is not in sold state.");
  if (
    ALL().cases.some(
      (c) =>
        (c.saleReference === sale.id || c.saleReference === testSale?.publicRef) &&
        c.imei === sale.imei &&
        c.stage !== "Closed draft",
    )
  )
    throw new Error("An open service case already exists for this sold unit.");
  return addDraft(
    "cases",
    {
      ...v,
      saleReference: testSale?.publicRef ?? sale.id,
      imei: sale.imei ?? "",
      id: `DRAFT-${nextTestId("TSAV")}`,
      stage: "Inspection",
      history: [`${v.requestedAction} · Inspection`],
      source: "Session draft",
    },
    {
      area: "service",
      action: "Service case draft",
      detail: `${sale.id} · IMEI ${sale.imei}`,
      store: v.store,
    },
  );
}
export function addServiceEvent(
  caseId: string,
  input: { stage: string; note: string; documentReference: string },
) {
  const v = serviceEventSchema.parse(input);
  const c = getSession().cases.find((x) => x.id === caseId);
  if (!c) throw new Error("Synthetic fixtures are read-only; create a test case to track events.");
  assertReviewStore(c.store, "sav.event");
  if (c.stage === "Closed draft") throw new Error("This case is closed.");
  updateDraft(
    "cases",
    caseId,
    {
      ...c,
      stage: v.stage,
      history: [...c.history, `${v.stage} · ${v.note} · ${v.documentReference}`],
    },
    {
      area: "service",
      action: "Service event draft",
      detail: `${caseId} · ${v.stage}`,
      store: c.store,
    },
  );
}
export function addRefundReview(
  caseId: string,
  input: { amount: string; reference: string; authorizationReference: string; reason: string },
) {
  const v = refundSchema.parse(input);
  const c = ALL().cases.find((x) => x.id === caseId);
  if (!c) throw new Error("Not found");
  const storedSale = getTestState().sales.find((s) => s.publicRef === c.saleReference);
  const sale = ALL().sales.find(
    (s) => s.id === (storedSale?.id ?? c.saleReference) && s.imei === c.imei,
  );
  if (!sale) throw new Error("Original sale unavailable.");
  const sameUnit = new Set(
    ALL()
      .cases.filter((x) => x.saleReference === c.saleReference && x.imei === c.imei)
      .map((x) => x.id),
  );
  const prior = getSession().refunds.filter((r) => sameUnit.has(r.caseId));
  if (prior.some((r) => r.reference === v.reference.trim()))
    throw new Error("This refund reference was already used.");
  if (minorUnits(sumMoney([...prior.map((r) => r.amount), v.amount])) > minorUnits(sale.amount))
    throw new Error("Amount exceeds outstanding balance.");
  return addDraft(
    "refunds",
    { ...v, id: `DRAFT-${nextTestId("TRF")}`, caseId, source: "Session draft" },
    {
      area: "service",
      action: "Refund review draft (no refund executed)",
      detail: `${caseId} · ${v.amount} DZD`,
      store: c.store,
    },
  );
}
export function addTestAttachment(row: Attachment) {
  return addDraft("attachments", row, {
    area: "attachments",
    action: "Attachment metadata (file not uploaded)",
    detail: row.name,
    store: "ALL",
  });
}
