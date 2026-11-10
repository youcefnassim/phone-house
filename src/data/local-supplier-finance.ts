import { getTestState, reviewActor, openShiftFor, addTestCashMovement } from "./test-workspace";
import { receivingSuppliers } from "./supplier-provenance";
import { minorUnits, type StoreId } from "@/domain/erp";
// Owner-only local review projection: separate storage, never part of workspace exports.
type Cost = { sourceId: string; supplierId: string; amount: string };
type Payment = {
  id: string;
  supplierId: string;
  store: StoreId;
  amount: string;
  method: "Cash" | "Bank";
};
type Ledger = { costs: Cost[]; payments: Payment[] };
function owner() {
  if (reviewActor()?.role !== "SUPER_ADMIN") throw new Error("FORBIDDEN");
}
async function access(write?: (v: Ledger) => Ledger): Promise<Ledger> {
  owner();
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const r = indexedDB.open("phonehouse-private-owner-review", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("finance");
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  try {
    return await new Promise<Ledger>((resolve, reject) => {
      const tx = db.transaction("finance", write ? "readwrite" : "readonly"),
        s = tx.objectStore("finance"),
        r = s.get("suppliers");
      let value: Ledger = { costs: [], payments: [] };
      r.onsuccess = () => {
        try {
          owner();
          value = (r.result as Ledger | undefined) ?? value;
          if (write) {
            value = write(value);
            s.put(value, "suppliers");
          }
        } catch (e) {
          tx.abort();
          reject(e);
        }
      };
      tx.oncomplete = () => {
        try {
          owner();
          resolve(value);
        } catch (e) {
          reject(e);
        }
      };
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
export async function localSupplierPayables() {
  const l = await access();
  owner();
  return receivingSuppliers().map((s) => ({
    supplier_id: s.id,
    name: s.name,
    cost_minor: Number(
      l.costs.filter((c) => c.supplierId === s.id).reduce((n, c) => n + minorUnits(c.amount), 0n),
    ),
    paid_minor: Number(
      l.payments
        .filter((c) => c.supplierId === s.id)
        .reduce((n, c) => n + minorUnits(c.amount), 0n),
    ),
    balance_minor: Number(
      l.costs.filter((c) => c.supplierId === s.id).reduce((n, c) => n + minorUnits(c.amount), 0n) -
        l.payments
          .filter((c) => c.supplierId === s.id)
          .reduce((n, c) => n + minorUnits(c.amount), 0n),
    ),
  }));
}
export async function recordLocalSupplierCost(
  sourceId: string,
  supplierId: string,
  amount: string,
) {
  owner();
  if (minorUnits(amount) <= 0n || !receivingSuppliers().some((s) => s.id === supplierId))
    throw new Error("VALIDATION");
  const ws = getTestState();
  if (
    !ws.phones.some((p) => p.id === sourceId) &&
    !ws.movements.some((m) => m.id === sourceId && m.reason === "RECEIVING")
  )
    throw new Error("NOT_FOUND");
  await access((l) => {
    if (l.costs.some((c) => c.sourceId === sourceId)) throw new Error("REJECTED");
    return { ...l, costs: [...l.costs, { sourceId, supplierId, amount }] };
  });
}
export async function recordLocalSupplierPayment(
  supplierId: string,
  store: StoreId,
  amount: string,
  method: "Cash" | "Bank",
) {
  owner();
  if (minorUnits(amount) <= 0n || !receivingSuppliers().some((s) => s.id === supplierId))
    throw new Error("VALIDATION");
  if (method === "Cash" && !openShiftFor(store)) throw new Error("SHIFT_CLOSED");
  const id = crypto.randomUUID();
  // This is explicitly local review, not an atomic hosted financial command.
  if (method === "Cash")
    addTestCashMovement(store, "CASH_OUT", amount, "Paiement fournisseur", { key: id });
  await access((l) => ({
    ...l,
    payments: [...l.payments, { id, supplierId, store, amount, method }],
  }));
}

export async function localSupplierCosts() {
  return (await access()).costs;
}
