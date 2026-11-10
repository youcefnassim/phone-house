import { it, expect } from "vitest";
import { nativeRouteModules } from "@/domain/native-repository";
import { createNativeRepository, disconnectedNativeTransport } from "@/data/native-repository";
import { nativeCheckoutEnvelope } from "@/domain/native-checkout";
for (const route of Object.keys(nativeRouteModules) as (keyof typeof nativeRouteModules)[]) {
  it(`${route} blocks disconnected backend without reading fixture data`, async () => {
    expect(await createNativeRepository(disconnectedNativeTransport).read(route, "M01")).toEqual({
      state: "NOT_CONNECTED",
    });
  });
  it(`${route} maps only matching authenticated server projection`, async () => {
    let read = 0;
    const transport = {
      status: async () => ({ connected: true, verified: true }),
      read: async () => {
        read++;
        return { source: "SERVER", module: nativeRouteModules[route], rows: [] };
      },
      execute: async () => null,
    };
    expect((await createNativeRepository(transport).read(route, "M01")).state).toBe("READY");
    expect(read).toBe(1);
    expect(
      (
        await createNativeRepository({
          ...transport,
          status: async () => ({ connected: true, verified: false }),
        }).read(route, "M01")
      ).state,
    ).toBe("UNAUTHORIZED");
    expect(read).toBe(1);
  });
}
it("rejects confidential financial columns from operational projection", async () => {
  const repo = createNativeRepository({
    status: async () => ({ connected: true, verified: true }),
    read: async () => ({ module: "purchases", source: "SERVER", rows: [{ cost_minor: 100 }] }),
    execute: async () => null,
  });
  expect(await repo.read("/purchases", "M01")).toEqual({ state: "ERROR" });
});

it("rejects wrong-store rows and pagination mismatches before page rendering", async () => {
  const transport = {
    status: async () => ({ connected: true, verified: true }),
    execute: async () => null,
    read: async () => ({
      module: "sales",
      source: "SERVER",
      rows: [{ id: "sale", store_id: "M02" }],
    }),
  };
  expect((await createNativeRepository(transport).read("/sales", "M01")).state).toBe("ERROR");
  expect(
    (
      await createNativeRepository({
        ...transport,
        read: async () => ({
          module: "sales",
          source: "SERVER",
          rows: [],
          page: { limit: 25, offset: 50, hasMore: false },
        }),
      }).read("/sales", "M01", { limit: 25, offset: 0 })
    ).state,
  ).toBe("ERROR");
});

it("receiving outcome mismatch never resolves as local success and retains original key", async () => {
  const repository = createNativeRepository({
    status: async () => ({ connected: true, verified: true }),
    read: async () => null,
    execute: async () => null,
    receive: async () => ({ key: "wrong-key", transactionId: "r", status: "RECORDED" }),
  });
  await expect(
    repository.receive({
      key: "receiving-original-0001",
      store: "M01",
      itemId: "accessory",
      quantity: 1,
    }),
  ).rejects.toMatchObject({ code: "OUTCOME_UNKNOWN", key: "receiving-original-0001" });
});
const checkout = {
  contractVersion: "native-pos-2026-11-07",
  idempotencyKey: "adapter-checkout-00001",
  clientRequestId: "44444444-4444-4444-8444-444444444444",
  payload: {
    store: "M01",
    shiftId: "33333333-3333-4333-8333-333333333333",
    lines: [{ itemId: "22222222-2222-4222-8222-222222222222", kind: "accessory", quantity: "1" }],
    warranties: [],
    tender: "Cash",
    tenderedAmount: "1.00",
  },
};
it("hosted checkout rejects disconnected or unverified transport without local fallback", async () => {
  let calls = 0;
  const transport = {
    ...disconnectedNativeTransport,
    checkout: async () => {
      calls++;
      return null;
    },
  };
  await expect(createNativeRepository(transport).checkout(checkout)).rejects.toThrow(
    "NOT_CONNECTED",
  );
  await expect(
    createNativeRepository({
      ...transport,
      status: async () => ({ connected: true, verified: false }),
    }).checkout(checkout),
  ).rejects.toThrow("UNAUTHORIZED");
  expect(calls).toBe(0);
  expect(nativeCheckoutEnvelope.parse(checkout).payload.buyer).toBeUndefined();
});
it("lost or wrong-key checkout response retains original unknown-outcome key", async () => {
  const transport = {
    ...disconnectedNativeTransport,
    status: async () => ({ connected: true, verified: true }),
    checkout: async () => ({
      response_json: JSON.stringify({ key: "different-key", saleId: "s" }),
    }),
  };
  await expect(createNativeRepository(transport).checkout(checkout)).rejects.toMatchObject({
    code: "OUTCOME_UNKNOWN",
    key: "adapter-checkout-00001",
  });
  await expect(
    createNativeRepository({
      ...transport,
      checkout: async () => {
        throw new Error("Lost response");
      },
    }).checkout(checkout),
  ).rejects.toMatchObject({ code: "OUTCOME_UNKNOWN", key: "adapter-checkout-00001" });
});
