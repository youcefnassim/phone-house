import { describe, it, expect, vi } from "vitest";
import { parseDedicatedBackend } from "@/domain/backend-environment";
import { createUserTransport } from "../backend/user-transport.server";
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
  it("uses the same user bearer for verification and RPC", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id })))
      .mockResolvedValueOnce(new Response("{}"));
    const port = createUserTransport(
      { ...config, ownerAuthorized: true },
      "synthetic-private-test-token",
      fetcher,
    );
    expect(await port.getVerifiedUser()).toEqual({ id });
    await port.rpc("read_inventory_snapshot", { requested_scope: "M01" });
    expect(fetcher.mock.calls.map(([, init]) => init?.headers)).toEqual([
      expect.objectContaining({ Authorization: "Bearer synthetic-private-test-token" }),
      expect.objectContaining({ Authorization: "Bearer synthetic-private-test-token" }),
    ]);
  });
  it("does not escape with a raw JSON decoding error", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response("gateway unavailable"));
    const port = createUserTransport(
      { ...config, ownerAuthorized: true },
      "synthetic-private-test-token",
      fetcher,
    );
    await expect(port.rpc("command_pos_checkout", { request })).rejects.toThrow(/^BACKEND_ERROR$/);
  });
  it("marks a lost checkout response as unknown outcome, not safe new-key retry", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id })))
      .mockRejectedValueOnce(new Error("response lost"));
    const gateway = prepareAuthenticatedGateway(
      createUserTransport(
        { ...config, ownerAuthorized: true },
        "synthetic-private-test-token",
        fetcher,
      ),
    );
    expect(await gateway.execute({ operation: "pos.checkout", request })).toEqual({
      ok: false,
      kind: "BACKEND_ERROR",
      reason: "TRANSPORT_OUTCOME_UNKNOWN_RETAIN_IDEMPOTENCY_KEY",
      retrySafe: false,
    });
  });
});
