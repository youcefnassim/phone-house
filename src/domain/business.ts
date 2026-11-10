import { canApproveTransfer } from "./permissions";
import { z } from "zod";
import { minorUnits, decimalValue, type Money, type StoreId, type Scope, type Role } from "./erp";
import { moneySchema } from "./operations";

export const required = z.string().trim().min(1, "Required");
export const optional = z.string().trim().default("");
export const storeSchema = z.enum(["M01", "M02"]);
export const positiveMoney = moneySchema.refine(
  (v) => /^\d+(\.\d{1,2})?$/.test(v) && minorUnits(v) > 0n,
  "Use a positive amount",
);
export const quantitySchema = z
  .string()
  .regex(/^\d+$/, "Whole quantity required")
  .refine((v) => Number.isSafeInteger(Number(v)) && Number(v) > 0, "Use a positive whole quantity");
export const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
  .refine((v) => {
    const d = new Date(v + "T00:00:00Z");
    return !Number.isNaN(d.valueOf()) && d.toISOString().slice(0, 10) === v;
  }, "Invalid date");
export const customerSchema = z.object({
  name: required,
  contact: required,
  store: storeSchema,
  address: optional,
  reference: required,
  notes: optional,
});
export type CustomerInput = z.infer<typeof customerSchema>;
export interface Customer extends CustomerInput {
  id: string;
  source: "Fixture" | "Session draft" | "Database";
}
export interface SaleReference {
  id: string;
  customerId: string;
  store: StoreId;
  item: string;
  imei?: string;
  amount: Money;
  date: string;
}
export const debtSchema = z.object({
  customerId: required,
  store: storeSchema,
  saleReference: required,
  amount: positiveMoney,
  dueDate: dateSchema,
  authorizationReference: required,
  notes: optional,
});
export type DebtInput = z.infer<typeof debtSchema>;
export interface Debt extends DebtInput {
  id: string;
  source: "Fixture" | "Session draft" | "Database";
}
export const repaymentSchema = z.object({
  amount: positiveMoney,
  date: dateSchema,
  method: z.enum(["Cash", "Bank"]),
  reference: required,
  authorizationReference: required,
});
export type RepaymentInput = z.infer<typeof repaymentSchema>;
export interface Repayment extends RepaymentInput {
  id: string;
  subjectId: string;
  source: "Fixture" | "Session draft" | "Database";
}
export const supplierSchema = z.object({
  name: required,
  contact: required,
  store: storeSchema,
  documentReference: optional,
  notes: optional,
});
export type SupplierInput = z.infer<typeof supplierSchema>;
export interface Supplier extends SupplierInput {
  id: string;
  source: "Fixture" | "Session draft" | "Database";
}
export const purchaseSchema = z.object({
  supplierId: required,
  store: storeSchema,
  kind: z.enum(["Phone", "Accessory"]),
  product: required,
  quantity: quantitySchema,
  documentReference: required,
  expectedDate: dateSchema,
  notes: optional,
});
export type PurchaseInput = z.infer<typeof purchaseSchema>;
// Operational purchasing records intentionally cannot contain costs, obligations or payment totals.
export interface Purchase extends PurchaseInput {
  id: string;
  source: "Fixture" | "Session draft" | "Database";
}
export const purchaseReceiptSchema = z.object({
  quantity: quantitySchema,
  imei1: optional,
  imei2: optional,
  serial: optional,
  barcode: required,
  documentReference: required,
  notes: optional,
});
export type PurchaseReceiptInput = z.infer<typeof purchaseReceiptSchema>;
export interface PurchaseReceipt extends PurchaseReceiptInput {
  id: string;
  purchaseId: string;
  source: "Session draft";
}
export interface OwnerPurchaseFinance {
  purchaseId: string;
  unitCost: Money;
  obligation: Money;
  payments: Repayment[];
}
export interface OwnerFinanceContract {
  readonly audience: "SUPER_ADMIN";
  listPurchases(): Promise<OwnerPurchaseFinance[]>;
}
export const ownerCostSchema = z.object({
  unitCost: positiveMoney,
  obligation: positiveMoney,
  documentReference: required,
});
export const expenseCategorySchema = z.object({ name: required, reference: required });
export const expenseSchema = z.object({
  category: required,
  description: required,
  store: storeSchema,
  amount: positiveMoney,
  method: z.enum(["Cash", "Bank"]),
  date: dateSchema,
  documentReference: required,
  notes: optional,
});
export type ExpenseInput = z.infer<typeof expenseSchema>;
export interface Expense extends ExpenseInput {
  id: string;
  state: "Policy required" | "Session draft";
}
export type TransferStage =
  "DRAFT" | "APPROVALS" | "DISPATCH" | "IN_TRANSIT" | "RECEIPT" | "COMPLETED";
