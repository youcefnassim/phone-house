import {
  supplierSchema,
  purchaseSchema,
  purchaseReceiptSchema,
  validatePurchaseReceipt,
  expenseSchema,
  expenseCategorySchema,
  type SupplierInput,
  type PurchaseInput,
  type PurchaseReceiptInput,
  type ExpenseInput,
  type Supplier,
} from "@/domain/business";
import { getSession, addDraft, updateDraft } from "./session-store";
import { projectSnapshot } from "./business-demo";
import { nextTestId, phoneIdentities, assertReviewStore } from "./test-workspace";
export function saveTestSupplier(input: SupplierInput, id?: string) {
  const v = supplierSchema.parse(input);
  assertReviewStore(v.store, "supplier.save");
  const old = id ? projectSnapshot("ALL").suppliers.find((s) => s.id === id) : undefined;
  if (id && !old) throw new Error("Supplier reference unavailable.");
  const row: Supplier = { ...v, id: id ?? nextTestId("TSUP"), source: "Session draft" };
  const audit = {
    area: "suppliers",
    action: "Supplier draft saved",
    detail: v.name,
    store: v.store,
  };
  if (old && getSession().suppliers.some((s) => s.id === id))
    updateDraft("suppliers", row.id, row, audit);
  else addDraft("suppliers", row, audit);
  return row;
}
export function saveTestPurchase(input: PurchaseInput) {
  const v = purchaseSchema.parse(input);
  assertReviewStore(v.store, "purchase.save");
  if (!projectSnapshot("ALL").suppliers.some((s) => s.id === v.supplierId && s.store === v.store))
    throw new Error("Supplier reference unavailable.");
  if (projectSnapshot("ALL").purchases.some((p) => p.documentReference === v.documentReference))
    throw new Error("This document reference was already used.");
  const row = { ...v, id: nextTestId("TPO"), source: "Session draft" as const };
  addDraft("purchases", row, {
    area: "purchases",
    action: "Purchase draft saved",
    detail: v.documentReference,
    store: v.store,
  });
  return row;
}
export function saveTestPurchaseReceipt(id: string, input: PurchaseReceiptInput) {
  const v = purchaseReceiptSchema.parse(input);
  const p = projectSnapshot("ALL").purchases.find((p) => p.id === id);
  if (!p) throw new Error("Not found");
  assertReviewStore(p.store, "stock.receive");
  const prior = getSession().purchaseReceipts;
  const error = validatePurchaseReceipt(p, v, prior, [
    ...phoneIdentities(),
    ...prior.flatMap((r) => [r.imei1, r.imei2, r.serial]).filter(Boolean),
  ]);
  if (error) throw new Error(error);
  if (prior.some((r) => r.documentReference === v.documentReference))
    throw new Error("This document reference was already used.");
  const row = { ...v, id: nextTestId("TPR"), purchaseId: id, source: "Session draft" as const };
  addDraft("purchaseReceipts", row, {
    area: "purchases",
    action: "Purchase receipt preview saved",
    detail: v.documentReference,
    store: p.store,
  });
  return row;
}
export function saveTestExpense(input: ExpenseInput) {
  const v = expenseSchema.parse(input);
  assertReviewStore(v.store, "expense.draft");
  if (projectSnapshot("ALL").expenses.some((e) => e.documentReference === v.documentReference))
    throw new Error("This document reference was already used.");
  const row = { ...v, id: nextTestId("TEX"), state: "Session draft" as const };
  addDraft("expenses", row, {
    area: "expenses",
    action: "Expense draft saved",
    detail: v.documentReference,
    store: v.store,
  });
  return row;
}
export function saveTestExpenseCategory(input: { name: string; reference: string }) {
  const v = expenseCategorySchema.parse(input);
  if (
    getSession().expenseCategories.some(
      (c) => c.name.toLowerCase() === v.name.toLowerCase() || c.reference === v.reference,
    )
  )
    throw new Error("This document reference was already used.");
  const row = { ...v, id: nextTestId("TEC") };
  addDraft("expenseCategories", row, {
    area: "expenses",
    action: "Expense category draft saved",
    detail: v.name,
    store: "ALL",
  });
  return row;
}
