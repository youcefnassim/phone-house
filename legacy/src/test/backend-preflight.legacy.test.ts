import { describe, it, expect, vi } from "vitest";
import {
  SupabaseRepository,
  type AuthenticatedRepositoryTransport,
} from "../data/supabase-repository";
import { prepareAuthenticatedGateway } from "@/backend/command-gateway.server";
import { commandEnvelope, operationalSnapshotSchema } from "@/domain/backend";
import { contractVersion } from "@/domain/contracts";

const snapshot = {
  customers: [],
  sales: [],
  debts: [],
  repayments: [],
  suppliers: [],
  purchases: [],
  expenses: { status: "UNIMPLEMENTED_POLICY_BLOCKED", data: null },
  facilities: [],
  cases: [],
  availability: { sales: "AVAILABLE", repayments: "AVAILABLE" },
};
const transport = (): AuthenticatedRepositoryTransport => ({
  readOperational: vi.fn(async () => snapshot),
  readInventory: vi.fn(),
  execute: vi.fn(),
  readOwnerFinance: vi.fn(),
});
describe("inactive production repository security structure (not database tests)", () => {
  it("never forwards the untrusted Super Admin preview to a production read", async () => {
    const port = transport();
    await new SupabaseRepository(port).read("M02", "SUPER_ADMIN");
    expect(port.readOperational).toHaveBeenCalledWith({ scope: "M02" });
  });
  it("refuses synthetic draft calls rather than posting customer data", async () => {
    const port = transport();
    await expect(new SupabaseRepository(port).saveCustomerDraft()).rejects.toThrow(
      "disabled in production",
    );
    expect(port.execute).not.toHaveBeenCalled();
  });
  it("rejects synthetic error-state controls in production", async () => {
    const port = transport();
    await expect(new SupabaseRepository(port).read("M01", "SELLER", "Empty")).rejects.toThrow(
      "unavailable in production",
    );
    expect(port.readOperational).not.toHaveBeenCalled();
  });
});
