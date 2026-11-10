import { assertReviewStore } from "./test-workspace";
import type { ErpRepository, DraftReceipt } from "@/domain/repository";
import type { CustomerInput, DebtInput, RepaymentInput, SupplierInput } from "@/domain/business";
import { customerSchema, debtSchema, repaymentSchema, supplierSchema } from "@/domain/business";
import { businessDemo } from "./business-demo";
import { addDraft, getSession, recordAudit } from "./session-store";

// Demo implementation of the unified repository contract. Validates with the
// same domain schemas a production implementation must enforce, stores drafts
// in the shared synthetic session, and never posts anything.

let receiptSequence = 0;
const receipt = (auditId: string): DraftReceipt => ({
  id: `DRAFT-${++receiptSequence}`,
  auditId,
  posted: false,
  label: "SYNTHETIC SESSION DRAFT",
});

export const demoRepository: ErpRepository = {
  mode: "demo",
  read: (scope, role, state) => businessDemo.read(scope, role, state),
  listCustomers: async (scope) => (await businessDemo.read(scope, "SELLER")).customers,
  async saveCustomerDraft(input: CustomerInput) {
    const value = customerSchema.parse(input);
    assertReviewStore(value.store, "customer.save");
    const draft = {
      ...value,
      id: `DRAFT-C-${getSession().customers.length + 1}`,
      source: "Session draft" as const,
    };
    addDraft("customers", draft, {
      area: "customers",
      action: "Customer draft saved",
      detail: `${value.name} · ${value.store}`,
      store: value.store,
    });
    return receipt(getSession().audit[0]?.id ?? "SEV-0000");
  },
  listDebts: async (scope) => (await businessDemo.read(scope, "SELLER")).debts,
  async saveDebtDraft(input: DebtInput) {
    const value = debtSchema.parse(input);
    assertReviewStore(value.store, "debt.draft");
    addDraft(
      "debts",
      {
        ...value,
        id: `DRAFT-D-${getSession().debts.length + 1}`,
        source: "Session draft" as const,
      },
      {
        area: "debts",
        action: "Debt draft saved",
        detail: `${value.customerId} · ${value.amount} DZD`,
        store: value.store,
      },
    );
    return receipt(getSession().audit[0]?.id ?? "SEV-0000");
  },
  async saveRepaymentDraft(debtId: string, input: RepaymentInput) {
    const value = repaymentSchema.parse(input);
    const debt = getSession().debts.find((d) => d.id === debtId);
    if (debt) assertReviewStore(debt.store, "repayment.draft");
    addDraft(
      "repayments",
      {
        ...value,
        id: `DRAFT-PAY-${getSession().repayments.length + 1}`,
        subjectId: debtId,
        source: "Session draft" as const,
      },
      {
        area: "debts",
        action: "Repayment draft saved",
        detail: `${debtId} · ${value.amount} DZD`,
        store: debt?.store ?? "ALL",
      },
    );
    return receipt(getSession().audit[0]?.id ?? "SEV-0000");
  },
  listSuppliers: async (scope) => (await businessDemo.read(scope, "SELLER")).suppliers,
  async saveSupplierDraft(input: SupplierInput) {
    const value = supplierSchema.parse(input);
    assertReviewStore(value.store, "supplier.save");
    addDraft(
      "suppliers",
      {
        ...value,
        id: `DRAFT-SUP-${getSession().suppliers.length + 1}`,
        source: "Session draft" as const,
      },
      {
        area: "suppliers",
        action: "Supplier draft saved",
        detail: `${value.name} · ${value.store}`,
        store: value.store,
      },
    );
    return receipt(getSession().audit[0]?.id ?? "SEV-0000");
  },
};

export { recordAudit };
