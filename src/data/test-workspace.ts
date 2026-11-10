import { settleSale, type BankMethod } from "@/domain/pos-settlement";
import { invoiceYear, legalInvoiceNumber, newPublicReference } from "@/domain/warranty-documents";
import { permits } from "@/domain/permissions";
import {
  resolveSettings,
  settingSchemas,
  lowStock,
  type AppSettings,
  type SettingKey,
} from "@/domain/intake";
import { useSyncExternalStore } from "react";
import { stock } from "./demo";
import { supplierForIntake, commitIntakeSupplier } from "./supplier-provenance";
import { projectSnapshot } from "./business-demo";
import {
  warrantyChoiceSchema,
  warrantyDates,
  normalizedBuyer,
  type WarrantyChoice,
} from "@/domain/sales-review";
import { reviewIdentities, canOperateStore, type ReviewIdentity } from "@/domain/review-staff";
import {
  getSession,
  hydrateSession,
  resetSession,
  subscribeSession,
  recordAudit,
  type SessionState,
} from "./session-store";
import {
  decimalValue,
  minorUnits,
  type PhoneUnit,
  type AccessorySku,
  type StoreId,
  type Money,
} from "@/domain/erp";
import type { PhoneDraft, AccessoryDraft } from "@/domain/operations";
import type { Transfer } from "@/domain/business";
import { phoneDraftSchema, accessoryDraftSchema } from "@/domain/operations";
import { testBuyerSchema, type TestBuyer } from "@/domain/test-documents";
import { testCatalogSchema, type TestCatalogEntry } from "@/domain/test-catalog";

// Browser-local TEST WORKSPACE. Synthetic, tenant-free records persisted in
// this browser's IndexedDB only. NOT server persistence, NOT authenticated,
// NOT atomic across tabs like PostgreSQL, NOT a fiscal or legal posting.
// Every rule below re-derives prices/stock from workspace state; UI-supplied
// totals are never trusted. A production repository replaces this module.

export const FIXTURE_REVISION = "TW-2026.11-r3";
export type TestPhone = PhoneUnit & {
  imei2?: string;
  draft?: PhoneDraft;
  supplierId?: string | undefined;
  incomingReference?: string | undefined;
  receivedAt?: string | undefined;
  receivedBy?: string | undefined;
};
/** amount undefined = selling price not configured → blocked from checkout. */
export type TestAccessory = Omit<AccessorySku, "amount"> & { amount?: Money };
export interface TestMovement {
  id: string;
  at: string;
  sku: string;
  name: string;
  store: StoreId;
  quantity: number;
  reason: "RECEIVING" | "SALE" | "TRANSFER_OUT" | "TRANSFER_IN" | "ADJUSTMENT";
  reference: string;
  draft?: AccessoryDraft;
  receivingKey?: string;
  supplierId?: string | undefined;
  receivedBy?: string | undefined;
}
export interface TestSaleLine {
  id: string;
  kind: "phone" | "accessory";
  name: string;
  quantity: number;
  unitPrice: Money;
  lineTotal: Money;
  imei?: string;
  imei2?: string;
  detail?: string;
  barcode?: string;
  serial?: string;
  condition?: string;
  packaging?: string;
}
export type Tender = "Cash" | "Bank" | "Split";
export interface TestSale {
  creditAmount?: Money;
  dueDate?: string;
  cashPart?: Money;
  bankPart?: Money;
  bankMethod?: BankMethod | undefined;
  discountAmount?: Money;
  discountActor?: string;
  discountLimit?: string;
  invoiceNumber?: string;
  publicRef?: string;
  id: string;
  key: string;
  at: string;
  store: StoreId;
  seller: string;
  operatorId?: string;
  customerId: string;
  customer: string;
  tender: Tender;
  total: Money;
  paid: Money;
  change: Money;
  shiftId?: string;
  lines: TestSaleLine[];
  buyer?: TestBuyer;
  warranties?: (WarrantyChoice & { status: "NONE" | "DRAFT_PENDING" })[];
  requestFingerprint?: string;
}
export interface TestShift {
  id: string;
  store: StoreId;
  drawer: string;
  seller: string;
  openedAt: string;
  opening: Money;
  status: "OPEN" | "CLOSED";
  closedAt?: string;
  counted?: Money;
  expectedAtClose?: Money;
  discrepancy?: string;
  closedBy?: string;
  closedById?: string;
  reviewStatus?: "REVIEW_PENDING" | "OWNER_REVIEWED_NO_ISSUE" | "OWNER_REVIEWED_FLAGGED";
  ownerReview?: { actorId: string; at: string; flagged: boolean; note: string };
}
export interface TestCashMovement {
  id: string;
  shiftId: string;
  store: StoreId;
  at: string;
  kind: "OPENING" | "SALE" | "CASH_IN" | "CASH_OUT";
  amount: Money;
  reference: string;
  seller: string;
  operatorId?: string;
  key?: string;
}
export interface TestPhoneModel {
  id: string;
  brand: string;
  model: string;
  storage: string;
  condition: "NEW" | "USED";
  prices: Partial<Record<StoreId, Money>>;
}
export const phoneModelKey = (v: {
  brand: string;
  model: string;
  storage: string;
  condition: string;
}) => [v.brand, v.model, v.storage, v.condition].map((x) => x.trim().toLowerCase()).join("|");
export interface TestState {
  savCases?: import("./local-batch4b").LocalSav[] | undefined;
  stockCounts?: import("./local-stock-count").LocalStockCount[] | undefined;
  adjustmentReviews?:
    | {
        movementId: string;
        itemId: string;
        store: StoreId;
        countId?: string;
        outcome: "PENDING" | "OK" | "FLAGGED";
        note?: string;
        reviewedBy?: string;
        reviewedAt?: string;
      }[]
    | undefined;
  revision: string;
  version: number;
  phones: TestPhone[];
  accessories: TestAccessory[];
  movements: TestMovement[];
  sales: TestSale[];
  creditPayments?: {
    id: string;
    saleId: string;
    store: StoreId;
    amount: Money;
    method: "Cash" | "Bank";
    bankMethod?: BankMethod | undefined;
    actorId: string;
    at: string;
  }[];
  creditReversals?: { paymentId: string; actorId: string; at: string; reason: string }[];
  shifts: TestShift[];
  cash: TestCashMovement[];
  sellers: Record<StoreId, string>;
  seq: number;
  transfers: Transfer[];
  catalog?: TestCatalogEntry[];
  /** Sellable phone models keyed by brand+model+storage+condition, with a sale price per store. */
  phoneModels?: TestPhoneModel[];
  fixturePolicy?: "rehearsal" | "empty";
  previewActorId?: string;
  staff?: ReviewIdentity[];
  /** Owner settings (same keys as native app_settings). Absent = owner defaults. */
  settings?: Partial<Record<SettingKey, unknown>>;
  /** Accessory intake extras keyed by SKU: category, optional photo, low-stock threshold. */
  accessoryMeta?: Record<string, TestAccessoryMeta>;
  saleVoids?: { saleId: string; key: string; actorId: string; at: string; reason: string }[];
  bankReversals?: { saleId: string; amount: Money; method?: BankMethod | undefined }[];
}
export interface TestAccessoryMeta {
  category?: string;
  /** Demo only: local data URL. Native stores only a "photo pending" flag. */
  photo?: string;
  lowStockThreshold?: number;
}

