import { describe, it, expect, vi } from "vitest";
import { productionOperationalSchema } from "@/domain/production-reads";
import { inventoryReadSchema } from "@/domain/inventory-contracts";
import { prepareAuthenticatedGateway } from "@/backend/command-gateway.server";

const id = "00000000-0000-4000-8000-000000000001";
const business = {
  availability: { sales: "FORBIDDEN", repayments: "FORBIDDEN" },
  customers: [],
  sales: [],
  debts: [],
  repayments: [],
  suppliers: [],
  purchases: [],
  expenses: { status: "UNIMPLEMENTED_POLICY_BLOCKED", data: null },
  facilities: [],
  cases: [],
};
const inventory = { phones: [], accessories: [], receipts: [], shifts: [] };
describe("Review09 production read parity (local only)", () => {
  it("keeps inventory and business projections distinct", () => {
    expect(inventoryReadSchema.safeParse(business).success).toBe(false);
    expect(productionOperationalSchema.safeParse(inventory).success).toBe(false);
  });
  it("does not replace unavailable expenses with a demo empty list", () =>
    expect(productionOperationalSchema.safeParse({ ...business, expenses: [] }).success).toBe(
      false,
    ));
  it("rejects rows under a forbidden sales audience", () =>
    expect(
      productionOperationalSchema.safeParse({
        ...business,
        sales: [
          {
            id,
            customerId: null,
            store: "M01",
            item: "Posted sale",
            amount: "100.01",
            date: "2026-11-06",
          },
        ],
      }).success,
    ).toBe(false));
  it("rejects confidential fields on a production purchase", () =>
    expect(
      productionOperationalSchema.safeParse({
        ...business,
        purchases: [
          {
            id,
            supplierId: id,
            store: "M01",
            kind: "Phone",
            product: "Synthetic",
            quantity: "1",
            documentReference: "S",
            expectedDate: "2026-11-06",
            notes: "",
            source: "Database",
            unitCost: "80.01",
          },
        ],
      }).success,
    ).toBe(false));
  it("preserves explicit nonuniform facility installments without fabricated uniform summaries", () => {
    const facility = {
      id,
      customerId: id,
      store: "M01",
      employer: "Synthetic",
      contractReference: "S",
      contractPrice: "100.01",
      installments: [
        { month: "2026-11", amount: "50.00" },
        { month: "2026-12", amount: "50.01" },
      ],
      source: "Database",
    };
    expect(
      productionOperationalSchema.parse({ ...business, facilities: [facility] }).facilities[0]
        ?.installments[1]?.amount,
    ).toBe("50.01");
  });
  it("sanitizes a malformed database response instead of exposing validation data", async () => {
    const gateway = prepareAuthenticatedGateway({
      getVerifiedUser: async () => ({ id }),
      rpc: async () => ({ data: { privateCost: "80000.00" }, error: null }),
    });
    await expect(gateway.readOperational({ scope: "M01" })).rejects.toThrow(/^BACKEND_ERROR$/);
  });
  it("maps an absent owner finance row to null rather than a zero", async () => {
    const gateway = prepareAuthenticatedGateway({
      getVerifiedUser: async () => ({ id }),
      rpc: async () => ({ data: [], error: null }),
    });
    expect(await gateway.readOwnerFinance({ purchaseId: id })).toBeNull();
  });
  it("rejects owner finance for a different purchase identifier", async () => {
    const gateway = prepareAuthenticatedGateway({
      getVerifiedUser: async () => ({ id }),
      rpc: async () => ({
        data: [
          {
            purchase_id: "00000000-0000-4000-8000-000000000002",
            unit_cost: null,
            obligation: null,
            paid: "0.00",
          },
        ],
        error: null,
      }),
    });
    await expect(gateway.readOwnerFinance({ purchaseId: id })).rejects.toThrow("BACKEND_ERROR");
  });
  it("preserves nullable unknown costs and exact paid text", async () => {
    const gateway = prepareAuthenticatedGateway({
      getVerifiedUser: async () => ({ id }),
      rpc: async () => ({
        data: [{ purchase_id: id, unit_cost: null, obligation: null, paid: "0.01" }],
        error: null,
      }),
    });
    expect(await gateway.readOwnerFinance({ purchaseId: id })).toEqual({
      purchaseId: id,
      unitCost: null,
      obligation: null,
      paid: "0.01",
    });
  });
});
