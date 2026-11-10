import type { OwnerFinanceContract } from "@/domain/business";
// Separate owner-only synthetic projection. Never import this from an operational adapter.
export const ownerFinanceDemo: OwnerFinanceContract = {
  audience: "SUPER_ADMIN",
  listPurchases: async () => [
    { purchaseId: "PO-001", unitCost: "80000.00", obligation: "160000.00", payments: [] },
    { purchaseId: "PO-002", unitCost: "700.00", obligation: "7000.00", payments: [] },
  ],
};
