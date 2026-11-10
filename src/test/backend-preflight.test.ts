import { describe, it, expect, vi } from "vitest";
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
describe("inactive production repository security structure (not database tests)", () => {
  it("rejects owner unit costs appended to operational purchasing data", () => {
    const purchase = {
      id: "p1",
      source: "Database",
      supplierId: "s1",
      store: "M01",
      kind: "Phone",
      product: "Phone",
      quantity: "1",
      documentReference: "R1",
      expectedDate: "2026-11-06",
      notes: "",
      unitCost: "80000.00",
    };
    expect(
      operationalSnapshotSchema.safeParse({ ...snapshot, purchases: [purchase] }).success,
    ).toBe(false);
  });
  it("rejects actor privileges in the authenticated request envelope", () => {
    expect(
      commandEnvelope.safeParse({
        contractVersion,
        idempotencyKey: "review06-key-0001",
        clientRequestId: "ae523afb-45e6-4c28-a214-c00a7d18f530",
        actor: { role: "SUPER_ADMIN" },
        payload: {},
      }).success,
    ).toBe(false);
  });
  it("does not call a database RPC for an unauthenticated owner read", async () => {
    const rpc = vi.fn();
    const gateway = prepareAuthenticatedGateway({ getVerifiedUser: async () => null, rpc });
    await expect(
      gateway.readOwnerFinance({ purchaseId: "ae523afb-45e6-4c28-a214-c00a7d18f530" }),
    ).rejects.toThrow("AUTHORIZATION");
    expect(rpc).not.toHaveBeenCalled();
  });
  it("does not expose raw database permission errors", async () => {
    const gateway = prepareAuthenticatedGateway({
      getVerifiedUser: async () => ({ id: "u1" }),
      rpc: async () => ({ data: null, error: { code: "42501" } }),
    });
    await expect(gateway.readOperational({ scope: "M01" })).rejects.toThrow("AUTHORIZATION");
  });
});
