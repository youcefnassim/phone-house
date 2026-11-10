import { afterEach, beforeEach, it, expect } from "vitest";
import { sqliteHarness } from "./sqlite-harness";
import { createNativeService } from "@/backend/sqlite/service";
import { createNativeRepository, TransportError } from "@/data/native-repository";
import { createNativeApiHandler } from "@/backend/native-api";
let h: ReturnType<typeof sqliteHarness>;
const seed = `INSERT INTO accounts VALUES('owner',1),('s1',1),('m2',1),('old',1);INSERT INTO memberships VALUES('owner','GLOBAL','SUPER_ADMIN'),('s1','M01','SELLER'),('m2','M02','MANAGER'),('old','M01','MANAGER');INSERT INTO sessions SELECT id,id,2000,0 FROM accounts;INSERT INTO catalog VALUES('model','phone','PH','Téléphone','{}'),('acc','accessory','ACC','USB cable','{"barcode":"ACC-BAR","variant":"USB-C"}'),('unpriced','accessory','NO-PRICE','Unpriced','{}');INSERT INTO prices VALUES('M01','model',12345),('M01','acc',101);INSERT INTO phones(id,store_id,catalog_id,barcode,state,attributes_json,serial) VALUES('p1','M01','model','PHONE-BAR','AVAILABLE','{}','SERIAL-1'),('p2','M02','model','STORE2-BAR','AVAILABLE','{}','SERIAL-2'),('sold','M01','model','SOLD-BAR','SOLD','{}','SOLD-SERIAL');INSERT INTO phone_identifiers VALUES('490154203237518','p1',1),('490154203237526','p1',2);INSERT INTO accessory_balances VALUES('M01','acc',3),('M02','acc',7),('M01','unpriced',1);`;
const service = () =>
  createNativeService(
    h.port,
    { verify: async (user) => ({ userId: user, sessionId: user, expiresAt: 2000 }) },
    { get: async () => null, put: async () => {} },
    () => 1000,
  );
beforeEach(() => {
  h = sqliteHarness();
  h.db.exec(seed);
});
afterEach(() => h.db.close());
it.each(["PHONE-BAR", "490154203237518", "490154203237526", "SERIAL-1", "Téléphone"])(
  "native POS finds phone by %s without costs",
  async (search) => {
    const r = await service().posSearch("s1", { store: "M01", search });
    expect(r.items).toHaveLength(1);
    expect(r.items[0]).toMatchObject({ id: "p1", store: "M01", amountMinor: 12345, quantity: 1 });
    expect(JSON.stringify(r)).not.toMatch(/cost|margin|profit/);
  },
);
it("accessory barcode reads actual scoped quantity and absent price stays null", async () => {
  h.db.exec(
    `UPDATE catalog SET attributes_json=json_set(attributes_json,'$.cost',9000,'$.margin',5000) WHERE id='acc'; UPDATE phones SET attributes_json='{"cost":9900,"margin":4444}' WHERE id='p1'`,
  );
  const projection = await service().posSearch("s1", { store: "M01" });
  expect(JSON.stringify(projection)).not.toMatch(/cost|margin|9900|4444/);
  expect(projection.items.find((i) => i.id === "acc")?.variant).toBe("USB-C");
  expect(
    (await service().posSearch("s1", { store: "M01", search: "ACC-BAR" })).items[0],
  ).toMatchObject({ quantity: 3, amountMinor: 101 });
  expect(
    (await service().posSearch("m2", { store: "M02", search: "ACC-BAR" })).items[0],
  ).toMatchObject({ quantity: 7, amountMinor: null });
  expect(
    (await service().posSearch("s1", { store: "M01", search: "NO-PRICE" })).items[0]?.amountMinor,
  ).toBeNull();
});
it("2026-11-09 M01 manager can search; wrong store and revoked session are denied", async () => {
  await expect(service().posSearch("s1", { store: "M02" })).rejects.toThrow("FORBIDDEN");
  expect((await service().posSearch("old", { store: "M01" })).items.length).toBeGreaterThan(0);
  h.db.exec("UPDATE sessions SET revoked=1 WHERE id='s1'");
  await expect(service().posSearch("s1", { store: "M01" })).rejects.toThrow("FORBIDDEN");
});
it("literal wildcard search, sold exclusion and limit are enforced", async () => {
  expect((await service().posSearch("s1", { store: "M01", search: "%" })).items).toHaveLength(0);
  expect((await service().posSearch("s1", { store: "M01", search: "SOLD" })).items).toHaveLength(0);
  expect((await service().posSearch("s1", { store: "M01", limit: 1 })).items).toHaveLength(1);
  expect((await service().posSearch("s1", { store: "M01", search: "STORE2" })).items).toHaveLength(
    0,
  );
});
it("final query denies a session revoked between precheck and projection", async () => {
  let reads = 0;
  const port = {
    ...h.port,
    read: async (s: Parameters<typeof h.port.read>[0]) => {
      reads++;
      if (reads === 2) h.db.exec("UPDATE sessions SET revoked=1 WHERE id='s1'");
      return h.port.read(s);
    },
  };
  const svc = createNativeService(
    port,
    { verify: async () => ({ userId: "s1", sessionId: "s1", expiresAt: 2000 }) },
    { get: async () => null, put: async () => {} },
    () => 1000,
  );
  expect((await svc.posSearch("token", { store: "M01" })).items).toHaveLength(0);
});
it("API and typed inactive adapter roundtrip SQLite projection without local fallback", async () => {
  const api = createNativeApiHandler(service(), {
    enabled: true,
    allowedOrigin: "http://localhost:8080",
  });
  const r = await api(
    new Request("http://localhost:8080/api/native/pos/search", {
      method: "POST",
      headers: {
        Origin: "http://localhost:8080",
        "Content-Type": "application/json",
        Authorization: "Bearer s1xxxxxxxxxxxxxxxx",
      },
      body: JSON.stringify({ store: "M01" }),
    }),
  );
  expect(r.status).toBe(403);
  const repository = createNativeRepository({
    status: async () => ({ connected: true, verified: true }),
    read: async () => null,
    execute: async () => null,
    posSearch: (q) => service().posSearch("s1", q),
  });
  expect((await repository.posSearch({ store: "M01", search: "SERIAL-1" })).items[0]?.id).toBe(
    "p1",
  );
  await expect(
    createNativeRepository({
      status: async () => ({ connected: false, verified: false }),
      read: async () => null,
      execute: async () => null,
    }).posSearch({ store: "M01" }),
  ).rejects.toThrow("NOT_CONNECTED");
  await expect(
    createNativeRepository({
      status: async () => ({ connected: true, verified: true }),
      read: async () => null,
      execute: async () => null,
      posSearch: async () => {
        throw new TransportError("FORBIDDEN");
      },
    }).posSearch({ store: "M01" }),
  ).rejects.toThrow("FORBIDDEN");
});
