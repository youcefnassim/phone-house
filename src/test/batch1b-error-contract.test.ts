import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { sqliteHarness } from "./sqlite-harness";
import { createNativeService } from "@/backend/sqlite/service";
import { createNativeApiHandler } from "@/backend/native-api";
import { createNativeRepository, TransportError } from "@/data/native-repository";
import { createDailyNativeController } from "@/data/daily-native-controller";
import { validatedPlan } from "@/backend/sqlite/write-diagnostics";
import type { AtomicSqlPort } from "@/backend/sqlite/port";
import type { NativeCheckoutRequest } from "@/domain/native-checkout";

let h: ReturnType<typeof sqliteHarness>;
const phone = "11111111-1111-4111-8111-111111111111";
const accessory = "22222222-2222-4222-8222-222222222222";
const shift = "33333333-3333-4333-8333-333333333333";
const origin = "https://erp.invalid";
beforeEach(() => {
  h = sqliteHarness();
  h.db.exec(`INSERT INTO accounts VALUES('seller',1),('manager',1),('owner',1);
    INSERT INTO memberships VALUES('seller','M01','SELLER'),('manager','M02','MANAGER'),('owner','GLOBAL','SUPER_ADMIN');
    INSERT INTO sessions SELECT id,id,2000,0 FROM accounts;
    INSERT INTO drawers VALUES('drawer','M01');
    INSERT INTO shifts VALUES('${shift}','M01','drawer','seller','OPEN',0,NULL);
    INSERT INTO catalog VALUES('model','phone','MODEL','Phone','{}'),('${accessory}','accessory','SKU','Cable','{}');
    INSERT INTO prices VALUES('M01','model',100),('M01','${accessory}',100);
    INSERT INTO accessory_balances VALUES('M01','${accessory}',2);
    INSERT INTO phones(id,store_id,catalog_id,barcode,state,attributes_json,serial) VALUES('${phone}','M01','model','BAR','AVAILABLE','{}','SERIAL');
    INSERT INTO phone_identifiers VALUES('490154203237518','${phone}',1);`);
});
afterEach(() => h.db.close());
const sale = (): NativeCheckoutRequest => ({
  contractVersion: "native-pos-2026-11-07",
  idempotencyKey: "error-checkout-key-0001",
  clientRequestId: "44444444-4444-4444-8444-444444444444",
  payload: {
    store: "M01",
    shiftId: shift,
    buyer: { surname: "New", givenName: "Buyer", contact: "" },
    lines: [{ itemId: phone, kind: "phone", quantity: "1" }],
    warranties: [{ itemId: phone, requested: false }],
    tender: "Cash",
    tenderedAmount: "1.00",
  },
});
const receiving = () => ({
  key: "error-receiving-key-001",
  store: "M01",
  itemId: "model",
  quantity: 1,
  phones: [{ id: "new-phone", barcode: "NEW-BAR", serial: "NEW-SERIAL" }],
});
const command = () => ({
  version: "native-2026-11-06",
  key: "error-command-key-0001",
  operation: "customer.save",
  payload: { store: "M01", id: "customer", name: "Buyer", reference: "REFERENCE" },
});
function api(port: AtomicSqlPort = h.port) {
  return createNativeApiHandler(
    createNativeService(
      port,
      {
        verify: async (credential) => {
          const user = credential.replace("test-token-", "");
          return { userId: user, sessionId: user, expiresAt: 2000 };
        },
      },
      { get: async () => null, put: async () => {} },
      () => 1000,
    ),
    { enabled: true, allowedOrigin: origin },
  );
}
const request = (route: string, body: unknown, user = "seller") =>
  new Request(`${origin}/api/native/${route}`, {
    method: "POST",
    headers: {
      Origin: origin,
      "Content-Type": "application/json",
      Authorization: `Bearer test-token-${user}`,
    },
    body: JSON.stringify(body),
  });
