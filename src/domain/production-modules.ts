import { settingKeys } from "./intake";
import type { NativeOperation } from "./native-commands";
import type { NativeRoute } from "./native-repository";
// Typed production module mapping for all 18 routes: server columns to show,
// authenticated commands offered, and form field specs. Visibility here is UX
// only; the server/SQL boundary is the authority for roles, stores and costs.
export type FieldKind =
  | "id"
  | "newId"
  | "text"
  | "money"
  | "optionalMoney"
  | "int"
  | "imei"
  | "sha"
  | "json"
  | { options: readonly string[] };
export interface FieldSpec {
  name: string;
  kind: FieldKind;
  example?: string;
}
const sel = (...options: string[]) => ({ options }) as const;
export const operationFields: Record<NativeOperation, FieldSpec[]> = {
  "sav.exchange": [
    { name: "caseId", kind: "id" },
    { name: "note", kind: "text" },
    { name: "checkout", kind: "json" },
  ],
  "sav.track": [
    { name: "caseId", kind: "id" },
    {
      name: "status",
      kind: sel("IN_HOUSE", "EXTERNAL", "IN_REPAIR", "READY", "SENT_DISTRIBUTOR", "RETURNED"),
    },
    { name: "note", kind: "text" },
  ],
  "sav.outcome": [
    { name: "caseId", kind: "id" },
    { name: "outcome", kind: sel("REPAIR_RETURN", "REFUND", "REFUSAL") },
    { name: "note", kind: "text" },
  ],
  "sav.restock": [
    { name: "phoneId", kind: "id" },
    { name: "note", kind: "text" },
  ],
  "used.purchase": [
    { name: "id", kind: "newId" },
    { name: "catalogId", kind: "id" },
    { name: "surname", kind: "text" },
    { name: "givenName", kind: "text" },
    { name: "phone", kind: "text" },
    { name: "imei", kind: "imei" },
    { name: "serial", kind: "text" },
    { name: "barcode", kind: "text" },
    { name: "shiftId", kind: "id" },
    { name: "amount", kind: "money" },
  ],
  "supplier.cost": [
    { name: "sourceId", kind: "id" },
    { name: "phoneId", kind: "id" },
    { name: "supplierId", kind: "id" },
    { name: "amount", kind: "money" },
  ],
  "supplier.payment": [
    { name: "supplierId", kind: "id" },
    { name: "amount", kind: "money" },
    { name: "method", kind: sel("Cash", "Bank") },
    { name: "shiftId", kind: "id" },
    { name: "bankMethod", kind: sel("VIREMENT", "CCP_BARIDIMOB") },
  ],
  "count.open": [
    { name: "id", kind: "newId" },
    { name: "month", kind: "text" },
  ],
  "count.entry": [
    { name: "countId", kind: "id" },
    { name: "itemId", kind: "id" },
    { name: "kind", kind: sel("phone", "accessory") },
    { name: "quantity", kind: "int" },
  ],
  "count.submit": [{ name: "countId", kind: "id" }],
  "stock.adjust": [
    { name: "itemId", kind: "id" },
    { name: "delta", kind: "int" },
    { name: "reason", kind: "text" },
    { name: "countId", kind: "id" },
  ],
  "stock.review": [
    { name: "adjustmentId", kind: "id" },
    { name: "outcome", kind: sel("OK", "FLAGGED") },
    { name: "note", kind: "text" },
  ],
  "transfer.resolve": [
    { name: "transferId", kind: "id" },
    { name: "itemId", kind: "id" },
    { name: "outcome", kind: sel("RETURN", "WRITE_OFF") },
    { name: "reason", kind: "text" },
  ],
  "transfer.cancel": [
    { name: "transferId", kind: "id" },
    { name: "reason", kind: "text" },
  ],
  "cash.movement": [
    { name: "shiftId", kind: "id" },
    { name: "direction", kind: sel("IN", "OUT") },
    { name: "amount", kind: "money" },
    { name: "reason", kind: "text" },
    { name: "note", kind: "text" },
  ],
  "repayment.record": [
    { name: "debtId", kind: "id" },
    { name: "amount", kind: "money" },
    { name: "method", kind: sel("Cash", "Bank") },
    { name: "shiftId", kind: "id" },
    { name: "bankMethod", kind: sel("VIREMENT", "CCP_BARIDIMOB") },
  ],
  "repayment.reverse": [
    { name: "repaymentId", kind: "id" },
    { name: "reason", kind: "text" },
    { name: "shiftId", kind: "id" },
  ],
  "sale.void": [
    { name: "saleId", kind: "id" },
    { name: "reason", kind: "text" },
  ],
  "cash.review": [
    { name: "shiftId", kind: "id" },
    { name: "outcome", kind: sel("NO_ISSUE", "FLAGGED") },
    { name: "note", kind: "text" },
  ],
  "session.revoke": [{ name: "sessionId", kind: "id" }],
  "customer.save": [
    { name: "id", kind: "newId" },
    { name: "name", kind: "text" },
    { name: "reference", kind: "id" },
  ],
  "supplier.save": [
    { name: "phone", kind: "text" },
    { name: "id", kind: "newId" },
    { name: "name", kind: "text" },
    { name: "reference", kind: "id" },
  ],
  "catalog.save": [
    { name: "id", kind: "newId" },
    { name: "kind", kind: sel("phone", "accessory") },
    { name: "sku", kind: "id" },
    { name: "name", kind: "text" },
    { name: "attributes", kind: "json", example: '{"color":"Black"}' },
  ],
  "price.set": [
    { name: "itemId", kind: "id" },
    { name: "amount", kind: "money" },
  ],
  "settings.save": [
    { name: "key", kind: sel(...settingKeys) },
    { name: "value", kind: "json", example: '""' },
  ],
  "purchase.save": [
    { name: "id", kind: "newId" },
    { name: "supplierId", kind: "id" },
    { name: "itemId", kind: "id" },
    { name: "quantity", kind: "int" },
    { name: "evidence", kind: "text" },
  ],
  "purchase.finance": [
    { name: "purchaseId", kind: "id" },
    { name: "cost", kind: "optionalMoney" },
    { name: "obligation", kind: "optionalMoney" },
  ],
  "stock.receive": [
    { name: "purchaseId", kind: "id" },
    { name: "evidence", kind: "text" },
    { name: "quantity", kind: "int" },
    {
      name: "phones",
      kind: "json",
      example: '[{"id":"P-1","imei1":"356000000000001","barcode":"BC-1","attributes":{}}]',
    },
  ],
  "cash.open": [
    { name: "id", kind: "newId" },
    { name: "drawerId", kind: "id" },
    { name: "opening", kind: "money" },
  ],
  "cash.close": [
    { name: "shiftId", kind: "id" },
    { name: "counted", kind: "money" },
  ],
  "cash.evidence": [
    { name: "shiftId", kind: "id" },
    { name: "direction", kind: sel("IN", "OUT") },
    { name: "amount", kind: "money" },
    { name: "reference", kind: "text" },
  ],
  "debt.draft": [
    { name: "id", kind: "newId" },
    { name: "customerId", kind: "id" },
    { name: "saleId", kind: "id" },
    { name: "amount", kind: "money" },
  ],
  "repayment.draft": [
    { name: "debtId", kind: "id" },
    { name: "amount", kind: "money" },
    { name: "reference", kind: "id" },
  ],
  "transfer.create": [
    { name: "id", kind: "newId" },
    { name: "destination", kind: sel("M01", "M02") },
    {
      name: "lines",
      kind: "json",
      example: '[{"itemId":"P-1","kind":"phone","quantity":1,"code":"BC-1"}]',
    },
  ],
  "transfer.approve": [
    { name: "transferId", kind: "id" },
    { name: "approval", kind: sel("SUPER_ADMIN", "M02_MANAGER") },
  ],
  "transfer.scan": [
    { name: "transferId", kind: "id" },
    { name: "itemId", kind: "id" },
    { name: "code", kind: "id" },
    { name: "quantity", kind: "int" },
  ],
  "transfer.dispatch": [
    { name: "carrier", kind: "text" },
    { name: "transferId", kind: "id" },
    { name: "evidence", kind: "text" },
  ],
  "transfer.receive": [
    { name: "transferId", kind: "id" },
    { name: "evidence", kind: "text" },
  ],
  "facility.draft": [
    { name: "id", kind: "newId" },
    { name: "customerId", kind: "id" },
    { name: "employer", kind: "text" },
    { name: "cashPrice", kind: "money" },
    {
      name: "schedule",
      kind: "json",
      example: '{"contractPrice":"100.00","installments":[{"month":"2027-01","amount":"100.00"}]}',
    },
  ],
  "facility.evidence": [
    { name: "facilityId", kind: "id" },
    { name: "kind", kind: sel("SALARY_DEDUCTION", "BANK_REMITTANCE") },
    { name: "amount", kind: "money" },
    { name: "document", kind: "text" },
  ],
  "sav.open": [
    { name: "id", kind: "newId" },
    { name: "saleId", kind: "id" },
    { name: "phoneId", kind: "id" },
    { name: "customerId", kind: "id" },
    { name: "imei", kind: "imei" },
    { name: "issue", kind: "text" },
  ],
  "sav.event": [
    { name: "caseId", kind: "id" },
    { name: "note", kind: "text" },
    { name: "evidence", kind: "text" },
  ],
  "sav.refund.review": [
    { name: "caseId", kind: "id" },
    { name: "amount", kind: "money" },
    { name: "evidence", kind: "text" },
  ],
  "expense.draft": [
    { name: "id", kind: "newId" },
    { name: "amount", kind: "money" },
    { name: "evidence", kind: "text" },
  ],
  "account.provision": [
    { name: "userId", kind: "id" },
    { name: "role", kind: sel("MANAGER", "SELLER") },
    { name: "targetStore", kind: sel("M01", "M02") },
  ],
  "account.revoke": [{ name: "userId", kind: "id" }],
  "role.replace": [
    { name: "userId", kind: "id" },
    { name: "role", kind: sel("MANAGER", "SELLER") },
    { name: "targetStore", kind: sel("M01", "M02") },
  ],
  "document.register": [
    { name: "id", kind: "newId" },
    { name: "mime", kind: sel("application/pdf", "image/jpeg", "image/png") },
    { name: "size", kind: "int" },
    { name: "sha256", kind: "sha" },
  ],
};
export interface ProductionModule {
  columns: string[];
  operations: NativeOperation[];
  ownerFinance?: boolean;
  checkoutNote?: boolean;
  statusPanel?: boolean;
}
export const productionModules: Record<NativeRoute, ProductionModule> = {
  "/waiting": { columns: [], operations: [] },
  "/": { columns: ["store_id", "sale_count", "gross_minor"], operations: [] },
  "/sales": {
    columns: ["id", "seller_id", "customer_id", "total_minor", "tender"],
    operations: [],
  },
  "/pos": {
    columns: [
      "id",
      "shift_id",
      "seller_id",
      "customer_id",
      "total_minor",
      "tender",
      "change_minor",
    ],
    operations: [],
    checkoutNote: true,
  },
  "/cash": {
    columns: ["id", "drawer_id", "seller_id", "state", "opening_minor", "counted_minor"],
    operations: ["cash.open", "cash.close", "cash.movement"],
  },
  "/stock/phones": {
    columns: ["id", "barcode", "catalog_id", "state", "attributes_json"],
    operations: ["stock.receive"],
  },
  "/stock/accessories": {
    columns: ["id", "sku", "name", "kind", "amount_minor"],
    operations: ["stock.receive", "price.set"],
  },
  "/catalog": {
    columns: ["id", "kind", "sku", "name", "attributes_json", "amount_minor"],
    operations: ["catalog.save", "price.set"],
  },
  "/transfers": {
    columns: ["id", "source_store", "destination_store", "stage"],
    operations: [
      "transfer.create",
      "transfer.approve",
      "transfer.scan",
      "transfer.dispatch",
      "transfer.receive",
      "transfer.resolve",
      "transfer.cancel",
    ],
  },
  "/customers": { columns: ["id", "name", "reference"], operations: ["customer.save"] },
  "/debts": {
    columns: ["id", "customer_id", "sale_id", "amount_minor", "state"],
    operations: ["repayment.record", "repayment.reverse"],
  },
  "/suppliers": {
    columns: ["id", "name", "phone"],
    operations: ["supplier.save", "supplier.cost", "supplier.payment"],
  },
  "/purchases": {
    columns: ["id", "supplier_id", "item_id", "quantity", "state"],
    operations: ["purchase.save", "purchase.finance"],
    ownerFinance: true,
  },
  "/expenses": {
    columns: ["id", "amount_minor", "evidence_key", "state"],
    operations: ["expense.draft", "document.register"],
  },
  "/facility": {
    columns: ["id", "customer_id", "employer", "cash_price_minor", "contract_price_minor", "state"],
    operations: ["facility.draft", "facility.evidence"],
  },
  "/sav": {
    columns: ["id", "public_ref", "phone_id", "customer_id", "state", "issue", "warranty_provider"],
    operations: ["sav.open", "sav.event", "sav.refund.review"],
  },
  "/reports": {
    columns: ["store_id", "sale_count", "gross_minor"],
    operations: [],
  },
  "/users": {
    columns: ["id", "active", "store_id", "role"],
    operations: ["account.provision", "role.replace", "account.revoke"],
  },
  "/audit": { columns: ["id", "command_key", "actor_id", "operation"], operations: [] },
  "/settings": { columns: ["id", "label"], operations: [], statusPanel: true },
};
/** Integer centimes -> exact decimal string; no floating point. */
export function formatMinor(value: number): string {
  if (!Number.isSafeInteger(value)) return "—";
  const neg = value < 0;
  const abs = Math.abs(value);
  return `${neg ? "-" : ""}${Math.trunc(abs / 100)}.${String(abs % 100).padStart(2, "0")} DZD`;
}
