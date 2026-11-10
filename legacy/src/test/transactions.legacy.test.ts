import { describe, it, expect, vi } from "vitest";
import {
  transactionPayloads,
  transactionVersion,
  approvedFacilitySchedule,
  exactMoney,
} from "@/domain/transaction-contracts";
import { prepareAuthenticatedGateway, classifySqlError } from "@/backend/command-gateway.server";
import { createUserTransport } from "../backend/user-transport.server";
import { facilitySchedule } from "@/domain/business";
const id = "ae523afb-45e6-4c28-a214-c00a7d18f530";
const checkout = {
  store: "M01",
  shiftId: id,
  customerId: id,
  lines: [{ itemId: id, kind: "phone", quantity: "1" }],
  tender: "Cash",
  tenderedAmount: "0.01",
};
const request = {
  contractVersion: transactionVersion,
  idempotencyKey: "review07-key-0001",
  clientRequestId: id,
  payload: checkout,
};
describe("Review07 production rules (local, not PostgreSQL acceptance)", () => {
  it("verifies Auth user before calling RPC with the same bearer", async () => {
    const calls: string[] = [];
    const f = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      calls.push(String(url));
      expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer synthetic-test-token");
      return new Response(
        JSON.stringify(
          calls.length === 1
            ? { id }
            : {
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
              },
        ),
      );
    });
    const port = createUserTransport(
      {
        url: "https://isolated.example.invalid",
        publishableKey: "sb_publishable_test",
        ownerAuthorized: true,
      },
      "synthetic-test-token",
      f,
    );
    await prepareAuthenticatedGateway(port).readOperational({ scope: "M01" });
    expect(calls).toEqual([
      "https://isolated.example.invalid/auth/v1/user",
      "https://isolated.example.invalid/rest/v1/rpc/read_operational_snapshot",
    ]);
  });
});