async function error(
  route: string,
  body: unknown,
  code: string,
  status: number,
  handler = api(),
  user = "seller",
) {
  const response = await handler(request(route, body, user));
  expect(response.status).toBe(status);
  expect(await response.json()).toMatchObject({ error: code });
}
it("wrong-store checkout preauthorizes FORBIDDEN 403 with no batch", async () => {
  const batch = vi.fn(h.port.batch);
  const input = sale();
  input.payload.store = "M02";
  await error("checkout", input, "FORBIDDEN", 403, api({ ...h.port, batch }));
  expect(batch).not.toHaveBeenCalled();
});
it.each(["revoked", "expired"])("%s session returns SESSION_REVOKED 401", async (kind) => {
  h.db.exec(
    kind === "revoked"
      ? "UPDATE sessions SET revoked=1 WHERE id='seller'"
      : "UPDATE sessions SET expires_at=500 WHERE id='seller'",
  );
  await error("checkout", sale(), "SESSION_REVOKED", 401);
});
it("closed checkout returns SHIFT_CLOSED 409", async () => {
  h.db.exec("UPDATE shifts SET state='CLOSED'");
  await error("checkout", sale(), "SHIFT_CLOSED", 409);
});
it("sold phone returns PHONE_NOT_AVAILABLE 409", async () => {
  h.db.exec("UPDATE phones SET state='SOLD'");
  await error("checkout", sale(), "PHONE_NOT_AVAILABLE", 409);
});
it("accessory oversell returns INSUFFICIENT_STOCK 409", async () => {
  const input = sale();
  const { buyer, ...payload } = input.payload;
  await error(
    "checkout",
    {
      ...input,
      payload: {
        ...payload,
        lines: [{ kind: "accessory", itemId: accessory, quantity: "3" }],
        warranties: [],
        tenderedAmount: "3.00",
      },
    },
    "INSUFFICIENT_STOCK",
    409,
  );
});
it.each(["imei1", "serial", "barcode"])(
  "duplicate %s returns DUPLICATE_IDENTIFIER 409",
  async (field) => {
    const input = receiving();
    const value = field === "imei1" ? "490154203237518" : field === "serial" ? "SERIAL" : "BAR";
    await error(
      "receive",
      { ...input, phones: [{ ...input.phones[0], [field]: value }] },
      "DUPLICATE_IDENTIFIER",
      409,
    );
    expect(h.db.prepare("SELECT count(*) n FROM standalone_receipts").get()?.["n"]).toBe(0);
  },
);
it("same key with different basket returns IDEMPOTENCY_CONFLICT 409", async () => {
  const handler = api(),
    input = sale();
  expect((await handler(request("checkout", input))).status).toBe(200);
  await error(
    "checkout",
    {
      ...input,
      payload: {
        ...input.payload,
        lines: [...input.payload.lines, { itemId: accessory, kind: "accessory", quantity: "1" }],
        tenderedAmount: "2.00",
      },
    },
    "IDEMPOTENCY_CONFLICT",
    409,
    handler,
  );
  expect(h.db.prepare("SELECT count(*) n FROM sales").get()?.["n"]).toBe(1);
});
it("same command key with another actor returns IDEMPOTENCY_CONFLICT 409", async () => {
  const handler = api();
  expect((await handler(request("execute", command()))).status).toBe(200);
  await error("execute", command(), "IDEMPOTENCY_CONFLICT", 409, handler, "owner");
});
it.each(["checkout", "execute", "receive"])(
  "%s schema errors are VALIDATION 422",
  async (route) => {
    await error(route, {}, "VALIDATION", 422);
  },
);
it("duplicate phone and missing bank evidence are VALIDATION 422 before a batch", async () => {
  const input = sale();
  await error(
    "checkout",
    {
      ...input,
      payload: { ...input.payload, lines: [...input.payload.lines, ...input.payload.lines] },
    },
    "VALIDATION",
    422,
  );
  await error(
    "checkout",
    { ...input, payload: { ...input.payload, bankMethod: "CARD" } },
    "VALIDATION",
    422,
  );
  expect(() =>
    validatedPlan(() => {
      throw new Error("DUPLICATE_PHONE");
    }),
  ).toThrow("VALIDATION");
  expect(() =>
    validatedPlan(() => {
      throw new Error("BANK_EVIDENCE_REQUIRED");
    }),
  ).toThrow("VALIDATION");
});
it.each(["checkout", "execute", "receive"])(
  "%s unexplained atomic rollback is NOT_RECORDED 503 retryable without write retry",
  async (route) => {
    const batch = vi.fn(async () => {
      throw new Error("D1_FAILURE");
    });
    const handler = api({ ...h.port, batch });
    const input = route === "checkout" ? sale() : route === "receive" ? receiving() : command();
    const response = await handler(request(route, input));
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: "NOT_RECORDED", retryable: true });
    expect(batch).toHaveBeenCalledTimes(1);
  },
);
it.each(["checkout", "execute", "receive"])(
  "%s lost batch reply returns DONE stored response without write retry",
  async (route) => {
    const batch = vi.fn(async (plan: Parameters<AtomicSqlPort["batch"]>[0]) => {
      await h.port.batch(plan);
      throw new Error("LOST_REPLY");
    });
    const handler = api({ ...h.port, batch });
    const input = route === "checkout" ? sale() : route === "receive" ? receiving() : command();
    const response = await handler(request(route, input));
    expect(response.status).toBe(200);
    const result = await response.json();
    if (route === "checkout")
      expect(JSON.parse(result.response_json).key).toBe(sale().idempotencyKey);
    else expect(result.key).toBe(route === "receive" ? receiving().key : command().key);
    expect(batch).toHaveBeenCalledTimes(1);
  },
);
it("diagnostic query failure alone yields OUTCOME_UNKNOWN 503", async () => {
  let failed = false;
  const batch = vi.fn(async () => {
    failed = true;
    throw new Error("FAILURE");
  });
  const read: AtomicSqlPort["read"] = async (query) => {
    if (failed) throw new Error("READ_FAILURE");
    return h.port.read(query);
  };
  await error("checkout", sale(), "OUTCOME_UNKNOWN", 503, api({ ...h.port, batch, read }));
  expect(batch).toHaveBeenCalledTimes(1);
});
it("a session revoked during a failed batch returns SESSION_REVOKED, not unknown", async () => {
  const batch = vi.fn(async () => {
    h.db.exec("UPDATE sessions SET revoked=1 WHERE id='seller'");
    throw new Error("FAILURE");
  });
  await error("checkout", sale(), "SESSION_REVOKED", 401, api({ ...h.port, batch }));
});
it("membership removed during failed batch returns FORBIDDEN", async () => {
  const batch = vi.fn(async () => {
    h.db.exec("DELETE FROM memberships WHERE user_id='seller'");
    throw new Error("FAILURE");
  });
  await error("checkout", sale(), "FORBIDDEN", 403, api({ ...h.port, batch }));
});
it.each([
  "SHIFT_CLOSED",
  "PHONE_NOT_AVAILABLE",
  "INSUFFICIENT_STOCK",
  "DUPLICATE_IDENTIFIER",
  "IDEMPOTENCY_CONFLICT",
  "VALIDATION",
  "SESSION_REVOKED",
  "FORBIDDEN",
])("controller preserves %s as definitive and never probes outcome", async (code) => {
  const outcome = vi.fn();
  const checkout = vi.fn(async () => {
    throw new TransportError(code);
  });
  const controller = createDailyNativeController(
    createNativeRepository({
      status: async () => ({ connected: true, verified: true }),
      read: async () => null,
      execute: async () => null,
      checkout,
      outcome,
    }),
    "M01",
  );
  await expect(controller.checkout(sale())).rejects.toMatchObject({ code });
  expect(controller.getSnapshot().state).not.toBe("OUTCOME_UNKNOWN");
  await expect(controller.reconcile()).rejects.toThrow("NO_PENDING_OUTCOME");
  expect(outcome).not.toHaveBeenCalled();
});
it("NOT_RECORDED explicit retry reuses original key and payload without outcome probe or automatic retry", async () => {
  const checkout = vi.fn(async () => {
    throw new TransportError("NOT_RECORDED");
  });
  const outcome = vi.fn();
  const controller = createDailyNativeController(
    createNativeRepository({
      status: async () => ({ connected: true, verified: true }),
      read: async () => null,
      execute: async () => null,
      checkout,
      outcome,
    }),
    "M01",
  );
  const input = sale();
  await expect(controller.checkout(input)).rejects.toThrow("NOT_RECORDED");
  expect(controller.getSnapshot()).toEqual({ state: "NOT_RECORDED", key: input.idempotencyKey });
  expect(checkout).toHaveBeenCalledTimes(1);
  await expect(controller.retryNotRecorded()).rejects.toThrow("NOT_RECORDED");
  expect(checkout).toHaveBeenCalledTimes(2);
  expect(checkout.mock.calls[0]).toEqual(checkout.mock.calls[1]);
  expect(outcome).not.toHaveBeenCalled();
});
