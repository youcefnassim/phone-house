import { afterEach, beforeEach, it, expect } from "vitest";
import { sqliteHarness } from "./sqlite-harness";
import { createNativeService } from "@/backend/sqlite/service";
import { createNativeRepository, TransportError } from "@/data/native-repository";
import { createNativeApiHandler } from "@/backend/native-api";
import { normalizedBuyer } from "@/domain/sales-review";
let h: ReturnType<typeof sqliteHarness>;
const seed = `INSERT INTO accounts VALUES('owner',1),('s1',1),('m2',1),('old',0);
INSERT INTO memberships VALUES('owner','GLOBAL','SUPER_ADMIN'),('s1','M01','SELLER'),('m2','M02','MANAGER'),('old','M01','MANAGER');
INSERT INTO sessions SELECT id,id,2000,0 FROM accounts;
INSERT INTO customers VALUES('cu1','M01','Amir Benali','REF-1'),('cu2','M02','Sara L','REF-2');
INSERT INTO customer_details VALUES('cu1','M01','Benali','Amir','0555','amir benali','0555');
INSERT INTO catalog VALUES('model','phone','PH','Téléphone','{}'),('acc','accessory','ACC','USB cable','{}');
INSERT INTO phones(id,store_id,catalog_id,barcode,state,attributes_json,serial) VALUES('p1','M01','model','PHONE-BAR','SOLD','{}','SERIAL-1');
INSERT INTO phone_identifiers VALUES('490154203237518','p1',1);
INSERT INTO drawers VALUES('d1','M01'),('d2','M02');
INSERT INTO shifts VALUES('sh1','M01','d1','s1','OPEN',1000,NULL),('sh2','M02','d2','m2','OPEN',2000,NULL);
INSERT INTO commands(key,actor_id,store_id,operation,payload_hash,state,transaction_id,response_json) VALUES('k1','s1','M01','pos.checkout','h','DONE','t1','{}'),('k2','m2','M02','pos.checkout','h','DONE','t2','{}'),('k3','s1','M01','cash.out','h','DONE','t3','{}'),('k4','s1','M01','pos.checkout','h','DONE','t4','{}');
INSERT INTO sales(id,command_key,store_id,shift_id,seller_id,customer_id,total_minor,tender,tendered_minor,change_minor,bank_reference) VALUES('sa1','k1','M01','sh1','s1','cu1',5000,'Cash',6000,1000,NULL),('sa2','k2','M02','sh2','m2','cu2',7000,'Bank',7000,0,'BNK-1'),('sa3','k4','M01','sh1','s1','cu1',9000,'Bank',9000,0,'BNK-2');
INSERT INTO receipt_snapshots VALUES('sa1',1729983600000,'{}'),('sa2',1729983600000,'{}'),('sa3',1730077200000,'{}');
INSERT INTO sale_lines VALUES('sa1','p1','phone',1,5000),('sa3','acc','accessory',2,4500),('sa2','acc','accessory',1,7000);
INSERT INTO cash_movements VALUES('mv1','k3','sh1','s1',500,'sortie');
UPDATE shifts SET state='CLOSED',counted_minor=5000 WHERE id='sh1';
INSERT INTO shift_closures VALUES('sh1',1800,'s1',5000,5000,'','PENDING');
INSERT INTO shift_reviews VALUES('rv1','sh1','owner',1900,'FLAGGED','écart');`;
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

