import { permits, readOperation, canApproveTransfer } from "@/domain/permissions";
import { nativeEnvelope, nativeOperationStatus, nativePayloads } from "@/domain/native-commands";
import { TransportError, type ProtectedNativeTransport } from "./native-repository";
// SYNTHETIC test transport: clearly labeled fake server responses for UI tests
// and local browser checks. It is NOT hosted auth/D1 evidence and is never the
// default transport. Role rules mirror the server only to exercise UI states.
export type SyntheticRole = "SUPER_ADMIN" | "MANAGER" | "SELLER";
const S = "SYN";
const rows: Record<string, Record<string, string | number | null>[]> = {
  inventory: [
    {
      id: `${S}-PH-1`,
      store_id: "M01",
      catalog_id: `${S}-MODEL-1`,
      barcode: `${S}-BC-1`,
      state: "AVAILABLE",
      attributes_json: '{"color":"Black"}',
    },
    {
      id: `${S}-PH-2`,
      store_id: "M01",
      catalog_id: `${S}-MODEL-1`,
      barcode: `${S}-BC-2`,
      state: "IN_TRANSIT",
      attributes_json: "{}",
    },
  ],
  catalog: [
    {
      id: `${S}-ACC-1`,
      kind: "accessory",
      sku: `${S}-SKU-1`,
      name: "SYNTHETIC charger",
      attributes_json: "{}",
      amount_minor: 150050,
    },
  ],
  purchases: [
    {
      id: `${S}-PO-1`,
      store_id: "M01",
      supplier_id: `${S}-SUP-1`,
      item_id: `${S}-ACC-1`,
      quantity: 5,
      state: "DRAFT",
    },
  ],
  suppliers: [
    { id: `${S}-SUP-1`, store_id: "M01", name: "SYNTHETIC supplier", reference: `${S}-REF-1` },
  ],
  customers: [
    { id: `${S}-CUS-1`, store_id: "M01", name: "SYNTHETIC customer", reference: `${S}-C-1` },
  ],
  sales: [
    {
      id: `${S}-SALE-1`,
      store_id: "M01",
      shift_id: `${S}-SHIFT-1`,
      seller_id: `${S}-SELLER`,
      customer_id: null,
      total_minor: 250000,
      tender: "Cash",
      change_minor: 0,
    },
  ],
  cash: [
    {
      id: `${S}-SHIFT-1`,
      store_id: "M01",
      drawer_id: `${S}-DRAWER-M01`,
      seller_id: `${S}-SELLER`,
      state: "OPEN",
      opening_minor: 500000,
      counted_minor: null,
    },
  ],
  transfers: [
    { id: `${S}-TR-1`, source_store: "M01", destination_store: "M02", stage: "APPROVALS" },
  ],
  debts: [
    {
      id: `${S}-DEBT-1`,
      customer_id: `${S}-CUS-1`,
      sale_id: `${S}-SALE-1`,
      amount_minor: 100000,
      state: "POLICY_BLOCKED",
    },
  ],
  facility: [
    {
      id: `${S}-FAC-1`,
      store_id: "M01",
      customer_id: `${S}-CUS-1`,
      employer: "SYNTHETIC employer",
      cash_price_minor: 9000000,
      contract_price_minor: 9900000,
      state: "POLICY_BLOCKED",
    },
  ],
  sav: [
    {
      id: `${S}-SAV-1`,
      sale_id: `${S}-SALE-1`,
      phone_id: `${S}-PH-1`,
      customer_id: `${S}-CUS-1`,
      state: "INSPECTION",
      issue: "SYNTHETIC screen issue",
    },
  ],
  expenses: [
    {
      id: `${S}-EXP-1`,
      store_id: "M01",
      amount_minor: 12000,
      evidence_key: "SYNTHETIC evidence",
      state: "POLICY_BLOCKED",
    },
  ],
  reports: [{ store_id: "M01", sale_count: 1, gross_minor: 250000 }],
  audit: [
    {
      id: `${S}-TX-1`,
      command_key: `${S}-KEY-0000000001`,
      actor_id: `${S}-OWNER`,
      store_id: "M01",
      operation: "customer.save",
    },
  ],
  users: [{ id: `${S}-SELLER`, active: 1, store_id: "M01", role: "SELLER" }],
  settings: [
    { id: "M01", label: "Magasin 1 (M01)" },
    { id: "M02", label: "Magasin 2 (M02)" },
  ],
};
export interface SyntheticOptions {
  role: SyntheticRole;
  store?: "M01" | "M02";
  loseNextResponse?: boolean;
  connected?: boolean;
}
export function createSyntheticTransport(options: SyntheticOptions) {
  const calls: { action: string; body: unknown }[] = [];
  const outcomes = new Map<string, unknown>();
  let lose = options.loseNextResponse ?? false;
  const membershipStore = options.role === "SUPER_ADMIN" ? "GLOBAL" : (options.store ?? "M01");
  const transport: ProtectedNativeTransport & {
    calls: typeof calls;
    setLoseNext(v: boolean): void;
  } = {
    calls,
    setLoseNext: (v) => {
      lose = v;
    },
    status: async () => ({
      connected: options.connected !== false,
      verified: true,
      synthetic: true,
      memberships: [{ store: membershipStore, role: options.role }],
    }),
    read: async (module, store, page) => {
      calls.push({ action: "read", body: { module, store, page } });
      if (options.connected === false) throw new TransportError("NOT_CONNECTED");
      if (!permits(options.role, membershipStore, store, readOperation(module)))
        throw new TransportError("FORBIDDEN");
      const all = (rows[module] ?? [])
        .filter((r) => !("store_id" in r) || r["store_id"] === store || module === "settings")
        .filter(
          (r) =>
            !page?.search || JSON.stringify(r).toLowerCase().includes(page.search.toLowerCase()),
        );
      const limit = page?.limit ?? 50,
        offset = page?.offset ?? 0;
      return {
        module,
        source: "SERVER",
        rows: all.slice(offset, offset + limit),
        page: { limit, offset, hasMore: all.length > offset + limit },
      };
    },
    execute: async (raw) => {
      calls.push({ action: "execute", body: raw });
      const e = nativeEnvelope.parse(raw);
      const payload = nativePayloads[e.operation].parse(e.payload);
      if (e.operation === "transfer.approve") {
        if (
          !canApproveTransfer(
            (payload as { approval: "SUPER_ADMIN" | "M02_MANAGER" }).approval,
            options.role,
            membershipStore,
          )
        )
          throw new TransportError("FORBIDDEN");
      } else if (!permits(options.role, membershipStore, payload.store, e.operation))
        throw new TransportError("FORBIDDEN");
      const result = {
        key: e.key,
        transactionId: `${S}-TX-${e.key.slice(-6)}`,
        status: nativeOperationStatus[e.operation],
      };
      outcomes.set(e.key, result);
      if (lose) {
        lose = false;
        throw new TransportError("OUTCOME_UNKNOWN", e.key);
      }
      return result;
    },
    outcome: async (key) => {
      calls.push({ action: "outcome", body: { key } });
      const r = outcomes.get(key);
      return r ? { found: true, result: r } : { found: false };
    },
    finance: async (store) => {
      calls.push({ action: "finance", body: { store } });
      if (!permits(options.role, membershipStore, store, "purchase.finance"))
        throw new TransportError("FORBIDDEN");
      return {
        source: "SERVER",
        confidential: true,
        rows: [{ purchase_id: `${S}-PO-1`, cost_minor: null, obligation_minor: null }],
      };
    },
  };
  return transport;
}
