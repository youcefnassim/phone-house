import { projectSnapshot } from "./business-demo";
import { addDraft, getSession } from "./session-store";
import { assertReviewStore, reviewActor, getTestState } from "./test-workspace";
import { normalizedBuyer } from "@/domain/sales-review";
import type { StoreId } from "@/domain/erp";
export function receivingSuppliers() {
  const rows = projectSnapshot("ALL").suppliers;
  return rows.map((s) => ({ id: s.id, name: s.name }));
}
export function supplierForIntake(store: StoreId, id = "", newName = "") {
  assertReviewStore(store);
  const rows = receivingSuppliers();
  if (id) {
    const row = rows.find((s) => s.id === id);
    if (!row) throw new Error("Unknown supplier.");
    return { id: row.id };
  }
  const name = newName.trim().replace(/\s+/g, " ");
  if (!name) return { id: undefined };
  const duplicate = rows.find((s) => normalizedBuyer(s.name) === normalizedBuyer(name));
  if (duplicate) throw new Error("Select the existing supplier.");
  const row = {
    id: `LOCAL-S-${crypto.randomUUID()}`,
    name,
    contact: "",
    store,
    documentReference: "",
    notes: "",
    source: "Session draft" as const,
  };
  return { id: row.id, row };
}
export function commitIntakeSupplier(source: ReturnType<typeof supplierForIntake>) {
  if (source.row)
    addDraft("suppliers", source.row, {
      area: "suppliers",
      action: "Supplier draft saved",
      detail: source.row.name,
      store: source.row.store,
    });
}
export function ownerSupplierName(id?: string) {
  if (reviewActor()?.role !== "SUPER_ADMIN") throw new Error("Owner access required.");
  return receivingSuppliers().find((s) => s.id === id)?.name;
}
export function ownerReceiptHistory(sku: string) {
  if (reviewActor()?.role !== "SUPER_ADMIN") throw new Error("Owner access required.");
  return getTestState().movements.filter((m) => m.sku === sku && m.reason === "RECEIVING");
}
export function provenanceCorrections(subjectId: string) {
  return getSession().audit.filter(
    (a) => a.subjectId === subjectId && a.action === "Supplier provenance corrected",
  );
}
