import { useSyncExternalStore } from "react";
import type {
  Attachment,
  Customer,
  Debt,
  Repayment,
  Supplier,
  Purchase,
  PurchaseReceipt,
  Expense,
  Facility,
  FacilityEvent,
  ServiceCase,
  Refund,
} from "@/domain/business";
import type { StoreId } from "@/domain/erp";

// Shared synthetic demonstration session. In-memory only: nothing is persisted,
// posted, or represented as a committed database transaction. A future production
// repository (src/domain/repository.ts) replaces this module without changing
// component contracts.

export interface AuditEvent {
  id: string;
  at: string;
  area: string;
  action: string;
  subjectId: string;
  detail: string;
  store: StoreId | "ALL";
  actor: string;
}

export interface SessionState {
  customers: Customer[];
  debts: Debt[];
  repayments: Repayment[];
  suppliers: Supplier[];
  purchases: Purchase[];
  purchaseReceipts: PurchaseReceipt[];
  expenses: Expense[];
  expenseCategories: { id: string; name: string; reference: string }[];
  facilities: Facility[];
  facilityEvents: FacilityEvent[];
  cases: ServiceCase[];
  refunds: Refund[];
  attachments: Attachment[];
  audit: AuditEvent[];
}

export type SessionCollection = Exclude<keyof SessionState, "audit">;

const emptySession = (): SessionState => ({
  customers: [],
  debts: [],
  repayments: [],
  suppliers: [],
  purchases: [],
  purchaseReceipts: [],
  expenses: [],
  expenseCategories: [],
  facilities: [],
  facilityEvents: [],
  cases: [],
  refunds: [],
  attachments: [],
  audit: [],
});

let state: SessionState = emptySession();
const listeners = new Set<() => void>();
let sequence = 0;

const emit = () => {
  listeners.forEach((l) => l());
};

export function getSession(): SessionState {
  return state;
}

export function subscribeSession(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useSession(): SessionState {
  return useSyncExternalStore(subscribeSession, getSession, getSession);
}

export function addDraft<K extends SessionCollection>(
  collection: K,
  draft: SessionState[K][number],
  audit: { area: string; action: string; detail: string; store: StoreId | "ALL" },
): SessionState[K][number] {
  sequence += 1;
  state = { ...state, [collection]: [draft, ...state[collection]] };
  recordAudit({
    area: audit.area,
    action: audit.action,
    subjectId: (draft as { id: string }).id,
    detail: audit.detail,
    store: audit.store,
  });
  return draft;
}

/** Replaces a session draft by id (local test workspace only). */
export function updateDraft<K extends SessionCollection>(
  collection: K,
  id: string,
  next: SessionState[K][number],
  audit: { area: string; action: string; detail: string; store: StoreId | "ALL" },
): void {
  state = {
    ...state,
    [collection]: (state[collection] as { id: string }[]).map((r) => (r.id === id ? next : r)),
  };
  recordAudit({
    area: audit.area,
    action: audit.action,
    subjectId: id,
    detail: audit.detail,
    store: audit.store,
  });
}

export function recordAudit(event: Omit<AuditEvent, "id" | "at" | "actor">): AuditEvent {
  sequence += 1;
  const row: AuditEvent = {
    id: `SEV-${String(sequence).padStart(4, "0")}`,
    at: new Date().toISOString(),
    actor: "Test operator (unauthenticated preview)",
    ...event,
  };
  state = { ...state, audit: [row, ...state.audit] };
  emit();
  return row;
}

// Test and preview support only; production has no equivalent reset.
export function resetSession(): void {
  state = emptySession();
  sequence = 0;
  emit();
}

// Test workspace support: restores a previously persisted local session.
export function hydrateSession(next: SessionState): void {
  state = { ...emptySession(), ...next };
  sequence = next.audit.length;
  emit();
}
