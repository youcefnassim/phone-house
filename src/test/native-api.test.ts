import { beforeEach, afterEach, it, expect, describe } from "vitest";
import { sqliteHarness } from "./sqlite-harness";
import { createNativeService } from "@/backend/sqlite/service";
import { createNativeApiHandler } from "@/backend/native-api";
import { nativeOperationStatus, type NativeOperation } from "@/domain/native-commands";
import type { PrivateDocumentPort } from "@/backend/sqlite/port";
// LOCAL SQLite + portable fetch handler. Not hosted D1/Workers/R2/Auth evidence.
const ORIGIN = "https://erp.test.invalid";
let h: ReturnType<typeof sqliteHarness>;
let objects: Map<string, { bytes: ArrayBuffer; contentType: string }>;
let n = 0;
const tokens: Record<string, string> = {
  "tok-owner-000000000000": "owner",
  "tok-manager-0000000000": "manager",
  "tok-seller-00000000000": "seller",
  "tok-m2manager-00000000": "m2manager",
};
const tok = (u: string) => Object.keys(tokens).find((k) => tokens[k] === u)!;
function api(enabled = true) {
  const docs: PrivateDocumentPort = {
    get: async (k) => objects.get(k) ?? null,
    put: async (k, b, c) => {
      objects.set(k, { bytes: b, contentType: c });
    },
  };
  const service = createNativeService(
    h.port,
    {
      verify: async (c) =>
        tokens[c] ? { userId: tokens[c]!, sessionId: tokens[c]!, expiresAt: 2000 } : null,
    },
    docs,
    () => 1000,
  );
  return createNativeApiHandler(service, { allowedOrigin: ORIGIN, enabled });
}
const post = (path: string, body: unknown, user?: string, headers: Record<string, string> = {}) =>
  new Request(`${ORIGIN}/api/native/${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: ORIGIN,
      ...(user ? { Authorization: `Bearer ${tok(user)}` } : {}),
      ...headers,
    },
    body: JSON.stringify(body),
  });
const cmd = (
  operation: NativeOperation,
  payload: unknown,
  key = `api-command-key-${String(++n).padStart(6, "0")}`,
) => ({ version: "native-2026-11-06", key, operation, payload });
beforeEach(() => {
  h = sqliteHarness();
  objects = new Map();
  n = 0;
  h.db.exec(
    `INSERT INTO accounts VALUES('owner',1),('manager',1),('m2manager',1),('seller',1);INSERT INTO memberships VALUES('owner','GLOBAL','SUPER_ADMIN'),('manager','M01','MANAGER'),('m2manager','M02','MANAGER'),('seller','M01','SELLER');INSERT INTO sessions SELECT id,id,2000,0 FROM accounts;INSERT INTO drawers VALUES('drawer','M01'),('drawer2','M02');`,
  );
});
afterEach(() => h.db.close());

describe("request boundary", () => {
  it("disabled host reports disconnected status and refuses everything else", async () => {
    const a = api(false);
    expect(await (await a(post("status", {}))).json()).toEqual({
      connected: false,
      verified: false,
    });
    expect((await a(post("read", { module: "customers", store: "M01" }, "owner"))).status).toBe(
      503,
    );
  });
  it("rejects cross-origin, missing origin, wrong method, wrong content type and unknown routes", async () => {
    const a = api();
    expect(
      (
        await a(
          post("read", { module: "customers", store: "M01" }, "owner", {
            Origin: "https://evil.invalid",
          }),
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await a(
          new Request(`${ORIGIN}/api/native/read`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${tok("owner")}`,
            },
            body: "{}",
          }),
        )
      ).status,
    ).toBe(403);
    expect((await a(new Request(`${ORIGIN}/api/native/execute`, { method: "GET" }))).status).toBe(
      405,
    );
    expect(
      (
        await a(
          new Request(`${ORIGIN}/api/native/execute`, {
            method: "PUT",
            headers: { Origin: ORIGIN },
          }),
        )
      ).status,
    ).toBe(405);
    expect((await a(post("read", {}, "owner", { "Content-Type": "text/plain" }))).status).toBe(400);
    expect((await a(post("../admin", {}, "owner"))).status).toBe(404);
  });
  it("every response carries a correlation id, no-store and sanitized error codes", async () => {
    const r = await api()(post("read", { module: "customers", store: "M01", extra: 1 }, "owner"));
    expect(r.status).toBe(400);
    expect(r.headers.get("X-Request-Id")).toMatch(/^[0-9a-f-]{36}$/);
    expect(r.headers.get("Cache-Control")).toBe("no-store");
    const b = (await r.json()) as Record<string, unknown>;
    expect(Object.keys(b).sort()).toEqual(["error", "requestId"]);
    expect(JSON.stringify(b)).not.toMatch(/zod|sql|stack/i);
  });
  it("missing or unknown bearer is 401; status reports unverified; revoked session is unverified", async () => {
    const a = api();
    expect((await a(post("read", { module: "customers", store: "M01" }))).status).toBe(401);
    expect(
      (
        await a(
          new Request(`${ORIGIN}/api/native/read`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Origin: ORIGIN,
              Authorization: "Bearer tok-nobody-000000000000",
            },
            body: JSON.stringify({ module: "customers", store: "M01" }),
          }),
        )
      ).status,
    ).toBe(401);
    expect(await (await a(post("status", {}, "seller"))).json()).toMatchObject({
      connected: true,
      verified: true,
      memberships: [{ store: "M01", role: "SELLER" }],
    });
    h.db.exec(`UPDATE sessions SET revoked=1 WHERE id='seller'`);
    expect(await (await a(post("status", {}, "seller"))).json()).toMatchObject({
      connected: true,
      verified: false,
    });
  });
  it("client-supplied actor/role fields are rejected by the strict envelope", async () => {
    const r = await api()(
      post(
        "execute",
        {
          ...cmd("customer.save", { store: "M01", id: "c", name: "TEST", reference: "TEST-C" }),
          actor: "owner",
          role: "SUPER_ADMIN",
        },
        "seller",
      ),
    );
    expect(r.status).toBe(422);
    expect(h.db.prepare("SELECT count(*) n FROM customers").get()).toEqual({ n: 0 });
  });
});
describe("role/store reads and cost secrecy", () => {
  it("seller cannot read purchases/suppliers/expenses/audit/users; 2026-11-09 M01 manager reads only their store", async () => {
    const a = api();
    for (const m of ["purchases", "suppliers", "expenses", "audit", "users"])
      expect((await a(post("read", { module: m, store: "M01" }, "seller"))).status).toBe(403);
    expect((await a(post("read", { module: "users", store: "M01" }, "manager"))).status).toBe(403);
    expect((await a(post("read", { module: "customers", store: "M02" }, "manager"))).status).toBe(
      403,
    );
    expect((await a(post("read", { module: "customers", store: "M01" }, "manager"))).status).toBe(
      200,
    );
  });
  it("confidential finance endpoint is Super Admin only; operational purchase rows contain no cost columns", async () => {
    const a = api();
    for (const op of [
      cmd("supplier.save", { store: "M01", id: "s", name: "TEST", reference: "TEST-S" }),
      cmd("catalog.save", {
        store: "M01",
        id: "i",
        kind: "accessory",
        sku: "TEST-SKU",
        name: "TEST",
        attributes: {},
      }),
      cmd("purchase.save", {
        store: "M01",
        id: "po",
        supplierId: "s",
        itemId: "i",
        quantity: 2,
        evidence: "TEST",
      }),
      cmd("purchase.finance", { store: "M01", purchaseId: "po", cost: "12.34", obligation: null }),
    ])
      expect((await a(post("execute", op, "owner"))).status).toBe(200);
    for (const u of ["manager", "seller", "m2manager"])
      expect((await a(post("finance", { store: "M01" }, u))).status).toBe(403);
    expect(await (await a(post("finance", { store: "M01" }, "owner"))).json()).toMatchObject({
      confidential: true,
      rows: [{ purchase_id: "po", cost_minor: 1234, obligation_minor: null }],
    });
    const read = (await (
      await a(post("read", { module: "purchases", store: "M01" }, "owner"))
    ).json()) as { rows: Record<string, unknown>[] };
    expect(read.rows).toHaveLength(1);
    expect(JSON.stringify(read)).not.toMatch(/cost|obligation|1234/);
  });
  it("server pagination and escaped search", async () => {
    const a = api();
    for (let i = 0; i < 7; i++)
      await a(
        post(
          "execute",
          cmd("customer.save", {
            store: "M01",
            id: `c${i}`,
            name: i === 3 ? "TEST 50%_off" : `TEST ${i}`,
            reference: `TEST-C${i}`,
          }),
          "owner",
        ),
      );
    const p1 = (await (
      await a(post("read", { module: "customers", store: "M01", limit: 5, offset: 0 }, "owner"))
    ).json()) as { rows: unknown[]; page: { hasMore: boolean } };
    expect(p1.rows).toHaveLength(5);
    expect(p1.page.hasMore).toBe(true);
    const p2 = (await (
      await a(post("read", { module: "customers", store: "M01", limit: 5, offset: 5 }, "owner"))
    ).json()) as { rows: unknown[]; page: { hasMore: boolean } };
    expect(p2.rows).toHaveLength(2);
    expect(p2.page.hasMore).toBe(false);
    const s = (await (
      await a(post("read", { module: "customers", store: "M01", search: "50%_" }, "owner"))
    ).json()) as { rows: { id: string }[] };
    expect(s.rows.map((r) => r.id)).toEqual(["c3"]);
    expect(
      (await a(post("read", { module: "customers", store: "M01", limit: 101 }, "owner"))).status,
    ).toBe(400);
  });
});
describe("commands, idempotency and unknown outcome readback", () => {
  it("execute returns key-bound receipt; same key replay returns same result; changed payload with same key is rejected", async () => {
    const a = api();
    const c = cmd(
      "customer.save",
      { store: "M01", id: "c", name: "TEST", reference: "TEST-C" },
      "api-idem-key-00000001",
    );
    const r1 = (await (await a(post("execute", c, "owner"))).json()) as Record<string, unknown>;
    expect(r1).toMatchObject({ key: c.key, status: "RECORDED" });
    const changed = await a(
      post(
        "execute",
        { ...c, payload: { store: "M01", id: "c", name: "TEST changed", reference: "TEST-C" } },
        "owner",
      ),
    );
    expect(changed.status).toBe(409);
    expect(await changed.json()).toMatchObject({ error: "IDEMPOTENCY_CONFLICT", key: c.key });
    expect(await (await a(post("outcome", { key: c.key }, "owner"))).json()).toEqual({
      found: true,
      result: r1,
    });
    expect(await (await a(post("outcome", { key: c.key }, "seller"))).json()).toEqual({
      found: false,
    });
    expect(h.db.prepare("SELECT name FROM customers").get()).toEqual({ name: "TEST" });
  });
  it("2026-11-09 price is no longer owner-only; purchase finance remains refused for managers", async () => {
    const r = await api()(
      post(
        "execute",
        cmd("purchase.finance", { store: "M01", purchaseId: "x", cost: "1.00", obligation: null }),
        "manager",
      ),
    );
    expect(r.status).toBe(403);
    expect(h.db.prepare("SELECT count(*) n FROM commands").get()).toEqual({ n: 0 });
    expect(h.db.prepare("SELECT count(*) n FROM audit_events").get()).toEqual({ n: 0 });
  });
  it("two stores keep one drawer each: M02 manager cannot open M01 drawer, seller cannot open twice", async () => {
    const a = api();
    expect(
      (
        await a(
          post(
            "execute",
            cmd("cash.open", { store: "M01", id: "sh1", drawerId: "drawer", opening: "10.00" }),
            "seller",
          ),
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await a(
          post(
            "execute",
            cmd("cash.open", { store: "M01", id: "sh2", drawerId: "drawer", opening: "10.00" }),
            "seller",
          ),
        )
      ).status,
    ).toBe(409); // 2026-11-09 batch 1d: deterministic rejection
    expect(
      (
        await a(
          post(
            "execute",
            cmd("cash.open", { store: "M02", id: "sh3", drawerId: "drawer", opening: "10.00" }),
            "m2manager",
          ),
        )
      ).status,
    ).toBe(409); // 2026-11-09 batch 1d: deterministic rejection
    expect(h.db.prepare("SELECT count(*) n FROM shifts").get()).toEqual({ n: 1 });
  });
  it("policy-gated operations return POLICY_BLOCKED and post nothing to cash", async () => {
    const a = api();
    await a(
      post(
        "execute",
        cmd("cash.open", { store: "M01", id: "sh1", drawerId: "drawer", opening: "10.00" }),
        "owner",
      ),
    );
    const r = await (
      await a(
        post(
          "execute",
          cmd("cash.evidence", {
            store: "M01",
            shiftId: "sh1",
            direction: "OUT",
            amount: "5.00",
            reference: "TEST",
          }),
          "owner",
        ),
      )
    ).json();
    expect(r).toMatchObject({ status: "POLICY_BLOCKED" });
    const e = await (
      await a(
        post(
          "execute",
          cmd("expense.draft", { store: "M01", id: "e1", amount: "5.00", evidence: "TEST" }),
          "owner",
        ),
      )
    ).json();
    expect(e).toMatchObject({ status: "POLICY_BLOCKED" });
    expect(h.db.prepare("SELECT count(*) n FROM cash_movements").get()).toEqual({ n: 0 });
  });
  it("declared per-operation statuses match the SQL planner for sampled operations", async () => {
    const a = api();
    const samples: [NativeOperation, unknown, string][] = [
      ["customer.save", { store: "M01", id: "c", name: "T", reference: "TEST-C" }, "seller"],
      ["supplier.save", { store: "M01", id: "s", name: "T", reference: "TEST-S" }, "owner"],
      [
        "catalog.save",
        { store: "M01", id: "i", kind: "accessory", sku: "TEST-SKU", name: "T", attributes: {} },
        "owner",
      ],
      [
        "purchase.save",
        { store: "M01", id: "po", supplierId: "s", itemId: "i", quantity: 1, evidence: "T" },
        "owner",
      ],
      [
        "transfer.create",
        {
          store: "M01",
          id: "tr",
          destination: "M02",
          lines: [{ itemId: "i", kind: "accessory", quantity: 1, code: "TEST-SKU" }],
        },
        "owner",
      ],
      ["expense.draft", { store: "M01", id: "e", amount: "1.00", evidence: "T" }, "owner"],
    ];
    for (const [op, payload, user] of samples) {
      const r = (await (await a(post("execute", cmd(op, payload), user))).json()) as {
        status: string;
      };
      expect(r.status).toBe(nativeOperationStatus[op]);
    }
  });
});
describe("private document staging and offline replay contract", () => {
  const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]);
  const sha = async (b: Uint8Array<ArrayBuffer>) =>
    Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", b)), (x) =>
      x.toString(16).padStart(2, "0"),
    ).join("");
  it("register -> upload stays PENDING -> verified finalize makes AVAILABLE; tampered object is QUARANTINED; manager refused", async () => {
    const a = api();
    const service = createNativeService(
      h.port,
      {
        verify: async (c) =>
          tokens[c] ? { userId: tokens[c]!, sessionId: tokens[c]!, expiresAt: 2000 } : null,
      },
      {
        get: async (k) => objects.get(k) ?? null,
        put: async (k, b, c) => {
          objects.set(k, { bytes: b, contentType: c });
        },
      },
      () => 1000,
    );
    for (const id of ["doc1", "doc2"])
      expect(
        (
          await a(
            post(
              "execute",
              cmd("document.register", {
                store: "M01",
                id,
                mime: "image/png",
                size: png.byteLength,
                sha256: await sha(png),
              }),
              "owner",
            ),
          )
        ).status,
      ).toBe(200);
    for (const id of ["doc1", "doc2"])
      expect(
        await service.uploadDocument(tok("owner"), id, "M01", png.slice().buffer, "image/png"),
      ).toMatchObject({ state: "PENDING", posted: false });
    expect(
      (await a(post("document/finalize", { id: "doc1", store: "M01" }, "manager"))).status,
    ).toBe(403);
    expect(
      await (await a(post("document/finalize", { id: "doc1", store: "M01" }, "owner"))).json(),
    ).toEqual({ id: "doc1", state: "AVAILABLE" });
    const tampered = png.slice();
    tampered[10] = 9;
    objects.set("M01/doc2", { bytes: tampered.buffer, contentType: "image/png" });
    expect(
      await (await a(post("document/finalize", { id: "doc2", store: "M01" }, "owner"))).json(),
    ).toEqual({ id: "doc2", state: "QUARANTINED" });
    expect((await a(post("document/finalize", { id: "doc1", store: "M01" }, "owner"))).status).toBe(
      404,
    );
    await expect(service.document(tok("owner"), "doc2", "M01")).rejects.toThrow("NOT_FOUND");
    expect(
      h.db.prepare("SELECT outcome FROM document_verifications ORDER BY outcome").all(),
    ).toEqual([{ outcome: "AVAILABLE" }, { outcome: "QUARANTINED" }]);
    expect(() => h.db.exec("DELETE FROM document_verifications")).toThrow("APPEND_ONLY");
  });
  it("offline replay: unknown/revoked/expired devices, duplicates and conflicts classified; never final", async () => {
    const a = api();
    h.db.exec(
      `INSERT INTO devices VALUES('dev-ok','seller','M01',0,5000),('dev-revoked','seller','M01',1,5000),('dev-old','seller','M01',0,500),('dev-other','manager','M01',0,5000)`,
    );
    const env = {
      contractVersion: "2026-11-03",
      idempotencyKey: "offline-sale-key-000001",
      clientRequestId: "11111111-1111-4111-8111-111111111111",
      payload: { note: "TEST" },
    };
    const replay = async (deviceId: string, envelope: unknown = env) =>
      (await (
        await a(post("replay", { deviceId, store: "M01", envelope }, "seller"))
      ).json()) as Record<string, unknown>;
    const v = (await import("@/domain/transaction-contracts")).transactionVersion;
    const e = { ...env, contractVersion: v };
    expect(await replay("dev-missing", e)).toMatchObject({
      classification: "DEVICE_UNKNOWN",
      final: false,
    });
    expect(await replay("dev-other", e)).toMatchObject({ classification: "DEVICE_UNKNOWN" });
    expect(await replay("dev-revoked", e)).toMatchObject({ classification: "DEVICE_REVOKED" });
    expect(await replay("dev-old", e)).toMatchObject({ classification: "DEVICE_EXPIRED" });
    expect(await replay("dev-ok", e)).toEqual({
      classification: "POLICY_BLOCKED",
      final: false,
      key: e.idempotencyKey,
    });
    expect(await replay("dev-ok", e)).toMatchObject({
      classification: "POLICY_BLOCKED",
      final: false,
    });
    expect(await replay("dev-ok", { ...e, payload: { note: "TEST changed" } })).toMatchObject({
      classification: "CONFLICT",
      final: false,
    });
    expect(h.db.prepare("SELECT count(*) n FROM sales").get()).toEqual({ n: 0 });
    expect(h.db.prepare("SELECT count(*) n FROM offline_replays").get()).toEqual({ n: 1 });
  });
});
