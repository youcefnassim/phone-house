import "fake-indexeddb/auto";
import { beforeAll, describe, it, expect, vi } from "vitest";
import {
  createProductionOutbox,
  type OutboxBinding,
  type VerifiedReplayPort,
} from "@/data/production-outbox";
import { transactionVersion } from "@/domain/transaction-contracts";
import { serialize, deserialize } from "node:v8";
beforeAll(() => {
  if (!globalThis.structuredClone)
    globalThis.structuredClone = (value) => deserialize(serialize(value));
});
const id = "00000000-0000-4000-8000-000000000001";
const binding: OutboxBinding = {
  projectRef: "abcdefghijklmnopqrst",
  userId: id,
  deviceId: id,
  store: "M01",
};
const request = {
  contractVersion: transactionVersion,
  idempotencyKey: "outbox-sale-key-0001",
  clientRequestId: id,
  payload: {
    store: "M01",
    shiftId: id,
    lines: [{ kind: "accessory" as const, itemId: id, quantity: "1" }],
    tender: "Cash" as const,
    tenderedAmount: "100.00",
  },
};
let sequence = 0;
const queue = () => createProductionOutbox(`isolated-outbox-test-${++sequence}`);
const success = {
  ok: true as const,
  transactionId: id,
  idempotencyKey: request.idempotencyKey,
  replayed: false,
  data: { saleId: id, total: "100.00", change: "0.00" },
};
const port = (): VerifiedReplayPort => ({
  authorize: vi.fn(async () => ({ authenticated: true, devicePolicyApproved: true })),
  execute: vi.fn(async () => success),
});
describe("durable production outbox — mocked server acceptance only", () => {
  it("persists an unconfirmed policy-blocked command across repository reopen", async () => {
    const name = `persist-${++sequence}`;
    const a = createProductionOutbox(name);
    await a.enqueue(binding, "pos.checkout", request);
    await a.close();
    const b = createProductionOutbox(name);
    expect((await b.list(binding))[0]?.state).toBe("POLICY_BLOCKED");
    await b.close();
  });
  it("deduplicates identical command submission", async () => {
    const q = queue();
    await q.enqueue(binding, "pos.checkout", request);
    await q.enqueue(binding, "pos.checkout", request);
    expect(await q.list(binding)).toHaveLength(1);
    await q.close();
  });
  it("rejects a changed payload under an existing key", async () => {
    const q = queue();
    await q.enqueue(binding, "pos.checkout", request);
    await expect(
      q.enqueue(binding, "pos.checkout", {
        ...request,
        payload: { ...request.payload, tenderedAmount: "101.00" },
      }),
    ).rejects.toThrow("IDEMPOTENCY_BINDING_CONFLICT");
    await q.close();
  });
  it("refuses cross-store enqueue", async () => {
    const q = queue();
    await expect(q.enqueue({ ...binding, store: "M02" }, "pos.checkout", request)).rejects.toThrow(
      "STORE_BINDING_CONFLICT",
    );
    expect(await q.list(binding)).toHaveLength(0);
    await q.close();
  });
  it("blocks replay without server-approved device policy", async () => {
    const q = queue();
    await q.enqueue(binding, "pos.checkout", request);
    const p = port();
    p.authorize = async () => ({ authenticated: true, devicePolicyApproved: false });
    expect((await q.replay(request.idempotencyKey, binding, p)).state).toBe("POLICY_BLOCKED");
    expect(p.execute).not.toHaveBeenCalled();
    await q.close();
  });
  it("blocks expired authentication without posting", async () => {
    const q = queue();
    await q.enqueue(binding, "pos.checkout", request);
    const p = port();
    p.authorize = async () => ({ authenticated: false, devicePolicyApproved: true });
    expect((await q.replay(request.idempotencyKey, binding, p)).state).toBe("AUTH_BLOCKED");
    expect(p.execute).not.toHaveBeenCalled();
    await q.close();
  });
  it("separates records by authenticated routing binding", async () => {
    const q = queue();
    await q.enqueue(binding, "pos.checkout", request);
    const other = { ...binding, userId: "00000000-0000-4000-8000-000000000002" };
    expect(await q.list(other)).toHaveLength(0);
    await expect(q.replay(request.idempotencyKey, other, port())).rejects.toThrow(
      "OUTBOX_BINDING_DENIED",
    );
    await q.close();
  });
  it("only confirms a schema-valid server response with matching key", async () => {
    const q = queue();
    await q.enqueue(binding, "pos.checkout", request);
    const result = await q.replay(request.idempotencyKey, binding, port());
    expect(result.state).toBe("CONFIRMED");
    expect(result.transactionId).toBe(id);
    await q.close();
  });
  it("retains the exact original key and payload after response loss", async () => {
    const q = queue();
    await q.enqueue(binding, "pos.checkout", request);
    const p = port();
    p.execute = vi.fn(async () => {
      throw new Error("response lost");
    });
    expect((await q.replay(request.idempotencyKey, binding, p)).state).toBe("OUTCOME_UNKNOWN");
    const retry = port();
    await q.replay(request.idempotencyKey, binding, retry);
    expect(retry.execute).toHaveBeenCalledWith("pos.checkout", request);
    await q.close();
  });
  it("does not confirm a response belonging to a different key", async () => {
    const q = queue();
    await q.enqueue(binding, "pos.checkout", request);
    const p = port();
    p.execute = async () => ({ ...success, idempotencyKey: "another-sale-key-0001" });
    expect((await q.replay(request.idempotencyKey, binding, p)).state).toBe("OUTCOME_UNKNOWN");
    await q.close();
  });
  it("keeps stock conflicts terminal rather than automatic reallocation", async () => {
    const q = queue();
    await q.enqueue(binding, "pos.checkout", request);
    const p = port();
    p.execute = vi.fn(
      async () =>
        ({ ok: false, kind: "CONFLICT", reason: "STOCK_UNAVAILABLE", retrySafe: false }) as const,
    );
    expect((await q.replay(request.idempotencyKey, binding, p)).state).toBe("CONFLICT");
    await q.replay(request.idempotencyKey, binding, p);
    expect(p.execute).toHaveBeenCalledTimes(1);
    await q.close();
  });
  it("serializes simultaneous tab claims using a lease", async () => {
    const q = queue();
    await q.enqueue(binding, "pos.checkout", request);
    let release: ((value: typeof success) => void) | undefined;
    const p = port();
    p.execute = vi.fn(
      () =>
        new Promise<typeof success>((resolve) => {
          release = resolve;
        }),
    );
    const first = q.replay(request.idempotencyKey, binding, p, 1000);
    await vi.waitFor(() => expect(p.execute).toHaveBeenCalledTimes(1));
    expect((await q.replay(request.idempotencyKey, binding, p, 1001)).state).toBe("SYNCING");
    release?.(success);
    expect((await first).state).toBe("CONFIRMED");
    expect(p.execute).toHaveBeenCalledTimes(1);
    await q.close();
  });
  it("recovers expired in-flight leases without claiming confirmation", async () => {
    const q = queue();
    await q.enqueue(binding, "pos.checkout", request);
    let release: ((value: typeof success) => void) | undefined;
    const p = port();
    p.execute = vi.fn(
      () =>
        new Promise<typeof success>((resolve) => {
          release = resolve;
        }),
    );
    const attempt = q.replay(request.idempotencyKey, binding, p, 1000);
    await vi.waitFor(() => expect(p.execute).toHaveBeenCalledTimes(1));
    await q.recover(62000);
    expect((await q.list(binding))[0]?.state).toBe("OUTCOME_UNKNOWN");
    release?.(success);
    expect((await attempt).state).toBe("OUTCOME_UNKNOWN");
    await q.close();
  });
});