export type TestRole = "SELLER" | "MANAGER" | "SUPER_ADMIN";
export const testIdentities = reviewIdentities;
export const workspaceIdentities = (s: TestState = state) => {
  const overrides = s.staff ?? [];
  return [
    ...reviewIdentities.map((u) => overrides.find((x) => x.id === u.id) ?? u),
    ...overrides.filter((u) => !reviewIdentities.some((x) => x.id === u.id)),
  ];
};
export function saveReviewStaff(input: {
  id?: string;
  name: string;
  role: "MANAGER" | "SELLER";
  store: StoreId;
}) {
  const actor = reviewActor();
  if (!actor || !permits(actor.role, "GLOBAL", input.store, "account.provision"))
    throw new Error("Owner access required.");
  if (
    !["MANAGER", "SELLER"].includes(input.role) ||
    !["M01", "M02"].includes(input.store) ||
    !input.name.trim()
  )
    throw new Error("Required");
  const prior = workspaceIdentities().find((u) => u.id === input.id);
  if (input.id && !prior) throw new Error("Unknown identity.");
  if (prior && (prior.role === "SUPER_ADMIN" || prior.id === actor.id))
    throw new Error("Cannot change this identity.");
  const row: ReviewIdentity = {
    id: prior?.id ?? nextId("STAFF"),
    name: prior?.name ?? input.name.trim(),
    role: input.role,
    stores: [input.store],
    active: true,
  };
  set({ ...state, staff: [...(state.staff ?? []).filter((u) => u.id !== row.id), row] });
  recordAudit({
    area: "users",
    action: prior ? "Local staff activated" : "Local staff added",
    subjectId: row.id,
    detail: `${row.role} · ${input.store}`,
    store: input.store,
  });
  return row;
}
/** Active POS operators, including M02 Manager and owner; local preview only. */
export const sellersFor = (store: StoreId) =>
  (getTestState().fixturePolicy === "empty"
    ? (getTestState().staff ?? [])
    : workspaceIdentities()
  ).filter((u) => canOperateStore(u, store));
export const reviewActor = (s: TestState = state) =>
  workspaceIdentities(s).find((u) => u.active && u.id === (s.previewActorId ?? "U-OWN")) ??
  reviewIdentities.find((u) => u.id === "U-OWN");
export const testSettings = (s: TestState = state): AppSettings =>
  resolveSettings(s.settings ?? {});
/** settings.save is SUPER_ADMIN only (permissions.ts). */
export function saveTestSetting<K extends SettingKey>(key: K, value: AppSettings[K]) {
  const actor = reviewActor();
  if (
    !actor ||
    !permits(actor.role, actor.role === "SUPER_ADMIN" ? "GLOBAL" : "M01", "M01", "settings.save")
  )
    throw new Error("Owner access required.");
  const parsed = settingSchemas[key].parse(value);
  const before = testSettings()[key];
  set({ ...state, settings: { ...(state.settings ?? {}), [key]: parsed } });
  recordAudit({
    area: "settings",
    action: "Owner setting saved",
    subjectId: key,
    detail: `${JSON.stringify(before)} → ${JSON.stringify(parsed)}`,
    store: "ALL",
  });
  return testSettings();
}
export function saveTestAccessoryMeta(sku: string, meta: TestAccessoryMeta) {
  const row = state.accessories.find((a) => a.id === sku);
  if (!row) throw new Error("Unknown SKU.");
  assertReviewStore(row.store, "catalog.save");
  const threshold = meta.lowStockThreshold;
  if (threshold !== undefined && (!Number.isInteger(threshold) || threshold < 0))
    throw new Error("Threshold must be a whole number.");
  if (meta.category && !testSettings()["intake.accessoryCategories"].includes(meta.category))
    throw new Error("Unknown category.");
  if (meta.photo && !/^data:image\/(png|jpeg|webp);base64,/.test(meta.photo))
    throw new Error("Photo must be an image.");
  const clean: TestAccessoryMeta = {
    ...(meta.category ? { category: meta.category } : {}),
    ...(meta.photo ? { photo: meta.photo } : {}),
    ...(threshold !== undefined ? { lowStockThreshold: threshold } : {}),
  };
  set({ ...state, accessoryMeta: { ...(state.accessoryMeta ?? {}), [sku]: clean } });
  return clean;
}
export const testAccessoryAlert = (sku: string, s: TestState = state) => {
  const row = s.accessories.find((a) => a.id === sku);
  return row ? lowStock(row.quantity, s.accessoryMeta?.[sku]?.lowStockThreshold) : false;
};
export function assertReviewStore(store: StoreId, operation = "operational.read") {
  const actor = reviewActor();
  if (
    !actor ||
    !canOperateStore(actor, store) ||
    !permits(actor.role, actor.role === "SUPER_ADMIN" ? "GLOBAL" : store, store, operation)
  )
    throw new Error("This operator cannot operate this store.");
  return actor;
}
export function setReviewActor(id: string) {
  const actor = workspaceIdentities().find((u) => u.id === id && u.active);
  if (!actor) throw new Error("Select an active operator.");
  set({
    ...state,
    previewActorId: id,
    sellers: {
      ...state.sellers,
      ...Object.fromEntries(actor.stores.map((store) => [store, actor.name])),
    },
  });
}
const validOperator = (store: StoreId, name: string) => {
  assertReviewStore(store);
  const who = sellersFor(store).find((u) => u.name === name);
  if (!who) throw new Error("This test identity is not a member of this store.");
  const actor = reviewActor();
  if (actor?.role !== "SUPER_ADMIN" && actor?.id !== who.id)
    throw new Error("Select your own active operator.");
  return who;
};
export const WALK_IN = "WALK-IN";

const extraPhones: TestPhone[] = [
  {
    id: "PH-006",
    kind: "phone",
    name: "iPhone 14",
    detail: "128 GB · Blue · 92%",
    store: "M01",
    status: "Available",
    amount: "98000",
    code: "PH000006",
    imei: "350000000000061",
    imei2: "350000000000062",
    condition: "USED",
    packaging: "OPEN_BOX",
    category: "Apple",
  },
  {
    id: "PH-007",
    kind: "phone",
    name: "Samsung Galaxy A35",
    detail: "128 GB · Lilac",
    store: "M02",
    status: "Available",
    amount: "52000",
    code: "PH000007",
    imei: "350000000000071",
    imei2: "350000000000072",
    condition: "NEW",
    packaging: "SEALED",
    category: "Samsung",
  },
  {
    id: "PH-008",
    kind: "phone",
    name: "Redmi 13C",
    detail: "128 GB · Midnight black",
    store: "M02",
    status: "Available",
    amount: "24500",
    code: "PH000008",
    imei: "350000000000081",
    imei2: "350000000000082",
    condition: "NEW",
    packaging: "SEALED",
    category: "Xiaomi",
  },
];
const extraAccessories: TestAccessory[] = [
  {
    id: "AC-005",
    kind: "accessory",
    name: "Silicone case",
    detail: "Galaxy A35 · Clear",
    store: "M02",
    status: "Available",
    amount: "1500",
    quantity: 14,
    code: "AC000005",
    category: "Cases",
  },
  {
    id: "AC-006",
    kind: "accessory",
    name: "USB-C power adapter",
    detail: "25 W · Black",
    store: "M02",
    status: "Available",
    amount: "5200",
    quantity: 8,
    code: "AC000006",
    category: "Chargers",
  },
];

export function seedTestState(): TestState {
  const phones = [
    ...stock.filter((i): i is PhoneUnit => i.kind === "phone").map((p) => ({ ...p })),
    ...extraPhones.map((p) => ({ ...p })),
  ];
  const accessories: TestAccessory[] = [
    ...stock.filter((i): i is AccessorySku => i.kind === "accessory").map((a) => ({ ...a })),
    ...extraAccessories.map((a) => ({ ...a })),
  ];
  return {
    revision: FIXTURE_REVISION,
    version: 0,
    phones,
    accessories,
    movements: [],
    sales: [],
    shifts: [],
    cash: [],
    sellers: { M01: "Test seller 001", M02: "Test manager M02" },
    seq: 0,
    transfers: [],
  };
}

let state: TestState = seedTestState();
const serverSnapshot = state;
const listeners = new Set<() => void>();
let hydrated = false;
let replacing = false;
let writes = Promise.resolve();
const emitOnly = () => listeners.forEach((l) => l());
const set = (next: TestState) => {
  state = { ...next, version: next.version + 1 };
  emitOnly();
  persist();
};
export const getTestState = () => state;
export const subscribeTest = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};
export const useTestWorkspace = () =>
  useSyncExternalStore(subscribeTest, getTestState, () => serverSnapshot);
/** Internal mutators shared with src/data/test-workflows.ts only. */
export const commitTest = (next: TestState) => set(next);
export const nextTestId = (prefix: string) => nextId(prefix);
const nextId = (prefix: string) => {
  const n = state.seq + 1;
  state = { ...state, seq: n };
  return `${prefix}-${String(n).padStart(4, "0")}`;
};

