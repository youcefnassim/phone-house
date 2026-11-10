import { afterEach, beforeEach, expect, it } from "vitest";
import { sqliteHarness } from "./sqlite-harness";
import { createNativeService } from "@/backend/sqlite/service";
import {
  getTestState,
  resetTestWorkspace,
  saveTestPhoneModel,
  setReviewActor,
} from "@/data/test-workspace";
import { visibleCashMovements } from "@/domain/blind-count";
import { phoneModelSku } from "@/domain/phone-model";

// Owner decisions 2026-11-09 (batch 1e): inline model + store price at intake; true blind count.
let h: ReturnType<typeof sqliteHarness>;
beforeEach(() => {
  resetTestWorkspace();
  h = sqliteHarness();
  h.db.exec(`INSERT INTO accounts VALUES('owner',1),('m1',1),('s1',1);
INSERT INTO memberships VALUES('owner','GLOBAL','SUPER_ADMIN'),('m1','M01','MANAGER'),('s1','M01','SELLER');
INSERT INTO sessions SELECT id,id,2000,0 FROM accounts;
INSERT INTO drawers VALUES('d1','M01');
INSERT INTO commands(key,actor_id,store_id,operation,payload_hash,state,transaction_id,response_json) VALUES('k-open','s1','M01','pos.checkout','h','DONE','t1','{}'),('k-closed','s1','M01','pos.checkout','h','DONE','t2','{}');
INSERT INTO shifts VALUES('sh-closed','M01','d1','s1','OPEN',0,NULL);
INSERT INTO cash_movements VALUES('mv-closed','k-closed','sh-closed','s1',500,'SALE');
UPDATE shifts SET state='CLOSED',counted_minor=500 WHERE id='sh-closed';
INSERT INTO shifts VALUES('sh-open','M01','d1','s1','OPEN',0,NULL);
INSERT INTO cash_movements VALUES('mv-open','k-open','sh-open','s1',700,'SALE');`);
});
afterEach(() => h.db.close());
const service = () =>
  createNativeService(
    h.port,
    { verify: async (userId) => ({ userId, sessionId: userId, expiresAt: 2000 }) },
    { get: async () => null, put: async () => {} },
    () => 1000,
  );
let n = 0;
const cmd = (operation: string, payload: unknown) => ({
  version: "native-2026-11-06",
  key: `batch1e-key-${String(++n).padStart(6, "0")}`,
  operation,
  payload,
});

it("native: seller creates a brand+model+storage+condition model and sets this store's price; not in the other store", async () => {
  const sku = phoneModelSku("Samsung", "Galaxy A15", "128GB", "USED");
  expect(sku).toBe("PM-SAMSUNG-GALAXY-A15-128GB-USED");
  await service().execute(
    "s1",
    cmd("catalog.save", {
      store: "M01",
      id: "model-a15",
      kind: "phone",
      sku,
      name: "Samsung Galaxy A15",
      attributes: { brand: "Samsung", model: "Galaxy A15", storage: "128GB", condition: "USED" },
    }),
  );
  await service().execute(
    "s1",
    cmd("price.set", { store: "M01", itemId: "model-a15", amount: "25000.00" }),
  );
  expect(h.db.prepare("SELECT store_id,amount_minor FROM prices").all()).toEqual([
    { store_id: "M01", amount_minor: 2500000 },
  ]);
  await expect(
    service().execute(
      "s1",
      cmd("price.set", { store: "M02", itemId: "model-a15", amount: "26000.00" }),
    ),
  ).rejects.toThrow("FORBIDDEN");
  await expect(
    service().execute(
      "s1",
      cmd("catalog.save", {
        store: "M02",
        id: "model-other",
        kind: "phone",
        sku: "PM-X",
        name: "X",
        attributes: {},
      }),
    ),
  ).rejects.toThrow("FORBIDDEN");
});

it("demo: seller creates a model with this store's price inline; other store is refused; never asks cost", () => {
  setReviewActor("U-S01");
  const row = saveTestPhoneModel({
    store: "M01",
    brand: "Xiaomi",
    model: "Redmi 13",
    storage: "256GB",
    condition: "NEW",
    salePrice: "30000",
  });
  expect(row).toMatchObject({ brand: "Xiaomi", condition: "NEW", prices: { M01: "30000" } });
  expect(JSON.stringify(row)).not.toMatch(/cost/i);
  expect(() =>
    saveTestPhoneModel({
      store: "M02",
      brand: "Xiaomi",
      model: "Redmi 13",
      storage: "256GB",
      condition: "NEW",
      salePrice: "31000",
    }),
  ).toThrow("This operator cannot operate this store.");
  expect(getTestState().phoneModels?.[0]?.prices).toEqual({ M01: "30000" });
});

it.each([
  ["s1", false],
  ["m1", false],
  ["owner", true],
])("native blind count: %s sees OPEN-shift movements only if owner (%s)", async (user, sees) => {
  const ledger = (await service().cashLedger(user, { store: "M01", limit: 50, offset: 0 })) as {
    movements: { id: string }[];
  };
  const ids = ledger.movements.map((m) => m.id);
  expect(ids).toContain("mv-closed");
  expect(ids.includes("mv-open")).toBe(sees);
});

it.each([
  ["SELLER", false],
  ["MANAGER", false],
  ["SUPER_ADMIN", true],
])("demo blind count: %s sees OPEN-shift movements only if owner (%s)", (role, sees) => {
  const shifts = [
    { id: "open", status: "OPEN" },
    { id: "closed", status: "CLOSED" },
  ];
  const visible = visibleCashMovements(
    [
      { id: "a", shiftId: "open" },
      { id: "b", shiftId: "closed" },
    ],
    shifts,
    role,
  ).map((m) => m.id);
  expect(visible).toEqual(sees ? ["a", "b"] : ["b"]);
});