it("customer search matches name, reference and accent-insensitive key, scoped to store", async () => {
  const byName = await service().customerSearch("s1", { store: "M01", search: "Benali" });
  expect(byName.customers[0]).toMatchObject({ id: "cu1", surname: "Benali", contact: "0555" });
  const byKey = await service().customerSearch("s1", { store: "M01", search: "Amir Bénali" });
  expect(byKey.customers.map((c) => c.id)).toEqual(["cu1"]);
  const byRef = await service().customerSearch("owner", { store: "M01", search: "REF-1" });
  expect(byRef.customers).toHaveLength(1);
  expect(JSON.stringify(byName)).not.toMatch(/cost|margin|profit/);
  await expect(service().customerSearch("s1", { store: "M02" })).rejects.toThrow("FORBIDDEN");
  await expect(service().customerSearch("old", { store: "M01" })).rejects.toThrow("FORBIDDEN");
});
it("customer history returns own-store sales with cost-free lines, newest first", async () => {
  const r = await service().customerHistory("s1", { store: "M01", customerId: "cu1" });
  expect(r.customer.id).toBe("cu1");
  expect(r.sales.map((s) => s.id)).toEqual(["sa3", "sa1"]);
  expect(r.sales[1]?.lines[0]).toMatchObject({
    kind: "phone",
    imei1: "490154203237518",
    unitMinor: 5000,
  });
  expect(JSON.stringify(r)).not.toMatch(/cost|margin|profit/);
  await expect(
    service().customerHistory("s1", { store: "M01", customerId: "cu2" }),
  ).rejects.toThrow("NOT_FOUND");
});
it("sales history filters by period, IMEI, seller, customer and tender", async () => {
  const all = await service().salesHistory("s1", { store: "M01" });
  expect(all.sales.map((s) => s.id)).toEqual(["sa3", "sa1"]);
  expect(all.hasMore).toBe(false);
  const day2 = await service().salesHistory("s1", { store: "M01", from: "2024-10-28" });
  expect(day2.sales.map((s) => s.id)).toEqual(["sa3"]);
  const day1 = await service().salesHistory("s1", { store: "M01", to: "2024-10-27" });
  expect(day1.sales.map((s) => s.id)).toEqual(["sa1"]);
  const byImei = await service().salesHistory("s1", {
    store: "M01",
    imei: "490154203237518",
  });
  expect(byImei.sales.map((s) => s.id)).toEqual(["sa1"]);
  const bank = await service().salesHistory("s1", { store: "M01", tender: "Bank" });
  expect(bank.sales.map((s) => s.id)).toEqual(["sa3"]);
  const paged = await service().salesHistory("s1", { store: "M01", limit: 1 });
  expect(paged.sales).toHaveLength(1);
  expect(paged.hasMore).toBe(true);
  const m2 = await service().salesHistory("m2", { store: "M02" });
  expect(m2.sales.map((s) => s.id)).toEqual(["sa2"]);
});
it("cash ledger returns shifts with immutable review state and movements", async () => {
  const r = await service().cashLedger("s1", { store: "M01" });
  expect(r.shifts[0]).toMatchObject({
    id: "sh1",
    state: "CLOSED",
    countedMinor: 5000,
    reviewState: "PENDING",
    reviewOutcome: "FLAGGED",
  });
  expect(r.movements[0]).toMatchObject({ id: "mv1", amountMinor: 500, reason: "sortie" });
  const m2 = await service().cashLedger("m2", { store: "M02" });
  expect(m2.shifts[0]).toMatchObject({ id: "sh2", state: "OPEN", reviewState: null });
  expect(m2.movements).toHaveLength(0);
  await expect(service().cashLedger("s1", { store: "M02" })).rejects.toThrow("FORBIDDEN");
});
it("final gate denies a session revoked between precheck and projection", async () => {
  const revoking = () => {
    let reads = 0;
    const port = {
      ...h.port,
      read: async (s: Parameters<typeof h.port.read>[0]) => {
        reads++;
        if (reads === 2) h.db.exec("UPDATE sessions SET revoked=1 WHERE id='s1'");
        return h.port.read(s);
      },
    };
    return createNativeService(
      port,
      { verify: async () => ({ userId: "s1", sessionId: "s1", expiresAt: 2000 }) },
      { get: async () => null, put: async () => {} },
      () => 1000,
    );
  };
  expect((await revoking().salesHistory("token", { store: "M01" })).sales).toHaveLength(0);
  h.db.exec("UPDATE sessions SET revoked=0 WHERE id='s1'");
  expect((await revoking().cashLedger("token", { store: "M01" })).shifts).toHaveLength(0);
});
it("API and typed adapter roundtrip sales history without local fallback", async () => {
  const svc = createNativeService(
    h.port,
    {
      verify: async (token) =>
        token === "tok-s1-xxxxxxxxxxxx" ? { userId: "s1", sessionId: "s1", expiresAt: 2000 } : null,
    },
    { get: async () => null, put: async () => {} },
    () => 1000,
  );
  const api = createNativeApiHandler(svc, {
    enabled: true,
    allowedOrigin: "http://localhost:8080",
  });
  const r = await api(
    new Request("http://localhost:8080/api/native/sales/history", {
      method: "POST",
      headers: {
        Origin: "http://localhost:8080",
        "Content-Type": "application/json",
        Authorization: "Bearer tok-s1-xxxxxxxxxxxx",
      },
      body: JSON.stringify({ store: "M01", tender: "Cash" }),
    }),
  );
  expect(r.status).toBe(200);
  const body = (await r.json()) as { sales: { id: string }[] };
  expect(body.sales.map((s) => s.id)).toEqual(["sa1"]);
  const repository = createNativeRepository({
    status: async () => ({ connected: true, verified: true }),
    read: async () => null,
    execute: async () => null,
    salesHistory: (q) => service().salesHistory("s1", q),
  });
  expect((await repository.salesHistory({ store: "M01" })).sales).toHaveLength(2);
  await expect(
    createNativeRepository({
      status: async () => ({ connected: false, verified: false }),
      read: async () => null,
      execute: async () => null,
    }).cashLedger({ store: "M01" }),
  ).rejects.toThrow("NOT_CONNECTED");
  await expect(
    createNativeRepository({
      status: async () => ({ connected: true, verified: true }),
      read: async () => null,
      execute: async () => null,
      customerSearch: async () => {
        throw new TransportError("FORBIDDEN");
      },
    }).customerSearch({ store: "M01" }),
  ).rejects.toThrow("FORBIDDEN");
  await expect(
    createNativeRepository({
      status: async () => ({ connected: true, verified: true }),
      read: async () => null,
      execute: async () => null,
      customerHistory: async () => ({
        source: "SERVER",
        store: "M02",
        customer: {
          id: "cu1",
          name: "x",
          reference: "r",
          surname: null,
          givenName: null,
          contact: null,
        },
        sales: [],
      }),
    }).customerHistory({ store: "M01", customerId: "cu1" }),
  ).rejects.toThrow("PROJECTION_SCOPE_MISMATCH");
});
it("normalized buyer key folds accents, case and whitespace", () => {
  expect(normalizedBuyer("  Bénali   Amir ")).toBe(normalizedBuyer("benali amir"));
  expect(normalizedBuyer("أميرـ بن علي")).toBe(normalizedBuyer("أمير بن علي"));
  expect(normalizedBuyer("Sara L")).not.toBe(normalizedBuyer("Sara K"));
});
