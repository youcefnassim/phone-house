import type { Scope, Role } from "./erp";
import type {
  BusinessSnapshot,
  DemoReadState,
  Customer,
  CustomerInput,
  Debt,
  DebtInput,
  Repayment,
  RepaymentInput,
  Supplier,
  SupplierInput,
} from "./business";

// Unified data-access boundary. Every module reads through this contract so a
// future production implementation (authenticated server functions backed by
// PostgreSQL) can replace the demo implementation without rewriting components.
//
// Rules:
// - Reads are scope/role aware and return structured clones; callers never
//   mutate shared fixtures.
// - Draft methods validate input, return a DraftReceipt, and NEVER post
//   financial, stock or authorization effects. `posted` is always false here.
// - Confidential owner purchase costs are NOT part of this contract; they live
//   behind the separate OwnerFinanceContract (SUPER_ADMIN audience only).

export interface DraftReceipt {
  id: string;
  auditId: string;
  posted: false;
  label: "SYNTHETIC SESSION DRAFT";
}

export interface ErpRepository {
  readonly mode: "demo" | "production";
  read(scope: Scope, role: Role, state?: DemoReadState): Promise<BusinessSnapshot>;
  listCustomers(scope: Scope): Promise<Customer[]>;
  saveCustomerDraft(input: CustomerInput, editId?: string): Promise<DraftReceipt>;
  listDebts(scope: Scope): Promise<Debt[]>;
  saveDebtDraft(input: DebtInput): Promise<DraftReceipt>;
  saveRepaymentDraft(debtId: string, input: RepaymentInput): Promise<DraftReceipt>;
  listSuppliers(scope: Scope): Promise<Supplier[]>;
  saveSupplierDraft(input: SupplierInput): Promise<DraftReceipt>;
}