export const transferStages: TransferStage[] = [
  "DRAFT",
  "APPROVALS",
  "DISPATCH",
  "IN_TRANSIT",
  "RECEIPT",
  "COMPLETED",
];
export interface TransferLine {
  id: string;
  name: string;
  kind: "phone" | "accessory";
  code: string;
  imei?: string;
  quantity: number;
}
export interface Transfer {
  carrier?: string;
  dispatchedBy?: string;
  sourceScanned?: Record<string, number>;
  discrepancyLines?: {
    id: string;
    quantity: number;
    outcome?: "RETURN" | "WRITE_OFF";
    reason?: string;
  }[];
  cancelled?: boolean;
  id: string;
  from: StoreId;
  to: StoreId;
  reference: string;
  lines: TransferLine[];
  stage: TransferStage;
  superAdmin: boolean;
  m02Manager: boolean;
  scanned: Record<string, number>;
  history: string[];
  discrepancies: string[];
  source: "Session draft";
  superAdminBy?: string;
  m02ManagerBy?: string;
}
export const transferSchema = z
  .object({ from: storeSchema, to: storeSchema, reference: required })
  .refine((v) => v.from !== v.to, { path: ["to"], message: "Choose a different destination" });
export function transferCanAdvance(t: Transfer): boolean {
  return (
    t.stage === "DRAFT" ||
    (t.stage === "APPROVALS" && t.superAdmin && t.m02Manager) ||
    t.stage === "DISPATCH" ||
    t.stage === "IN_TRANSIT" ||
    (t.stage === "RECEIPT" &&
      t.lines.every((l) => (t.scanned[l.id] ?? 0) === l.quantity) &&
      t.discrepancies.length === 0)
  );
}
export function advanceTransfer(t: Transfer): Transfer {
  if (!t.lines.length || !transferCanAdvance(t))
    throw new Error("Approvals or complete validated receipt required");
  const stage = transferStages[transferStages.indexOf(t.stage) + 1];
  if (!stage) throw new Error("Already complete");
  return { ...t, stage, history: [...t.history, `${stage} · Session draft · Not posted`] };
}
export function scanTransfer(t: Transfer, code: string): Transfer {
  if (t.stage !== "RECEIPT") throw new Error("Receipt stage required");
  const l = t.lines.find((l) => l.code === code.trim() || l.imei === code.trim());
  if (!l || (t.scanned[l.id] ?? 0) >= l.quantity)
    return {
      ...t,
      discrepancies: [...t.discrepancies, `Unexpected or excess scan: ${code.trim()}`],
    };
  return {
    ...t,
    scanned: { ...t.scanned, [l.id]: (t.scanned[l.id] ?? 0) + 1 },
    history: [...t.history, `Scanned ${l.id} · Draft evidence`],
  };
}
export const facilitySchema = z
  .object({
    customerId: required,
    employer: required,
    store: z.literal("M01"),
    contractReference: required,
    contractPrice: positiveMoney,
    months: quantitySchema,
    firstMonth: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Use YYYY-MM"),
    installmentAmount: positiveMoney,
    notes: optional,
  })
  .refine((v) => Number(v.months) <= 1200, {
    path: ["months"],
    message: "Schedule too large to display",
  });
