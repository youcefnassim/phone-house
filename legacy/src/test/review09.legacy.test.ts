import { describe, it, expect, vi } from "vitest";
import { productionOperationalSchema } from "@/domain/production-reads";
import { inventoryReadSchema } from "@/domain/inventory-contracts";
import { prepareAuthenticatedGateway } from "@/backend/command-gateway.server";
import { SupabaseRepository } from "../data/supabase-repository";

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
  it("wires repository inventory directly to the authenticated transport", async () => {
    const readInventory = vi.fn(async () => inventory);
    const repository = new SupabaseRepository({
      readInventory,
      readOperational: async () => business,
      readOwnerFinance: vi.fn(),
      execute: vi.fn(),
    });
    expect(await repository.readInventory("M02")).toEqual(inventory);
    expect(readInventory).toHaveBeenCalledWith({ scope: "M02" });
  });
});
