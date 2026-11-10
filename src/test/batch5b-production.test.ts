import { afterEach, beforeEach, expect, it } from "vitest";
import { sqliteHarness } from "./sqlite-harness";
import { createNativeService } from "@/backend/sqlite/service";
import { createNativeApiHandler } from "@/backend/native-api";
import { createNativeRepository, disconnectedNativeTransport } from "@/data/native-repository";
import { permits, routeOperation, routeAllowed, routeOperations } from "@/domain/permissions";
let h: ReturnType<typeof sqliteHarness>;
const now = Date.parse("2026-11-09T23:30:00Z");
const service = () =>
  createNativeService(
    h.port,
    { verify: async (userId) => ({ userId, sessionId: userId, expiresAt: now + 100000 }) },
    { get: async () => null, put: async () => {} },
    () => now,
  );
beforeEach(() => {
  h = sqliteHarness();
  h.db.exec(`INSERT INTO accounts VALUES('owner',1),('seller',1),('manager',1);
    INSERT INTO memberships VALUES('owner','GLOBAL','SUPER_ADMIN'),('seller','M01','SELLER'),('manager','M01','MANAGER');
    INSERT INTO sessions SELECT id,id,${now + 100000},0 FROM accounts;
    INSERT INTO drawers VALUES('drawer','M01');
    INSERT INTO catalog VALUES('acc','accessory','ACC','Cable','{"lowStockThreshold":2}'),('other','accessory','OTHER','Case','{}');
    INSERT INTO accessory_balances VALUES('M01','acc',2),('M01','other',0);`);
});
afterEach(() => h.db.close());
it("production disconnected repository never returns fixture dashboard or operational rows", async () => {
  const repo = createNativeRepository(disconnectedNativeTransport);
  await expect(repo.ownerDashboard()).rejects.toThrow("NOT_CONNECTED");
  expect(await repo.read("/sales", "M01", { limit: 25, offset: 0 })).toEqual({
    state: "NOT_CONNECTED",
  });
});
it("owner home reads actual low stock only when an owner threshold exists and uses Algiers day", async () => {
  const d = await service().ownerDashboard("owner");
  expect(d.day).toBe("2026-11-10");
  expect(d.lowStock).toEqual([
    { store: "M01", id: "acc", name: "Cable", quantity: 2, threshold: 2 },
  ]);
  expect(d.sales).toEqual([]);
  expect(d.drawers).toEqual([]);
  expect(d.lateCredits).toEqual([]);
  expect(d.waiting).toEqual([]);
});
it("owner drawer card includes real cash movements and excludes bank journals", async () => {
  const s = service();
  await s.execute("owner", {
    version: "native-2026-11-06",
    key: "batch5b-open-drawer",
    operation: "cash.open",
    payload: { store: "M01", id: "shift", drawerId: "drawer", opening: "10" },
  });
  await s.execute("owner", {
    version: "native-2026-11-06",
    key: "batch5b-cash-movement",
    operation: "cash.movement",
    payload: {
      store: "M01",
      shiftId: "shift",
      direction: "OUT",
      amount: "2",
      reason: "Autre",
      note: "expense",
    },
  });
  expect((await s.ownerDashboard("owner")).drawers).toEqual([
    { store: "M01", id: "drawer", amountMinor: 800 },
  ]);
});
it.each(["seller", "manager"])("%s direct owner endpoint denied by server", async (user) => {
  await expect(service().ownerDashboard(user)).rejects.toThrow("FORBIDDEN");
});
it("owner dashboard rechecks revocation after its multi-query projection", async () => {
  let reads = 0;
  const port = {
    ...h.port,
    read: async (query: Parameters<typeof h.port.read>[0]) => {
      const result = await h.port.read(query);
      if (++reads === 6) h.db.exec("UPDATE sessions SET revoked=1 WHERE id='owner'");
      return result;
    },
  };
  const s = createNativeService(
    port,
    { verify: async () => ({ userId: "owner", sessionId: "owner", expiresAt: now + 100000 }) },
    { get: async () => null, put: async () => {} },
    () => now,
  );
  await expect(s.ownerDashboard("owner")).rejects.toThrow("FORBIDDEN");
});
it.each(["/pos", "/stock/phones", "/stock/accessories", "/cash", "/sales"])(
  "seller navigation permits daily route %s only in own store",
  (path) => {
    expect(permits("SELLER", "M01", "M01", routeOperation(path))).toBe(true);
    expect(permits("SELLER", "M01", "M02", routeOperation(path))).toBe(false);
  },
);
it.each([
  "transfers",
  "sav",
  "debts",
  "suppliers",
  "purchases",
  "expenses",
  "audit",
  "users",
  "reports",
  "facility",
] as const)("seller direct URL /%s refuses its corresponding server projection", async (module) => {
  expect(permits("SELLER", "M01", "M01", routeOperation(`/${module}`))).toBe(false);
  await expect(service().read("seller", module, "M01")).rejects.toThrow("FORBIDDEN");
});
it.each(["transfers", "sav", "debts", "suppliers", "inventory"] as const)(
  "manager gets %s in own store, not another store",
  async (module) => {
    const path = module === "inventory" ? "/stock/phones" : `/${module}`;
    expect(permits("MANAGER", "M01", "M01", routeOperation(path))).toBe(true);
    await expect(service().read("manager", module, "M01")).resolves.toBeInstanceOf(Array);
    await expect(service().read("manager", module, "M02")).rejects.toThrow("FORBIDDEN");
  },
);
it("owner dashboard API is bearer-authenticated, no-cache and owner-only", async () => {
  const handler = createNativeApiHandler(service(), {
    enabled: true,
    allowedOrigin: "https://erp.example",
  });
  for (const user of ["seller", "owner"]) {
    const token = `${user}________________`;
    const s = createNativeService(
      h.port,
      { verify: async () => ({ userId: user, sessionId: user, expiresAt: now + 100000 }) },
      { get: async () => null, put: async () => {} },
      () => now,
    );
    const handle = createNativeApiHandler(s, {
      enabled: true,
      allowedOrigin: "https://erp.example",
    });
    const response = await handle(
      new Request("https://erp.example/api/native/owner/dashboard", {
        method: "POST",
        headers: {
          Origin: "https://erp.example",
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: "{}",
      }),
    );
    expect(response.status).toBe(user === "owner" ? 200 : 403);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  }
  expect(
    (
      await handler(
        new Request("https://erp.example/api/native/owner/dashboard", {
          method: "POST",
          headers: { Origin: "https://erp.example", "Content-Type": "application/json" },
          body: "{}",
        }),
      )
    ).status,
  ).toBe(401);
});

it("route registry is explicit, unknown routes fail closed, owner alone accesses the home", () => {
  expect(routeAllowed([{ role: "SUPER_ADMIN", store: "GLOBAL" }], "M01", "/unregistered")).toBe(
    false,
  );
  for (const role of ["SELLER", "MANAGER"])
    expect(routeAllowed([{ role, store: "M01" }], "M01", "/")).toBe(false);
  expect(routeOperations["/waiting"]).toBe("owner.read");
});
it.each(["users", "reports", "facility"] as const)(
  "manager restricted /%s is denied by the server and route matrix",
  async (module) => {
    expect(routeAllowed([{ role: "MANAGER", store: "M01" }], "M01", `/${module}`)).toBe(false);
    await expect(service().read("manager", module, "M01")).rejects.toThrow("FORBIDDEN");
  },
);