// ---------- IndexedDB persistence with failure + multi-tab handling ----------
const DB = "ph-test-workspace",
  STORE = "kv";
let storageMode: "indexeddb" | "memory" = "memory";
let storageError = "";
let channel: BroadcastChannel | null = null;
export const getStorageMode = () => storageMode;
export const getStorageError = () => storageError;
function openDb(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function idbGet<T>(key: string): Promise<T | undefined> {
  const db = await openDb();
  return new Promise((res, rej) => {
    const r = db.transaction(STORE).objectStore(STORE).get(key);
    r.onsuccess = () => res(r.result as T | undefined);
    r.onerror = () => rej(r.error);
  });
}
/** Writes workspace and session in ONE IndexedDB transaction (local consistency only). */
async function idbPutBoth(ws: TestState, session: SessionState) {
  const db = await openDb();
  return new Promise<void>((res, rej) => {
    const tx = db.transaction(STORE, "readwrite");
    const s = tx.objectStore(STORE);
    s.put(ws, "workspace");
    s.put(session, "session");
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
    tx.onabort = () => rej(tx.error);
  });
}
function persist() {
  if (replacing || !hydrated || storageMode !== "indexeddb") return;
  const snapshot = state;
  const session = getSession();
  writes = writes
    .then(() => idbPutBoth(snapshot, session))
    .then(() => {
      storageError = "";
      channel?.postMessage({ version: snapshot.version });
    })
    .catch((e) => {
      storageError = String(e?.message ?? e);
      storageMode = "memory";
      emitOnly();
    });
}
export function migrateReviewWorkspace(ws: TestState): TestState {
  const sellers = { ...ws.sellers };
  for (const store of ["M01", "M02"] as StoreId[]) {
    const old = workspaceIdentities(ws).find((u) => u.name === sellers[store]);
    if (old && !old.active)
      sellers[store] = store === "M01" ? "Test seller 001" : "Test manager M02";
  }
  return {
    ...ws,
    sellers,
    fixturePolicy: ws.fixturePolicy ?? "rehearsal",
    catalog: ws.catalog ?? [],
    transfers: ws.transfers ?? [],
  };
}
async function reloadFromDb() {
  const [ws, session] = await Promise.all([
    idbGet<TestState>("workspace"),
    idbGet<SessionState>("session"),
  ]);
  if (ws && ws.version >= state.version) {
    replacing = true;
    state = migrateReviewWorkspace(ws);
    if (session) hydrateSession(session);
    replacing = false;
    emitOnly();
  }
}

/** Call once on the client after mount. */
export async function hydrateTestWorkspace(): Promise<void> {
  if (hydrated || typeof indexedDB === "undefined") return;
  try {
    const [ws, session] = await Promise.all([
      idbGet<TestState>("workspace"),
      idbGet<SessionState>("session"),
    ]);
    storageMode = "indexeddb";
    hydrated = true;
    if (ws) {
      state = migrateReviewWorkspace(ws);
      if (session) hydrateSession(session);
    } else {
      resetSession();
      state = seedTestState();
      persist();
    }
    subscribeSession(persist);
    if (typeof BroadcastChannel !== "undefined") {
      channel = new BroadcastChannel("ph-test-workspace");
      channel.onmessage = (e) => {
        if ((e.data?.version ?? 0) !== state.version) void reloadFromDb();
      };
    }
    emitOnly();
  } catch (e) {
    storageMode = "memory";
    storageError = String((e as Error)?.message ?? e);
    hydrated = true;
    emitOnly();
  }
}

export function emptyReviewState(): TestState {
  return {
    revision: FIXTURE_REVISION,
    fixturePolicy: "empty",
    version: 0,
    phones: [],
    accessories: [],
    movements: [],
    sales: [],
    shifts: [],
    cash: [],
    sellers: { M01: "", M02: "" },
    seq: 0,
    transfers: [],
    catalog: [],
  };
}
export const includesReviewFixtures = () => state.fixturePolicy !== "empty";
function replaceLocalWorkspace(next: TestState) {
  replacing = true;
  resetSession();
  replacing = false;
  set({ ...next, version: state.version });
}
export function resetTestWorkspace() {
  replaceLocalWorkspace({ ...seedTestState(), fixturePolicy: "rehearsal" });
}
export const LOCAL_REVIEW_TARGET = {
  database: DB,
  store: STORE,
  namespace: "phonehouse-browser-review-v1",
} as const;
export type CleanStart = "rehearsal" | "empty";
export const cleanStartPhrase = (kind: CleanStart) =>
  kind === "empty" ? "EMPTY LOCAL REVIEW" : "RESTORE FICTIONAL FIXTURES";
/** Browser namespace only. No injected transports, credentials or remote service calls. */
export async function prepareLocalCleanStart(input: {
  kind: CleanStart;
  confirmation: string;
  acknowledged: boolean;
  target: typeof LOCAL_REVIEW_TARGET;
}) {
  if (typeof indexedDB === "undefined" || storageMode !== "indexeddb" || !hydrated)
    throw new Error("Persistent browser storage is required.");
  if (
    input.target.database !== DB ||
    input.target.store !== STORE ||
    input.target.namespace !== LOCAL_REVIEW_TARGET.namespace
  )
    throw new Error("Only the browser-local review namespace is allowed.");
  if (
    !["empty", "rehearsal"].includes(input.kind) ||
    !input.acknowledged ||
    input.confirmation !== cleanStartPhrase(input.kind)
  )
    throw new Error("Explicit local deletion confirmation is required.");
  replaceLocalWorkspace(
    input.kind === "empty"
      ? emptyReviewState()
      : { ...seedTestState(), fixturePolicy: "rehearsal" },
  );
  await writes;
  if (storageMode !== "indexeddb") throw new Error("Local save failed; do not close this browser.");
}
export function reviewDataSummary() {
  const s = getSession();
  return {
    sales: state.sales.length,
    phones: state.phones.length,
    accessories: state.accessories.reduce((n, a) => n + a.quantity, 0),
    clients: s.customers.length,
    cash: state.shifts.length,
    audit: s.audit.length,
    documents: state.sales.filter((x) => x.buyer).length + s.attachments.length,
    drafts:
      s.debts.length +
      s.repayments.length +
      s.facilities.length +
      s.facilityEvents.length +
      s.refunds.length +
      s.cases.length +
      s.purchases.length +
      s.purchaseReceipts.length +
      s.expenses.length +
      s.suppliers.length +
      s.expenseCategories.length,
    transfers: state.transfers.length,
    catalog: state.catalog?.length ?? 0,
  };
}
export function exportLocalReview() {
  return {
    format: "phonehouse-browser-review-v1",
    localOnly: true,
    exportedAt: new Date().toISOString(),
    workspace: structuredClone(state),
    session: structuredClone(getSession()),
  };
}

export function addTestCatalog(input: unknown) {
  const v = testCatalogSchema.parse(input);
  const entries = state.catalog ?? [];
  if (
    entries.some(
      (e) =>
        [e.brand, e.model, e.color, e.variant].join("|").toLowerCase() ===
        [v.brand, v.model, v.color, v.variant].join("|").toLowerCase(),
    )
  )
    throw new Error("This catalog variant already exists.");
  const row = { ...v, id: nextId("TCAT") };
  set({ ...state, catalog: [row, ...entries] });
  recordAudit({
    area: "catalog",
    action: "Test catalog variant created",
    subjectId: row.id,
    detail: `${v.brand} · ${v.model} · ${v.color} · ${v.variant}`,
    store: "ALL",
  });
  return row;
}

/** Create the sellable model inline (catalog.save) and set THIS store's sale price (price.set). Never asks for cost. */
export function saveTestPhoneModel(input: {
  store: StoreId;
  brand: string;
  model: string;
  storage: string;
  condition: string;
  salePrice: Money;
}): TestPhoneModel {
  const v = {
    brand: input.brand.trim(),
    model: input.model.trim(),
    storage: input.storage.trim(),
    condition: input.condition,
  };
  if (!v.brand || !v.model || !v.storage || !["NEW", "USED"].includes(v.condition))
    throw new Error("Brand, model, storage and condition (NEW or USED) are required.");
  if (!/^\d+(\.\d{1,2})?$/.test(input.salePrice) || minorUnits(input.salePrice) <= 0n)
    throw new Error("Use a positive amount");
  const models = state.phoneModels ?? [];
  let row = models.find((m) => phoneModelKey(m) === phoneModelKey(v));
  if (!row) {
    assertReviewStore(input.store, "catalog.save");
    assertReviewStore(input.store, "price.set");
    row = {
      id: nextId("TPM"),
      ...v,
      condition: v.condition as "NEW" | "USED",
      prices: { [input.store]: input.salePrice },
    };
    set({ ...state, phoneModels: [row, ...models] });
    recordAudit({
      area: "catalog",
      action: "Test catalog variant created",
      subjectId: row.id,
      detail: `${v.brand} · ${v.model} · ${v.storage} · ${v.condition}`,
      store: input.store,
    });
  } else if (row.prices[input.store] !== input.salePrice) {
    assertReviewStore(input.store, "price.set");
    const id = row.id;
    row = { ...row, prices: { ...row.prices, [input.store]: input.salePrice } };
    const next = row;
    set({ ...state, phoneModels: models.map((m) => (m.id === id ? next : m)) });
  } else return row;
  recordAudit({
    area: "catalog",
    action: "Test selling price set",
    subjectId: row.id,
    detail: `${input.salePrice} DZD`,
    store: input.store,
  });
  return row;
}

// ---------- Inventory ----------
export function phoneIdentities(s: TestState = state): string[] {
  return s.phones.flatMap((p) => [p.imei, p.imei2 ?? "", p.draft?.serial ?? ""]).filter(Boolean);
}

/** Search a physical phone by brand, model, IMEI1, IMEI2, serial or unit barcode. */
export function searchPhones<T extends TestPhone>(rows: T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((p) =>
    [
      p.name,
      p.category,
      p.detail,
      p.imei,
      p.imei2,
      p.code,
      p.draft?.imei2,
      p.draft?.serial,
      p.draft?.brand,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(q),
  );
}
/** Collision-free internal unit barcode; a shared manufacturer model barcode is never a unit identity. */
export function nextPhoneBarcode(store: StoreId, s: TestState = state): string {
  const used = new Set([
    ...s.phones.flatMap((p) => [p.code ?? "", p.id]),
    ...s.accessories.flatMap((a) => [a.code ?? "", a.id]),
  ]);
  let n = s.seq + 1;
  let code = "";
  do {
    code = `PHU-${store}-${String(n++).padStart(6, "0")}`;
  } while (used.has(code));
  return code;
}
const recentIntakeKeys = new Map<string, string>();
export function addTestPhone(input: PhoneDraft, opts: { intakeKey?: string } = {}): TestPhone {
  if (opts.intakeKey) {
    const prior = recentIntakeKeys.get(opts.intakeKey);
    const existing = prior && state.phones.find((p) => p.id === prior);
    if (existing) return existing;
  }
  const value = phoneDraftSchema.parse(input);
  assertReviewStore(value.store, "stock.standalone");
  const ids = new Set(phoneIdentities().map((v) => v.toUpperCase()));
  if (value.imei2 && value.imei2 === value.imei1) throw new Error("IMEI1 and IMEI2 must differ.");
  for (const id of [value.imei1, value.imei2, value.serial].filter(Boolean))
    if (ids.has(id.toUpperCase())) throw new Error(`IMEI ${id} already exists in test stock.`);
  const catalog = state.catalog ?? [];
  const brand =
    catalog.find((c) => c.brand.toLowerCase() === value.brand.toLowerCase())?.brand ??
    state.phones.find((p) => p.category?.toLowerCase() === value.brand.toLowerCase())?.category ??
    value.brand;
  const model =
    catalog.find((c) => c.model.toLowerCase() === value.name.toLowerCase())?.model ?? value.name;
  const barcode = value.barcode || nextPhoneBarcode(value.store);
  const codes = [
    ...state.phones.flatMap((p) => [p.code ?? "", p.id]),
    ...state.accessories.flatMap((a) => [a.code ?? "", a.id]),
  ];
  if (codes.includes(barcode)) throw new Error("Barcode already exists.");
  if (value.storage && value.salePrice)
    saveTestPhoneModel({
      store: value.store,
      brand,
      model,
      storage: value.storage,
      condition: value.condition,
      salePrice: value.salePrice,
    });
  const source = supplierForIntake(value.store, value.supplierId, value.newSupplierName);
  const draft: PhoneDraft = {
    ...value,
    brand,
    name: model,
    barcode,
    newSupplierName: undefined,
    supplierId: source.id,
  };
  const id = nextId("TPH");
  const detail = [value.storage, value.color, value.battery ? `${value.battery}%` : ""]
    .filter(Boolean)
    .join(" · ");
  const phone: TestPhone = {
    id,
    kind: "phone",
    name: model,
    detail,
    store: value.store,
    status: "Available",
    imei: value.imei1,
    ...(value.imei2 ? { imei2: value.imei2 } : {}),
    condition: value.condition,
    packaging: value.packaging,
    category: brand,
    amount: value.salePrice,
    code: barcode,
    draft,
    supplierId: source.id,
    incomingReference: value.incomingReference,
    receivedAt: new Date().toISOString(),
    receivedBy: reviewActor()?.id,
  };
  replacing = true;
  commitIntakeSupplier(source);
  replacing = false;
  set({ ...state, phones: [phone, ...state.phones] });
  if (opts.intakeKey) recentIntakeKeys.set(opts.intakeKey, id);
  recordAudit({
    area: "phones",
    action: "Test phone intake",
    subjectId: id,
    detail: `${model} · ${value.imei1 ? `IMEI ${value.imei1}` : `S/N ${value.serial}`}`,
    store: value.store,
  });
  return phone;
}

const statusFor = (q: number): AccessorySku["status"] =>
  q === 0 ? "Sold" : q <= 3 ? "Low stock" : "Available";

export function nextAccessoryBarcode(s: TestState = state): string {
  const used = new Set([
    ...s.phones.flatMap((p) => [p.id, p.code ?? ""]),
    ...s.accessories.flatMap((a) => [a.id, a.code ?? ""]),
  ]);
  let n = s.seq + 1;
  let code = "";
  do {
    code = `PHA-${String(n++).padStart(6, "0")}`;
  } while (used.has(code));
  return code;
}
export function receiveTestAccessory(
  input: AccessoryDraft,
  opts: { receivingKey?: string } = {},
): { sku: string; balance: number; priced: boolean } {
  const value = accessoryDraftSchema.parse(input);
  assertReviewStore(value.store, "stock.standalone");
  if (opts.receivingKey) {
    const old = state.movements.find((m) => m.receivingKey === opts.receivingKey);
    if (old) {
      const row = state.accessories.find((a) => a.id === old.sku && a.store === old.store);
      if (row) return { sku: row.id, balance: row.quantity, priced: row.amount !== undefined };
    }
  }
  assertReviewStore(value.store, "stock.standalone");
  const qty = Number(value.quantity);
  if (!/^\d+$/.test(value.quantity) || !Number.isSafeInteger(qty) || qty <= 0)
    throw new Error("Quantity must be a positive whole number.");
  const matched = state.accessories.find(
    (a) => (value.sku && a.id === value.sku) || (value.barcode && a.code === value.barcode),
  );
  if (matched && matched.store !== value.store)
    throw new Error(
      "This SKU belongs to the other store. Store stock is isolated; use a transfer.",
    );
  if (matched && value.sku && matched.id !== value.sku) throw new Error("Barcode already exists.");
  const existing = matched;
  if (existing && !Number.isSafeInteger(existing.quantity + qty))
    throw new Error("Quantity must be a positive whole number.");
  let accessories: TestAccessory[];
  let sku: string;
  let balance: number;
  let priced: boolean;
  if (existing) {
    balance = existing.quantity + qty;
    sku = existing.id;
    priced = existing.amount !== undefined;
    accessories = state.accessories.map((a) =>
      a === existing ? { ...a, quantity: balance, status: statusFor(balance) } : a,
    );
  } else {
    if (state.accessories.some((a) => a.id === value.sku))
      throw new Error(
        "This SKU belongs to the other store. Store stock is isolated; use a transfer.",
      );
    let n = state.seq + 1;
    sku = value.sku || `TAC-${String(n).padStart(4, "0")}`;
    while (
      !value.sku &&
      [...state.accessories, ...state.phones].some((a) => a.id === sku || a.code === sku)
    )
      sku = `TAC-${String(++n).padStart(4, "0")}`;
    value.barcode = value.barcode || nextAccessoryBarcode();
    if (
      [...state.accessories, ...state.phones].some(
        (a) => a.code === value.barcode || a.id === value.barcode || a.id === sku || a.code === sku,
      )
    )
      throw new Error("Barcode already exists.");
    // New SKU: no invented selling price. It stays blocked from checkout until a price is configured.
    balance = qty;
    priced = !!value.salePrice;
    accessories = [
      {
        id: sku,
        kind: "accessory",
        name: value.name,
        detail: [value.variant, value.compatibility].filter(Boolean).join(" · "),
        store: value.store,
        status: statusFor(qty),
        quantity: qty,
        code: value.barcode,
        category: value.category,
        ...(value.salePrice ? { amount: value.salePrice } : {}),
      },
      ...state.accessories,
    ];
  }
  const source = supplierForIntake(value.store, value.supplierId, value.newSupplierName);
  const movementId = nextId("TMV");
  const movement: TestMovement = {
    id: movementId,
    at: new Date().toISOString(),
    sku,
    name: existing?.name ?? value.name,
    store: value.store,
    quantity: qty,
    reason: "RECEIVING",
    supplierId: source.id,
    receivedBy: reviewActor()?.id,
    reference: value.reference || movementId,
    draft: {
      ...value,
      newSupplierName: undefined,
      supplierId: source.id,
      sku,
      barcode: existing?.code ?? value.barcode,
    },
    ...(opts.receivingKey ? { receivingKey: opts.receivingKey } : {}),
  };
  replacing = true;
  commitIntakeSupplier(source);
  replacing = false;
  set({ ...state, accessories, movements: [movement, ...state.movements] });
  recordAudit({
    area: "accessories",
    action: "Test receiving",
    subjectId: sku,
    detail: `+${qty} · ${value.reference}`,
    store: value.store,
  });
  return { sku, balance, priced };
}

/** Explicit, validated selling price for an unpriced test SKU (owner pricing is a test input, never invented). */
export function setTestAccessoryPrice(sku: string, price: Money) {
  if (!/^\d+(\.\d{1,2})?$/.test(price) || minorUnits(price) <= 0n)
    throw new Error("Use a positive amount");
  const a = state.accessories.find((x) => x.id === sku);
  if (!a) throw new Error("Unknown SKU.");
  assertReviewStore(a.store, "price.set");
  set({
    ...state,
    accessories: state.accessories.map((x) => (x.id === sku ? { ...x, amount: price } : x)),
  });
  recordAudit({
    area: "accessories",
    action: "Test selling price set",
    subjectId: sku,
    detail: `${price} DZD`,
    store: a.store,
  });
}

export function adjustTestAccessory(
  sku: string,
  store: StoreId,
  quantity: string,
  reference: string,
) {
  assertReviewStore(store);
  if (
    !/^[+-]?\d+$/.test(quantity) ||
    !Number.isSafeInteger(Number(quantity)) ||
    Number(quantity) === 0
  )
    throw new Error("Use a non-zero whole quantity.");
  if (!reference.trim()) throw new Error("Required");
  const item = state.accessories.find((a) => a.id === sku && a.store === store);
  if (!item)
    throw new Error(
      "This SKU belongs to the other store. Store stock is isolated; use a transfer.",
    );
  const delta = Number(quantity);
  const balance = item.quantity + delta;
  if (!Number.isSafeInteger(balance) || balance < 0)
    throw new Error(`Insufficient stock for ${sku}.`);
  const movement: TestMovement = {
    id: nextId("TMV"),
    at: new Date().toISOString(),
    sku,
    name: item.name,
    store,
    quantity: delta,
    reason: "ADJUSTMENT",
    reference: reference.trim(),
  };
  set({
    ...state,
    accessories: state.accessories.map((a) =>
      a.id === sku ? { ...a, quantity: balance, status: statusFor(balance) } : a,
    ),
    adjustmentReviews: [
      ...(state.adjustmentReviews ?? []),
      { movementId: movement.id, itemId: sku, store, outcome: "PENDING" },
    ],
    movements: [movement, ...state.movements],
  });
  recordAudit({
    area: "accessories",
    action: "Test quantity adjustment",
    subjectId: sku,
    detail: `${delta} · ${reference}`,
    store,
  });
  return balance;
}

/** Names are local document metadata, not customer verification or fiscal identity. */
export function nameTestSale(id: string, buyer: TestBuyer) {
  const value = testBuyerSchema.parse(buyer);
  const sale = state.sales.find((s) => s.id === id);
  if (!sale) throw new Error("Unknown sale.");
  assertReviewStore(sale.store);
  set({ ...state, sales: state.sales.map((s) => (s.id === id ? { ...s, buyer: value } : s)) });
}

export function setTestSeller(store: StoreId, name: string) {
  const from = state.sellers[store];
  assertReviewStore(store);
  const next = sellersFor(store).find((u) => u.name === name);
  const actor = reviewActor();
  if (!next || (actor?.role !== "SUPER_ADMIN" && !canOperateStore(next, store)))
    throw new Error("This test identity is not a member of this store.");
  if (actor?.role !== "SUPER_ADMIN" && next.id !== actor?.id) setReviewActor(next.id);
  set({ ...state, sellers: { ...state.sellers, [store]: name } });
  recordAudit({
    area: "pos",
    action: "Test seller attribution changed (unauthenticated preview)",
    subjectId: store,
    detail: `${from} → ${name}`,
    store,
  });
}

// ---------- Cash: one physical drawer per store, sequential shifts ----------
export const drawerOf = (store: StoreId) => `DRAWER-${store}`;
export const openShiftFor = (store: StoreId, s: TestState = state) =>
  s.shifts.find((x) => x.store === store && x.status === "OPEN");
const money = (v: string) => {
  if (!/^\d+(\.\d{1,2})?$/.test(v))
    throw new Error("Use a non-negative decimal, at most two decimal places");
  return minorUnits(v);
};
export function expectedCash(shiftId: string, s: TestState = state): Money {
  const total = s.cash
    .filter((c) => c.shiftId === shiftId)
    .reduce(
      (sum, c) => sum + (c.kind === "CASH_OUT" ? -minorUnits(c.amount) : minorUnits(c.amount)),
      0n,
    );
  return decimalValue(total);
}
export function openTestShift(store: StoreId, seller: string, opening: Money): TestShift {
  if (openShiftFor(store))
    throw new Error("A shift is already open on this drawer. Close it with a blind count first.");
  const operator = validOperator(store, seller);
  money(opening);
  const id = nextId("TSH");
  const at = new Date().toISOString();
  const shift: TestShift = {
    id,
    store,
    drawer: drawerOf(store),
    seller,
    openedAt: at,
    opening,
    status: "OPEN",
  };
  set({
    ...state,
    shifts: [shift, ...state.shifts],
    cash: [
      {
        id: `${id}-OPEN`,
        shiftId: id,
        store,
        at,
        kind: "OPENING",
        amount: opening,
        reference: id,
        seller,
        operatorId: operator.id,
      },
      ...state.cash,
    ],
  });
  recordAudit({
    area: "cash",
    action: "Test shift opened",
    subjectId: id,
    detail: `${opening} DZD · ${seller}`,
    store,
  });
  return shift;
}
export function addTestCashMovement(
  store: StoreId,
  direction: "CASH_IN" | "CASH_OUT",
  amount: Money,
  reference: string,
  opts: { shiftId?: string | undefined; key?: string } = {},
): TestCashMovement {
  assertReviewStore(store, "cash.evidence");
  const operator = validOperator(store, state.sellers[store]);
  const shift = openShiftFor(store);
  if (!shift) throw new Error("No open test shift on this drawer.");
  if (opts.shiftId && opts.shiftId !== shift.id)
    throw new Error("This cash session is closed or changed.");
  if (
    state.cash.some(
      (m) =>
        m.shiftId === shift.id &&
        (opts.key ? m.key === opts.key : m.reference === reference.trim()) &&
        m.kind === direction,
    )
  )
    throw new Error("This cash movement was already recorded.");
  const v = money(amount);
  if (v <= 0n) throw new Error("Use a positive amount");
  if (!reference.trim()) throw new Error("Required");
  if (direction === "CASH_OUT" && v > minorUnits(expectedCash(shift.id)))
    throw new Error("Cash out exceeds the drawer balance.");
  const row: TestCashMovement = {
    id: nextId("TCM"),
    shiftId: shift.id,
    store,
    at: new Date().toISOString(),
    kind: direction,
    amount,
    reference: reference.trim(),
    seller: state.sellers[store],
    operatorId: operator.id,
    ...(opts.key ? { key: opts.key } : {}),
  };
  set({ ...state, cash: [row, ...state.cash] });
  recordAudit({
    area: "cash",
    action: direction === "CASH_IN" ? "Test cash in" : "Test cash out",
    subjectId: row.id,
    detail: `${amount} DZD · ${reference}`,
    store,
  });
  return row;
}
/** Blind close: the expected amount is computed only here, after the count is submitted. */
export function blindCloseTestShift(
  store: StoreId,
  counted: Money,
  opts: { shiftId?: string | undefined; operator?: string | undefined } = {},
): TestShift {
  const closer = validOperator(store, opts.operator ?? state.sellers[store]);
  const shift = openShiftFor(store);
  if (!shift) throw new Error("No open test shift on this drawer.");
  if (opts.shiftId && opts.shiftId !== shift.id)
    throw new Error("This cash session is closed or changed.");
  const c = money(counted);
  const expected = expectedCash(shift.id);
  const d = c - minorUnits(expected);
  const closed: TestShift = {
    ...shift,
    status: "CLOSED",
    closedBy: closer.name,
    closedById: closer.id,
    ...(store === "M01" ? { reviewStatus: "REVIEW_PENDING" as const } : {}),
    closedAt: new Date().toISOString(),
    counted,
    expectedAtClose: expected,
    discrepancy: `${d < 0n ? "-" : ""}${decimalValue(d < 0n ? -d : d)}`,
  };
  set({ ...state, shifts: state.shifts.map((x) => (x.id === shift.id ? closed : x)) });
  recordAudit({
    area: "cash",
    action: "Test blind close",
    subjectId: shift.id,
    detail: `counted ${counted} · discrepancy ${closed.discrepancy}`,
    store,
  });
  return closed;
}

/** Retrospective metadata only: never changes close amounts, actor, time or session state. */
export function reviewTestClose(
  shiftId: string,
  flagged: boolean,
  note: string,
  actorId: string,
): TestShift {
  const actor = reviewActor();
  if (actor?.id !== actorId || actor.role !== "SUPER_ADMIN")
    throw new Error("Only Super Admin may review a closed drawer.");
  const shift = state.shifts.find((s) => s.id === shiftId);
  if (!shift || shift.status !== "CLOSED") throw new Error("Close the drawer before owner review.");
  if (shift.ownerReview) throw new Error("This close was already reviewed.");
  if (flagged && !note.trim()) throw new Error("Explain the flagged discrepancy.");
  const reviewed: TestShift = {
    ...shift,
    reviewStatus: flagged ? "OWNER_REVIEWED_FLAGGED" : "OWNER_REVIEWED_NO_ISSUE",
    ownerReview: { actorId, flagged, note: note.trim(), at: new Date().toISOString() },
  };
  set({ ...state, shifts: state.shifts.map((s) => (s.id === shiftId ? reviewed : s)) });
  recordAudit({
    area: "cash",
    action: "Owner retrospective close review",
    subjectId: shiftId,
    detail: flagged ? "Flagged: " + note.trim() : "No issue",
    store: shift.store,
  });
  return reviewed;
}

// ---------- Sale (LOCAL TEST ONLY) ----------
export interface SaleRequest {
  key: string;
  store: StoreId;
  lines: { id: string; quantity: number }[];
  customerId: string;
  customerName: string;
  tender: Tender;
  paid: Money;
  buyer?: TestBuyer;
  shiftId?: string | undefined;
  warranties?: WarrantyChoice[];
  newBuyer?: TestBuyer;
  cashAmount?: Money | undefined;
  bankAmount?: Money | undefined;
  bankMethod?: BankMethod | undefined;
  creditAmount?: Money | undefined;
  dueDate?: string | undefined;
  discountAmount?: Money | undefined;
}
export interface SalePreview {
  lines: TestSaleLine[];
  total: Money;
  change: Money;
}

/** Re-derives every price and stock state from the workspace. Throws on any inconsistency. */
/** Pure, stock-validated basket pricing from current workspace state. No payment assumption. */
export function priceTestBasket(
  store: StoreId,
  reqLines: { id: string; quantity: number }[],
  s: TestState = state,
): { lines: TestSaleLine[]; total: string } {
  const req = { store, lines: reqLines };
  if (!req.lines.length) throw new Error("Basket is empty.");
  const phoneIds = new Set<string>();
  const accQty = new Map<string, number>();
  for (const l of req.lines) {
    if (!Number.isSafeInteger(l.quantity) || l.quantity <= 0)
      throw new Error("Quantity must be a positive whole number.");
    const p = s.phones.find((x) => x.id === l.id);
    if (p) {
      if (phoneIds.has(p.id) || l.quantity !== 1)
        throw new Error(`Phone ${p.id} can only be sold once.`);
      phoneIds.add(p.id);
      continue;
    }
    if (!s.accessories.some((x) => x.id === l.id)) throw new Error(`Unknown item ${l.id}.`);
    accQty.set(l.id, (accQty.get(l.id) ?? 0) + l.quantity);
  }
  const lines: TestSaleLine[] = [];
  for (const id of phoneIds) {
    const p = s.phones.find((x) => x.id === id);
    if (!p) throw new Error(`Unknown item ${id}.`);
    if (p.store !== req.store) throw new Error("A basket must belong to one store.");
    if (p.status !== "Available") throw new Error(`Phone ${id} is no longer available.`);
    const price = p.amount;
    if (!price) throw new Error(`Selling price not configured for ${id}.`);
    lines.push({
      id,
      kind: "phone",
      name: p.name,
      quantity: 1,
      unitPrice: price,
      lineTotal: decimalValue(minorUnits(price)),
      imei: p.imei,
      ...(p.imei2 ? { imei2: p.imei2 } : {}),
      detail: p.detail,
      barcode: p.code ?? "",
      serial: p.draft?.serial ?? "",
      condition: p.condition,
      packaging: p.packaging,
    });
  }
  for (const [id, q] of accQty) {
    const a = s.accessories.find((x) => x.id === id);
    if (!a) throw new Error(`Unknown item ${id}.`);
    if (a.store !== req.store) throw new Error("A basket must belong to one store.");
    if (!a.amount) throw new Error(`Selling price not configured for ${id}.`);
    if (a.quantity < q) throw new Error(`Insufficient stock for ${id}.`);
    lines.push({
      id,
      kind: "accessory",
      name: a.name,
      quantity: q,
      unitPrice: a.amount,
      lineTotal: decimalValue(minorUnits(a.amount) * BigInt(q)),
      detail: a.detail,
      barcode: a.code ?? "",
    });
  }
  const total = lines.reduce((sum, l) => sum + minorUnits(l.lineTotal), 0n);
  return { lines, total: decimalValue(total) };
}
export function previewTestSale(req: Omit<SaleRequest, "key">, s: TestState = state): SalePreview {
  if (!["Cash", "Bank", "Split"].includes(req.tender)) throw new Error("Unsupported tender.");
  const priced = priceTestBasket(req.store, req.lines, s);
  if (
    !req.creditAmount &&
    req.tender === "Bank" &&
    minorUnits(req.paid) !== minorUnits(priced.total) - minorUnits(req.discountAmount ?? "0")
  )
    throw new Error("Bank payment must equal total.");
  if (
    !req.creditAmount &&
    req.tender === "Cash" &&
    minorUnits(req.paid) < minorUnits(priced.total) - minorUnits(req.discountAmount ?? "0")
  )
    throw new Error("Credit is unconfigured.");
  const payment = settleSale({
    credit: req.creditAmount,
    subtotal: priced.total,
    discount: req.discountAmount,
    limit: testSettings(s)["pos.discountLimitDzd"],
    owner: reviewActor(s)?.role === "SUPER_ADMIN",
    mode: req.tender,
    cash: req.cashAmount,
    bank: req.bankAmount,
    received: req.paid,
    bankMethod: req.bankMethod ?? (req.tender === "Bank" ? "VIREMENT" : undefined),
  });
  return {
    lines: priced.lines,
    total: decimalValue(payment.total),
    change: decimalValue(payment.change),
  };
}

export function recordTestSale(req: SaleRequest): TestSale {
  const buyer = req.buyer ? testBuyerSchema.parse(req.buyer) : undefined;
  if (!req.key) throw new Error("Missing sale key.");
  const dup = state.sales.find((x) => x.key === req.key);
  if (dup) throw new Error(`This sale was already recorded as ${dup.id}.`);
  const operator = validOperator(req.store, state.sellers[req.store]);
  const preview = previewTestSale(req);
  const newBuyer = req.newBuyer ? testBuyerSchema.parse(req.newBuyer) : undefined;
  const customers = projectSnapshot(req.store).customers;
  const staged = newBuyer
    ? {
        id: `LOCAL-C-${crypto.randomUUID()}`,
        name: `${newBuyer.surname} ${newBuyer.givenName}`,
        contact: newBuyer.contact,
        store: req.store,
        address: "",
        notes: "",
        reference: req.key,
        source: "Session draft" as const,
      }
    : undefined;
  const linked = staged ?? customers.find((c) => c.id === req.customerId);
  const hasPhone = preview.lines.some((l) => l.kind === "phone");
  if (hasPhone && (!linked || (req.customerId === WALK_IN && !staged)))
    throw new Error("Select a customer for a phone sale.");
  if (req.customerId !== WALK_IN && !linked) throw new Error("Select a customer in this store.");
  if (
    buyer &&
    linked &&
    `${buyer.surname} ${buyer.givenName}`.trim().toLocaleLowerCase() !==
      linked.name.trim().toLocaleLowerCase()
  )
    throw new Error("Select a customer in this store.");
  if (minorUnits(req.creditAmount ?? "0") > 0n) {
    assertReviewStore(req.store, "credit.checkout");
    if (
      !linked ||
      !(newBuyer ?? buyer)?.contact.trim() ||
      !req.dueDate ||
      !Number.isFinite(Date.parse(req.dueDate)) ||
      new Date(req.dueDate).toISOString().slice(0, 10) !== req.dueDate
    )
      throw new Error("CREDIT_CUSTOMER_REQUIRED");
  }
  const linkedBuyer = linked
    ? testBuyerSchema.parse(
        newBuyer ??
          buyer ?? {
            surname: linked.name.trim().split(/\s+/)[0],
            givenName: linked.name.trim().split(/\s+/).slice(1).join(" "),
            contact: linked.contact,
          },
      )
    : buyer;
  const choices = (
    req.warranties ??
    preview.lines
      .filter((l) => l.kind === "phone")
      .map((l) => ({ itemId: l.id, requested: false, duration: "", start: "", end: "" }))
  ).map((v) => warrantyChoiceSchema.parse(v));
  if (
    choices.length !== preview.lines.filter((l) => l.kind === "phone").length ||
    new Set(choices.map((c) => c.itemId)).size !== choices.length ||
    choices.some((c) => !preview.lines.some((l) => l.kind === "phone" && l.id === c.itemId))
  )
    throw new Error("Select warranty for each phone.");
  const shift = openShiftFor(req.store);
  if (!shift) throw new Error("Open a test cash shift on this drawer before a sale.");
  if (req.shiftId && shift.id !== req.shiftId)
    throw new Error("This cash session is closed or changed.");
  const at = new Date().toISOString();
  const terms = choices.map((c) =>
    c.requested && c.months !== undefined
      ? { ...c, duration: String(c.months), ...warrantyDates(at, c.months) }
      : c,
  );
  const id = nextId("TS");
  const sold = new Set(preview.lines.filter((l) => l.kind === "phone").map((l) => l.id));
  const dec = new Map(
    preview.lines.filter((l) => l.kind === "accessory").map((l) => [l.id, l.quantity]),
  );
  const phones = state.phones.map((p) => (sold.has(p.id) ? { ...p, status: "Sold" as const } : p));
  const accessories = state.accessories.map((a) => {
    const q = dec.get(a.id);
    if (!q) return a;
    const n = a.quantity - q;
    if (n < 0) throw new Error(`Insufficient stock for ${a.id}.`);
    return { ...a, quantity: n, status: statusFor(n) };
  });
  const movements = [
    ...preview.lines
      .filter((l) => l.kind === "accessory")
      .map((l, i) => ({
        id: `${id}-M${i + 1}`,
        at,
        sku: l.id,
        name: l.name,
        store: req.store,
        quantity: -l.quantity,
        reason: "SALE" as const,
        reference: id,
      })),
    ...state.movements,
  ];
  const seller = state.sellers[req.store];
  const year = invoiceYear(at);
  const last =
    state.sales
      .filter(
        (s) => s.store === req.store && s.invoiceNumber?.startsWith(`FA-${req.store}-${year}-`),
      )
      .reduce((n, s) => Math.max(n, Number(s.invoiceNumber?.split("-").at(-1) ?? 0)), 0) + 1;
  let publicRef = newPublicReference();
  while (state.sales.some((s) => s.publicRef === publicRef)) publicRef = newPublicReference();
  const sale: TestSale = {
    id,
    invoiceNumber: legalInvoiceNumber(req.store, year, last),
    publicRef,
    key: req.key,
    at,
    store: req.store,
    seller,
    operatorId: operator.id,
    customerId: linked?.id ?? WALK_IN,
    customer: linked?.name ?? req.customerName,
    tender: req.tender,
    total: preview.total,
    ...(req.creditAmount ? { creditAmount: req.creditAmount, dueDate: req.dueDate ?? "" } : {}),
    cashPart:
      req.tender === "Bank"
        ? "0.00"
        : req.tender === "Split"
          ? (req.cashAmount ?? "0.00")
          : decimalValue(minorUnits(preview.total) - minorUnits(req.creditAmount ?? "0")),
    bankPart:
      req.tender === "Cash"
        ? "0.00"
        : req.tender === "Split"
          ? (req.bankAmount ?? "0.00")
          : decimalValue(minorUnits(preview.total) - minorUnits(req.creditAmount ?? "0")),
    bankMethod: req.bankMethod,
    discountAmount: req.discountAmount ?? "0.00",
    discountActor: operator.id,
    discountLimit: testSettings()["pos.discountLimitDzd"],
    paid: req.paid,
    change: preview.change,
    shiftId: shift.id,
    ...(linkedBuyer ? { buyer: linkedBuyer } : {}),
    lines: preview.lines,
    warranties: terms.map((c) => ({
      ...c,
      ...(c.requested ? { provider: c.provider ?? "SHOP" } : {}),
      status: c.requested ? "DRAFT_PENDING" : "NONE",
    })),
    requestFingerprint: JSON.stringify(req),
  };
  const cash =
    minorUnits(sale.cashPart ?? "0") > 0n && shift
      ? [
          {
            id: `${id}-CASH`,
            shiftId: shift.id,
            store: req.store,
            at,
            kind: "SALE" as const,
            amount: sale.cashPart ?? preview.total,
            reference: id,
            seller,
            operatorId: operator.id,
          },
          ...state.cash,
        ]
      : state.cash;
  // Suppress intermediate persistence: the staged customer and sale share one IDB write.
  if (staged) {
    replacing = true;
    hydrateSession({ ...getSession(), customers: [staged, ...getSession().customers] });
    replacing = false;
  }
  set({ ...state, phones, accessories, movements, cash, sales: [sale, ...state.sales] });
  recordAudit({
    area: "pos",
    action: "Local test sale",
    subjectId: id,
    detail: `${preview.total} DZD · ${req.tender} · ${seller} · discount=${sale.discountAmount} · actor=${operator.id} · limit=${sale.discountLimit}`,
    store: req.store,
  });
  return sale;
}

/** Append-only owner correction: original intake/receipt remains unchanged. */
export function correctSupplierProvenance(
  kind: "phone" | "receipt",
  id: string,
  supplierId: string,
  reason: string,
) {
  const actor = reviewActor();
  if (actor?.role !== "SUPER_ADMIN") throw new Error("Owner access required.");
  const subject =
    kind === "phone"
      ? state.phones.find((p) => p.id === id)
      : state.movements.find((m) => m.id === id && m.reason === "RECEIVING");
  if (!subject) throw new Error("Unknown receipt.");
  assertReviewStore(subject.store);
  if (!reason.trim()) throw new Error("Required");
  const source = supplierForIntake(subject.store, supplierId);
  const prior = getSession().audit.find(
    (a) => a.subjectId === id && a.action === "Supplier provenance corrected",
  );
  let old = subject.supplierId ?? "";
  if (prior) {
    try {
      old = JSON.parse(prior.detail).new;
    } catch {
      throw new Error("Invalid provenance history.");
    }
  }
  recordAudit({
    area: "suppliers",
    action: "Supplier provenance corrected",
    subjectId: id,
    detail: JSON.stringify({
      kind,
      old,
      new: source.id ?? "",
      reason: reason.trim(),
      operatorId: actor.id,
    }),
    store: subject.store,
  });
}

/** Additive local void, preserving immutable sale/receipt snapshots. */
export function voidTestSale(saleId: string, key: string, reason: string) {
  const sale = state.sales.find((s) => s.id === saleId);
  if (
    state.creditPayments?.some(
      (p) => p.saleId === saleId && !state.creditReversals?.some((r) => r.paymentId === p.id),
    )
  )
    throw new Error("REJECTED");
  if (!sale) throw new Error("VALIDATION");
  const actor = assertReviewStore(sale.store, "sale.void");
  const prior = (state.saleVoids ?? []).find((v) => v.key === key);
  if (prior) {
    if (prior.saleId !== saleId || prior.actorId !== actor.id || prior.reason !== reason)
      throw new Error("IDEMPOTENCY_CONFLICT");
    return prior;
  }
  if ((state.saleVoids ?? []).some((v) => v.saleId === saleId)) throw new Error("SALE_VOIDED");
  if (!state.shifts.some((sh) => sh.id === sale.shiftId && sh.status === "OPEN"))
    throw new Error("USE_SAV");
  if (!reason.trim()) throw new Error("VALIDATION");
  const phoneIds = new Set(sale.lines.filter((l) => l.kind === "phone").map((l) => l.id));
  if (
    state.phones.some((p) => phoneIds.has(p.id) && (p.status !== "Sold" || p.store !== sale.store))
  )
    throw new Error("REJECTED");
  const quantities = new Map(
    sale.lines.filter((l) => l.kind === "accessory").map((l) => [l.id, l.quantity]),
  );
  const cashPart = sale.cashPart ?? (sale.tender === "Cash" ? sale.total : "0");
  const bankPart = sale.bankPart ?? (sale.tender === "Bank" ? sale.total : "0");
  const record = { saleId, key, actorId: actor.id, at: new Date().toISOString(), reason };
  set({
    ...state,
    saleVoids: [...(state.saleVoids ?? []), record],
    phones: state.phones.map((p) =>
      phoneIds.has(p.id) ? { ...p, status: "Available" as const } : p,
    ),
    accessories: state.accessories.map((a) => {
      const q = quantities.get(a.id);
      return q ? { ...a, quantity: a.quantity + q, status: statusFor(a.quantity + q) } : a;
    }),
    cash:
      minorUnits(cashPart) > 0n
        ? [
            ...state.cash,
            {
              id: `${saleId}-VOID`,
              shiftId: sale.shiftId ?? "",
              store: sale.store,
              at: record.at,
              kind: "CASH_OUT",
              amount: cashPart,
              reference: saleId,
              seller: actor.name,
              operatorId: actor.id,
              key,
            },
          ]
        : state.cash,
    bankReversals:
      minorUnits(bankPart) > 0n
        ? [...(state.bankReversals ?? []), { saleId, amount: bankPart, method: sale.bankMethod }]
        : (state.bankReversals ?? []),
  });
  recordAudit({
    area: "pos",
    action: "sale.void",
    subjectId: saleId,
    detail: reason,
    store: sale.store,
  });
  return record;
}

export function localCreditBalance(sale: TestSale, s: TestState = state): Money {
  if (s.saleVoids?.some((v) => v.saleId === sale.id)) return "0.00";
  return decimalValue(
    minorUnits(sale.creditAmount ?? "0") -
      (s.creditPayments ?? [])
        .filter(
          (p) =>
            p.saleId === sale.id && !(s.creditReversals ?? []).some((r) => r.paymentId === p.id),
        )
        .reduce((n, p) => n + minorUnits(p.amount), 0n),
  );
}
export function recordLocalRepayment(
  saleId: string,
  amount: Money,
  method: "Cash" | "Bank",
  bankMethod?: BankMethod,
) {
  const sale = state.sales.find((s) => s.id === saleId);
  if (!sale) throw new Error("VALIDATION");
  assertReviewStore(sale.store, "repayment.record");
  const actor = reviewActor();
  if (!actor) throw new Error("FORBIDDEN");
  const n = minorUnits(amount);
  if (n <= 0n || n > minorUnits(localCreditBalance(sale))) throw new Error("OVERPAYMENT");
  const shift = openShiftFor(sale.store);
  if (method === "Cash" && !shift) throw new Error("SHIFT_CLOSED");
  if (method === "Bank" && !bankMethod) throw new Error("VALIDATION");
  const id = nextId("CR"),
    at = new Date().toISOString();
  const row = { id, saleId, store: sale.store, amount, method, bankMethod, actorId: actor.id, at };
  set({
    ...state,
    creditPayments: [...(state.creditPayments ?? []), row],
    cash:
      method === "Cash" && shift
        ? [
            ...state.cash,
            {
              id,
              shiftId: shift.id,
              store: sale.store,
              at,
              kind: "CASH_IN",
              amount,
              reference: id,
              seller: actor.name,
              operatorId: actor.id,
            },
          ]
        : state.cash,
  });
  recordAudit({
    area: "debt",
    action: "repayment.record",
    subjectId: id,
    store: sale.store,
    detail: amount,
  });
  return row;
}
export function reverseLocalRepayment(paymentId: string, reason: string) {
  const row = state.creditPayments?.find((p) => p.id === paymentId),
    actor = reviewActor();
  if (!row || !actor || actor.role !== "SUPER_ADMIN") throw new Error("FORBIDDEN");
  if (!reason.trim() || state.creditReversals?.some((r) => r.paymentId === paymentId))
    throw new Error("REJECTED");
  const shift = openShiftFor(row.store);
  if (row.method === "Cash" && !shift) throw new Error("SHIFT_CLOSED");
  const at = new Date().toISOString();
  set({
    ...state,
    creditReversals: [
      ...(state.creditReversals ?? []),
      { paymentId, actorId: actor.id, at, reason },
    ],
    cash:
      row.method === "Cash" && shift
        ? [
            ...state.cash,
            {
              id: nextId("RR"),
              shiftId: shift.id,
              store: row.store,
              at,
              kind: "CASH_OUT",
              amount: row.amount,
              reference: paymentId,
              seller: actor.name,
              operatorId: actor.id,
            },
          ]
        : state.cash,
  });
  recordAudit({
    area: "debt",
    action: "repayment.reverse",
    subjectId: paymentId,
    store: row.store,
    detail: reason,
  });
}
export function recordLocalCashMovement(
  store: StoreId,
  direction: "CASH_IN" | "CASH_OUT",
  amount: Money,
  reason: string,
  note: string,
) {
  assertReviewStore(store, "cash.movement");
  if (
    !testSettings()["cash.movementReasons"].includes(reason) ||
    (reason === "Autre" && !note.trim())
  )
    throw new Error("VALIDATION");
  return addTestCashMovement(store, direction, amount, reason + " · " + note, {
    key: crypto.randomUUID(),
  });
}
