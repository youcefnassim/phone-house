import { z } from "zod";
import { usedPurchase } from "@/domain/batch4b";
import {
  getTestState,
  commitTest,
  assertReviewStore,
  reviewActor,
  openShiftFor,
} from "./test-workspace";
import type { StoreId } from "@/domain/erp";
// Private local identity/cost store is excluded from the shared workspace and exports.
export type LocalIndividual = {
  id: string;
  store: StoreId;
  surname: string;
  givenName: string;
  phone: string;
  photo: string;
  amount: string;
};
async function access(write?: LocalIndividual) {
  const actor = reviewActor();
  if (!actor || actor.role === "SELLER") throw new Error("FORBIDDEN");
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const r = indexedDB.open("phonehouse-private-individual-review", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("purchases", { keyPath: "id" });
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  try {
    return await new Promise<LocalIndividual[]>((resolve, reject) => {
      const tx = db.transaction("purchases", write ? "readwrite" : "readonly"),
        store = tx.objectStore("purchases");
      if (write) store.add(write);
      const r = store.getAll();
      tx.oncomplete = () => {
        if (reviewActor()?.id !== actor.id) {
          reject(new Error("FORBIDDEN"));
          return;
        }
        resolve(r.result as LocalIndividual[]);
      };
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
export async function localIndividualPurchases() {
  const rows = await access(),
    actor = reviewActor();
  return rows
    .filter((r) => actor?.role === "SUPER_ADMIN" || actor?.stores.includes(r.store))
    .map(({ amount, ...r }) => ({ ...r, ...(actor?.role === "SUPER_ADMIN" ? { amount } : {}) }));
}
export async function localIndividualCosts() {
  if (reviewActor()?.role !== "SUPER_ADMIN") throw new Error("FORBIDDEN");
  return await access();
}
export async function buyLocalIndividual(input: unknown, photo: string) {
  const v = usedPurchase.parse(input);
  z.string()
    .regex(/^data:image\/(png|jpeg|webp);base64,/)
    .max(14000000)
    .parse(photo);
  const actor = assertReviewStore(v.store, "used.purchase"),
    ws = getTestState(),
    shift = openShiftFor(v.store),
    model = ws.phoneModels?.find((m) => m.id === v.catalogId && m.condition === "USED");
  if (!shift || shift.id !== v.shiftId) throw new Error("SHIFT_CLOSED");
  if (
    !model ||
    ws.phones.some((p) => p.imei === v.imei || p.draft?.serial === v.serial || p.code === v.barcode)
  )
    throw new Error("REJECTED");
  await access({
    id: v.id,
    store: v.store,
    surname: v.surname,
    givenName: v.givenName,
    phone: v.phone,
    photo,
    amount: v.amount,
  });
  if (!openShiftFor(v.store) || reviewActor()?.id !== actor.id) throw new Error("OUTCOME_UNKNOWN");
  const at = new Date().toISOString();
  commitTest({
    ...getTestState(),
    phones: [
      ...getTestState().phones,
      {
        id: v.id,
        kind: "phone",
        store: v.store,
        name: model.model,
        detail: [model.brand, model.storage, v.serial].join(" · "),
        category: model.brand,
        condition: "USED",
        packaging: "UNKNOWN",
        imei: v.imei,
        code: v.barcode,
        status: "Available",
        ...(model.prices[v.store] ? { amount: model.prices[v.store] } : {}),
      },
    ],
    cash: [
      ...getTestState().cash,
      {
        id: v.id,
        shiftId: v.shiftId,
        store: v.store,
        at,
        kind: "CASH_OUT",
        amount: v.amount,
        reference: "USED_PURCHASE",
        seller: actor.name,
        operatorId: actor.id,
        key: v.id,
      },
    ],
  });
}
