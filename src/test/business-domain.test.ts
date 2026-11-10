import { describe, it, expect } from "vitest";
import {
  customerSchema,
  debtSchema,
  repaymentSchema,
  purchaseSchema,
  purchaseReceiptSchema,
  validatePurchaseReceipt,
  expenseSchema,
  facilitySchema,
  facilitySchedule,
  serviceSchema,
  refundSchema,
  outstanding,
  validateRepayment,
  advanceTransfer,
  scanTransfer,
  transferCanAdvance,
  businessPolicy,
  canPreviewOwnerFinance,
  canPreviewTransferApproval,
  type Transfer,
} from "@/domain/business";
import { businessDemo } from "@/data/business-demo";
const transfer: Transfer = {
  id: "TR",
  from: "M01",
  to: "M02",
  reference: "DOC",
  lines: [
    { id: "PH", name: "Phone", kind: "phone", imei: "000000000000099", code: "PH99", quantity: 1 },
    { id: "AC", name: "Cable", kind: "accessory", code: "AC99", quantity: 2 },
  ],
  stage: "APPROVALS",
  superAdmin: false,
  m02Manager: false,
  scanned: {},
  history: [],
  discrepancies: [],
  source: "Session draft",
};
describe("Review 04 domain rules — frontend only", () => {
  it("restricts owner finance preview to Super Admin", () => {
    expect(canPreviewOwnerFinance("SELLER")).toBe(false);
    expect(canPreviewOwnerFinance("MANAGER")).toBe(false);
    expect(canPreviewOwnerFinance("SUPER_ADMIN")).toBe(true);
  });
  it("requires M02 Manager scope for the second transfer approval", () => {
    expect(canPreviewTransferApproval("M02_MANAGER", "MANAGER", "M01")).toBe(false);
    expect(canPreviewTransferApproval("M02_MANAGER", "SELLER", "M02")).toBe(false);
    expect(canPreviewTransferApproval("M02_MANAGER", "MANAGER", "M02")).toBe(true);
  });
  it("requires customer contact and preserves approved store identifiers", () => {
    expect(
      customerSchema.safeParse({ name: "A", contact: "", store: "M01", reference: "C" }).success,
    ).toBe(false);
    expect(
      customerSchema.safeParse({ name: "A", contact: "Demo", store: "M03", reference: "C" })
        .success,
    ).toBe(false);
  });
  it("requires explicit debt authorization and a valid due date without credit defaults", () => {
    const d = {
      customerId: "C",
      store: "M01",
      saleReference: "S",
      amount: "100.01",
      dueDate: "2026-02-30",
      authorizationReference: "A",
    };
    expect(debtSchema.safeParse(d).success).toBe(false);
    expect(
      debtSchema.safeParse({ ...d, dueDate: "2026-11-30", authorizationReference: "" }).success,
    ).toBe(false);
    expect(businessPolicy.creditEligibility).toBe("UNCONFIGURED");
  });
  it("computes partial repayments exactly and rejects repayment above outstanding", () => {
    expect(outstanding("30000.00", ["2000.00", "100.01"])).toBe("27899.99");
    expect(validateRepayment("27899.99", "27899.98")).toBeDefined();
    expect(
      repaymentSchema.safeParse({
        amount: "0",
        date: "2026-11-06",
        method: "Bank",
        reference: "R",
        authorizationReference: "A",
      }).success,
    ).toBe(false);
  });
  it.each(["SELLER", "MANAGER"] as const)(
    "omits purchase financial fields from %s operational contracts",
    async (role) => {
      const data = await businessDemo.read("ALL", role);
      expect(data.purchases).toHaveLength(2);
      for (const p of data.purchases) {
        expect(Object.keys(p).sort()).toEqual(
          [
            "documentReference",
            "expectedDate",
            "id",
            "kind",
            "notes",
            "product",
            "quantity",
            "source",
            "store",
            "supplierId",
          ].sort(),
        );
      }
    },
  );
  it("requires serialized one-unit phone receipt and rejects duplicate identities", () => {
    const p = purchaseSchema.parse({
      supplierId: "SUP",
      store: "M01",
      kind: "Phone",
      product: "P",
      quantity: "2",
      documentReference: "D",
      expectedDate: "2026-11-10",
    });
    const order = { ...p, id: "PO", source: "Fixture" as const };
    const r = purchaseReceiptSchema.parse({
      quantity: "1",
      imei1: "000000000000099",
      barcode: "PH99",
      documentReference: "R",
    });
    expect(validatePurchaseReceipt(order, { ...r, quantity: "2" }, [], [])).toBeDefined();
    expect(validatePurchaseReceipt(order, r, [], [r.imei1])).toBeDefined();
    expect(validatePurchaseReceipt(order, r, [], [])).toBeUndefined();
  });
  it("rejects accessory receiving above ordered quantity", () => {
    const p = {
      ...purchaseSchema.parse({
        supplierId: "SUP",
        store: "M02",
        kind: "Accessory",
        product: "P",
        quantity: "7",
        documentReference: "D",
        expectedDate: "2026-11-10",
      }),
      id: "PO",
      source: "Fixture" as const,
    };
    const r = purchaseReceiptSchema.parse({ quantity: "8", barcode: "AC", documentReference: "R" });
    expect(validatePurchaseReceipt(p, r, [], [])).toBeDefined();
  });
  it("leaves expense approvals unconfigured and rejects malformed expense amounts", () => {
    expect(businessPolicy.expenseApproval).toBe("UNCONFIGURED");
    expect(
      expenseSchema.safeParse({
        category: "C",
        description: "D",
        store: "M01",
        amount: "1.001",
        method: "Cash",
        date: "2026-11-06",
        documentReference: "R",
      }).success,
    ).toBe(false);
  });
  it("requires both Super Admin and M02 Manager transfer approvals", () => {
    expect(() => advanceTransfer(transfer)).toThrow();
    expect(() => advanceTransfer({ ...transfer, superAdmin: true })).toThrow();
    expect(advanceTransfer({ ...transfer, superAdmin: true, m02Manager: true }).stage).toBe(
      "DISPATCH",
    );
    expect(businessPolicy.requiredTransferApprovals).toEqual(["SUPER_ADMIN", "M02_MANAGER"]);
  });
  it("blocks partial transfer receipt and validates every serialized and SKU unit", () => {
    let t = { ...transfer, stage: "RECEIPT" as const, superAdmin: true, m02Manager: true };
    t = scanTransfer(t, "PH99") as typeof t;
    expect(transferCanAdvance(t)).toBe(false);
    t = scanTransfer(t, "AC99") as typeof t;
    t = scanTransfer(t, "AC99") as typeof t;
    expect(advanceTransfer(t).stage).toBe("COMPLETED");
    expect(businessPolicy.partialTransferReceipt).toBe(false);
  });
  it("blocks unexpected and excess receipt scans with discrepancies", () => {
    const t = { ...transfer, stage: "RECEIPT" as const };
    expect(scanTransfer(t, "WRONG").discrepancies).toHaveLength(1);
    const scanned = scanTransfer(t, "PH99");
    expect(scanTransfer(scanned, "PH99").discrepancies).toHaveLength(1);
  });
  it("allows M01-only facilities with explicit contract-specific months and bank settlement", () => {
    const f = {
      customerId: "C",
      employer: "E",
      store: "M01",
      contractReference: "F",
      contractPrice: "300.03",
      months: "3",
      firstMonth: "2026-11",
      installmentAmount: "100.01",
    };
    expect(facilitySchema.safeParse({ ...f, store: "M02" }).success).toBe(false);
    expect(facilitySchedule(facilitySchema.parse(f))).toEqual([
      { month: "2026-11", amount: "100.01" },
      { month: "2026-12", amount: "100.01" },
      { month: "2027-01", amount: "100.01" },
    ]);
    expect(businessPolicy.facilityTender).toBe("Bank");
  });
  it("leaves warranty and refund eligibility unconfigured while validating refund draft amounts", () => {
    expect(businessPolicy.warrantyPeriod).toBeNull();
    expect(businessPolicy.refundEligibility).toBe("UNCONFIGURED");
    expect(
      refundSchema.safeParse({
        amount: "-1",
        reference: "R",
        authorizationReference: "A",
        reason: "D",
      }).success,
    ).toBe(false);
    expect(
      serviceSchema.safeParse({
        customerId: "C",
        store: "M01",
        saleReference: "",
        imei: "",
        issue: "I",
        requestedAction: "Return",
        documentReference: "D",
      }).success,
    ).toBe(false);
  });
  it("isolates store debts and leaves fixtures unchanged after reads", async () => {
    const m02 = await businessDemo.read("M02", "SELLER");
    expect(m02.debts).toHaveLength(0);
    const first = await businessDemo.read("M01", "SELLER");
    first.debts = [];
    expect((await businessDemo.read("M01", "SELLER")).debts).toHaveLength(1);
  });
  it("supports explicit empty and failure read states", async () => {
    expect((await businessDemo.read("ALL", "SELLER", "Empty")).purchases).toHaveLength(0);
    await expect(businessDemo.read("ALL", "SELLER", "Error")).rejects.toThrow("Demo read failure");
  });
});