export type FacilityInput = z.infer<typeof facilitySchema>;
export interface Facility extends FacilityInput {
  id: string;
  source: "Fixture" | "Session draft" | "Database";
  installments?: { month: string; amount: Money }[];
}
export interface FacilityEvent {
  id: string;
  facilityId: string;
  month: string;
  amount: Money;
  reference: string;
  kind: "Salary deduction" | "Bank remittance";
  source: "Session draft";
  evidence?: string;
}
export const facilityEventSchema = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Use YYYY-MM"),
  amount: positiveMoney,
  reference: required,
});
export function facilitySchedule(
  f: FacilityInput & { installments?: { month: string; amount: Money }[] },
): { month: string; amount: Money }[] {
  if (f.installments) return f.installments.map((i) => ({ ...i }));
  const [year, month] = f.firstMonth.split("-").map(Number);
  if (year === undefined || month === undefined) throw new Error("Explicit first month required");
  return Array.from({ length: Number(f.months) }, (_, i) => {
    const date = new Date(Date.UTC(year, month - 1 + i, 1));
    return { month: date.toISOString().slice(0, 7), amount: f.installmentAmount };
  });
}
export const serviceSchema = z.object({
  customerId: required,
  store: storeSchema,
  saleReference: required,
  imei: required,
  issue: required,
  requestedAction: z.enum(["Inspection", "Repair", "Return", "Exchange", "Refund review"]),
  documentReference: required,
  notes: optional,
});
export type ServiceInput = z.infer<typeof serviceSchema>;
export interface ServiceCase extends ServiceInput {
  id: string;
  stage: "Inspection" | "In service" | "Ready" | "Closed draft";
  history: string[];
  source: "Fixture" | "Session draft" | "Database";
}
export const serviceEventSchema = z.object({
  stage: z.enum(["Inspection", "In service", "Ready", "Closed draft"]),
  note: required,
  documentReference: required,
});
export const refundSchema = z.object({
  amount: positiveMoney,
  reference: required,
  authorizationReference: required,
  reason: required,
});
export interface Refund {
  id: string;
  caseId: string;
  amount: Money;
  reference: string;
  authorizationReference: string;
  reason: string;
  source: "Session draft";
}
export interface Attachment {
  id: string;
  subjectId: string;
  name: string;
  size: number;
  type: string;
}
export interface BusinessSnapshot {
  customers: Customer[];
  sales: SaleReference[];
  debts: Debt[];
  repayments: Repayment[];
  suppliers: Supplier[];
  purchases: Purchase[];
  expenses: Expense[];
  facilities: Facility[];
  cases: ServiceCase[];
}
export type DemoReadState = "Live demo" | "Loading" | "Empty" | "Error" | "Forbidden";
export interface BusinessReadContract {
  readonly mode: "demo";
  read(scope: Scope, role: Role, state?: DemoReadState): Promise<BusinessSnapshot>;
}
export const inScope = (store: StoreId, scope: Scope) => scope === "ALL" || scope === store;
export const canPreviewOwnerFinance = (role: Role) => role === "SUPER_ADMIN";
export const canPreviewTransferApproval = (
  approval: "SUPER_ADMIN" | "M02_MANAGER",
  role: Role,
  scope: Scope,
) => canApproveTransfer(approval, role, role === "SUPER_ADMIN" ? "GLOBAL" : scope);
export const sumMoney = (values: Money[]): Money =>
  decimalValue(values.reduce((sum, v) => sum + minorUnits(v), 0n));
export function outstanding(amount: Money, paid: Money[]): Money {
  const balance = minorUnits(amount) - minorUnits(sumMoney(paid));
  if (balance < 0n) throw new Error("Amount exceeds outstanding balance");
  return decimalValue(balance);
}
export function validateRepayment(amount: Money, balance: Money): string | undefined {
  return minorUnits(amount) > minorUnits(balance)
    ? "Amount exceeds outstanding balance."
    : undefined;
}
export function validatePurchaseReceipt(
  p: Purchase,
  r: PurchaseReceiptInput,
  prior: PurchaseReceipt[],
  identities: string[],
): string | undefined {
  const received = prior
    .filter((row) => row.purchaseId === p.id)
    .reduce((n, r) => n + Number(r.quantity), 0);
  if (Number(r.quantity) + received > Number(p.quantity))
    return "Receipt exceeds ordered quantity.";
  if (p.kind === "Phone") {
    if (r.quantity !== "1" || !/^\d{15}$/.test(r.imei1))
      return "Receive one serialized phone with a 15-digit IMEI1.";
    if (r.imei2 && (!/^\d{15}$/.test(r.imei2) || r.imei1 === r.imei2))
      return "IMEI2 must be 15 digits and differ from IMEI1.";
    if ([r.imei1, r.imei2, r.serial].filter(Boolean).some((v) => identities.includes(v)))
      return "Duplicate phone identity.";
  }
  return undefined;
}
export const businessPolicy = {
  postings: false,
  facilityStore: "M01",
  facilityTender: "Bank",
  expenseApproval: "UNCONFIGURED",
  creditEligibility: "UNCONFIGURED",
  warrantyPeriod: null,
  refundEligibility: "UNCONFIGURED",
  requiredTransferApprovals: ["SUPER_ADMIN", "M02_MANAGER"],
  partialTransferReceipt: false,
} as const;
