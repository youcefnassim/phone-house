import { describe, it, expect, vi } from "vitest";
import { parseDedicatedBackend } from "@/domain/backend-environment";
import { prepareAuthenticatedGateway } from "@/backend/command-gateway.server";
import {
  transactionVersion,
  databaseMoney,
  transactionPayloads,
} from "@/domain/transaction-contracts";

const ref = "abcdefghijklmnopqrst";
const config = {
  url: `https://${ref}.supabase.co`,
  publishableKey: "sb_publishable_synthetic",
  projectRef: ref,
  environment: "dedicated-development",
  ownerConfirmed: true,
};
const id = "00000000-0000-4000-8000-000000000001";
const request = {
  contractVersion: transactionVersion,
  idempotencyKey: "external-sale-key-0001",
  clientRequestId: id,
  payload: {
    store: "M01",
    shiftId: id,
    lines: [{ kind: "accessory", itemId: id, quantity: "1" }],
    tender: "Cash",
    tenderedAmount: "100.00",
  },
};
describe("external backend boundary — local tests, no hosted acceptance", () => {
  it("accepts the exact maximum NUMERIC(14,2) value", () =>
    expect(databaseMoney.parse("999999999999.99")).toBe("999999999999.99"));
  it("rejects one minor unit above NUMERIC(14,2)", () =>
    expect(databaseMoney.safeParse("1000000000000.00").success).toBe(false));
  it("applies the database bound to checkout tender", () =>
    expect(
      transactionPayloads["pos.checkout"].safeParse({
        ...request.payload,
        tenderedAmount: "1000000000000.00",
      }).success,
    ).toBe(false));
  it("does not accept a successful response bound to another sale key", async () => {
    const gateway = prepareAuthenticatedGateway({
      getVerifiedUser: async () => ({ id }),
      rpc: async () => ({
        data: {
          ok: true,
          transactionId: id,
          idempotencyKey: "different-sale-key-0001",
          replayed: false,
          data: { saleId: id, total: "100.00", change: "0.00" },
        },
        error: null,
      }),
    });
    expect(await gateway.execute({ operation: "pos.checkout", request })).toEqual({
      ok: false,
      kind: "BACKEND_ERROR",
      reason: "RESPONSE_CONTRACT_INVALID_OUTCOME_UNKNOWN_RETAIN_IDEMPOTENCY_KEY",
      retrySafe: false,
    });
  });
  it("binds configuration to the dedicated project hostname", () =>
    expect(() =>
      parseDedicatedBackend({ ...config, url: "https://differentprojectname.supabase.co" }),
    ).toThrow());
  it("rejects service-role keys", () =>
    expect(() =>
      parseDedicatedBackend({ ...config, publishableKey: "sb_secret_private" }),
    ).toThrow());
  it("rejects missing owner confirmation", () =>
    expect(() => parseDedicatedBackend({ ...config, ownerConfirmed: false })).toThrow());
  it("rejects production environment under development authorization", () =>
    expect(() => parseDedicatedBackend({ ...config, environment: "production" })).toThrow());
  it("accepts exact configured dedicated development identity", () =>
    expect(parseDedicatedBackend(config).projectRef).toBe(ref));
});
