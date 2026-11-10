import { beforeEach, afterEach, expect, it } from "vitest";
import { sqliteHarness } from "./sqlite-harness";
import { createNativeService } from "@/backend/sqlite/service";
import { permits, rolesForOperation, canApproveTransfer } from "@/domain/permissions";
import {
  resetTestWorkspace,
  saveReviewStaff,
  workspaceIdentities,
  getTestState,
  setReviewActor,
  openTestShift,
  recordTestSale,
  addTestCashMovement,
  receiveTestAccessory,
  commitTest,
} from "@/data/test-workspace";
import { reviewIdentities } from "@/domain/review-staff";
let h: ReturnType<typeof sqliteHarness>;
beforeEach(() => {
  resetTestWorkspace();
  h = sqliteHarness();
  h.db.exec(
    "INSERT INTO accounts VALUES('owner',1),('m1',1),('s2',1); INSERT INTO memberships VALUES('owner','GLOBAL','SUPER_ADMIN'),('m1','M01','MANAGER'),('s2','M02','SELLER'); INSERT INTO sessions SELECT id,id,2000,0 FROM accounts; INSERT INTO drawers VALUES('d1','M01'),('d2','M02'); INSERT INTO catalog VALUES('a','accessory','ACC','Cable','{}'); INSERT INTO prices VALUES('M02','a',100); INSERT INTO accessory_balances VALUES('M02','a',3);",
  );
});
afterEach(() => h.db.close());
const service = () =>
  createNativeService(
    h.port,
    { verify: async (userId) => ({ userId, sessionId: userId, expiresAt: 2000 }) },
    { get: async () => null, put: async () => {} },
    () => 1000,
  );
const command = (
  operation: string,
  payload: unknown,
  key = `permissions-${crypto.randomUUID()}`,
) => ({ version: "native-2026-11-06", key, operation, payload });
it("2026-11-09 matrix grants identical store-scoped roles and preserves owner/global and M02 transfer exception", () => {
  for (const store of ["M01", "M02"]) {
    for (const op of [
      "pos.checkout",
      "stock.standalone",
      "cash.close",
      "catalog.save",
      "price.set",
      "sav.event",
    ])
      expect(permits("SELLER", store, store, op)).toBe(true);
    expect(permits("MANAGER", store, store, "purchase.save")).toBe(true);
    expect(permits("SELLER", store, store, "purchase.save")).toBe(false);
    expect(permits("SELLER", store, store, "purchase.finance")).toBe(false);
    expect(permits("MANAGER", store, store, "purchase.finance")).toBe(false);
    expect(permits("SUPER_ADMIN", "GLOBAL", store, "purchase.finance")).toBe(true);
  }
  expect(rolesForOperation("cash.evidence")).toEqual(["SUPER_ADMIN", "MANAGER"]);
  expect(canApproveTransfer("M02_MANAGER", "MANAGER", "M01")).toBe(false);
  expect(canApproveTransfer("M02_MANAGER", "MANAGER", "M02")).toBe(true);
});
it("M01 MANAGER saves supplier/purchase/model/price/evidence and reads manager metadata only in M01", async () => {
  const s = service();
  await s.execute(
    "m1",
    command("supplier.save", { store: "M01", id: "sup", name: "Source", reference: "SRC" }),
  );
  await s.execute(
    "m1",
    command("catalog.save", {
      store: "M01",
      id: "model",
      kind: "phone",
      sku: "MODEL",
      name: "Model",
      attributes: {},
    }),
  );
  await s.execute("m1", command("price.set", { store: "M01", itemId: "model", amount: "10.01" }));
  await s.execute(
    "m1",
    command("purchase.save", {
      store: "M01",
      id: "p",
      supplierId: "sup",
      itemId: "model",
      quantity: 1,
      evidence: "Draft",
    }),
  );
  await s.execute(
    "m1",
    command("cash.open", { store: "M01", id: "sh1", drawerId: "d1", opening: "0" }),
  );
  await s.execute(
    "m1",
    command("cash.evidence", {
      store: "M01",
      shiftId: "sh1",
      direction: "IN",
      amount: "1",
      reference: "Evidence",
    }),
  );
  for (const module of ["purchases", "suppliers", "expenses", "audit"] as const) {
    const rows = await s.read("m1", module, "M01");
    expect(JSON.stringify(rows)).not.toMatch(/cost_minor|payload_json|before_json/);
    await expect(s.read("m1", module, "M02")).rejects.toThrow("FORBIDDEN");
  }
  await expect(
    s.execute("m1", command("price.set", { store: "M02", itemId: "a", amount: "2" })),
  ).rejects.toThrow("FORBIDDEN");
  await expect(s.ownerFinance("m1", "M01")).rejects.toThrow("FORBIDDEN");
});
it("M02 SELLER receives and sells in M02 but cannot perform manager operations, read costs or act in M01", async () => {
  h.db.exec(
    "INSERT INTO catalog VALUES('22222222-2222-4222-8222-222222222222','accessory','NEW-ACC','Cable','{}'); INSERT INTO prices VALUES('M02','22222222-2222-4222-8222-222222222222',100); INSERT INTO accessory_balances VALUES('M02','22222222-2222-4222-8222-222222222222',3)",
  );
  const s = service();
  await s.receive("s2", {
    key: "permission-receive-001",
    store: "M02",
    itemId: "22222222-2222-4222-8222-222222222222",
    quantity: 2,
  });
  await s.execute(
    "s2",
    command("cash.open", {
      store: "M02",
      id: "55555555-5555-4555-8555-555555555555",
      drawerId: "d2",
      opening: "0",
    }),
  );
  await s.checkout("s2", {
    contractVersion: "native-pos-2026-11-07",
    idempotencyKey: "permission-sale-0001",
    clientRequestId: "44444444-4444-4444-8444-444444444444",
    payload: {
      store: "M02",
      shiftId: "55555555-5555-4555-8555-555555555555",
      lines: [{ kind: "accessory", itemId: "22222222-2222-4222-8222-222222222222", quantity: "1" }],
      warranties: [],
      tender: "Cash",
      tenderedAmount: "1.00",
    },
  });
  expect(
    h.db
      .prepare(
        "SELECT quantity FROM accessory_balances WHERE store_id='M02' AND item_id='22222222-2222-4222-8222-222222222222'",
      )
      .get()?.["quantity"],
  ).toBe(4);
  for (const [op, payload] of [
    ["supplier.save", { id: "sup", name: "Supplier", reference: "REF" }],
    [
      "cash.evidence",
      {
        shiftId: "55555555-5555-4555-8555-555555555555",
        direction: "IN",
        amount: "1",
        reference: "Evidence",
      },
    ],
    ["purchase.finance", { purchaseId: "p", cost: "1", obligation: null }],
  ] as const)
    await expect(s.execute("s2", command(op, { store: "M02", ...payload }))).rejects.toThrow(
      "FORBIDDEN",
    );
  await expect(s.read("s2", "purchases", "M02")).rejects.toThrow("FORBIDDEN");
  await expect(s.ownerFinance("s2", "M02")).rejects.toThrow("FORBIDDEN");
  await expect(
    s.receive("s2", {
      key: "permission-cross-001",
      store: "M01",
      itemId: "22222222-2222-4222-8222-222222222222",
      quantity: 1,
    }),
  ).rejects.toThrow("FORBIDDEN");
});
it("owner provisions unlimited staff of either role/store, replacement revokes sessions and cannot target owner/self", async () => {
  const s = service();
  for (let n = 0; n < 6; n++)
    await s.execute(
      "owner",
      command("account.provision", {
        store: "M01",
        userId: `new${n}`,
        role: n % 2 ? "MANAGER" : "SELLER",
        targetStore: n < 3 ? "M01" : "M02",
      }),
    );
  h.db.exec("INSERT INTO sessions VALUES('changed','new0',2000,0)");
  await s.execute(
    "owner",
    command("role.replace", { store: "M01", userId: "new0", role: "SELLER", targetStore: "M02" }),
  );
  expect(h.db.prepare("SELECT revoked FROM sessions WHERE id='changed'").get()?.["revoked"]).toBe(
    1,
  );
  expect(h.db.prepare("SELECT store_id,role FROM memberships WHERE user_id='new0'").get()).toEqual({
    store_id: "M02",
    role: "SELLER",
  });
  await expect(
    s.execute(
      "owner",
      command("role.replace", {
        store: "M01",
        userId: "owner",
        role: "SELLER",
        targetStore: "M01",
      }),
    ),
  ).rejects.toThrow();
});
it("local owner explicitly activates retired M01 manager/M02 seller without changing fixtures or historical rows; overrides survive readback", () => {
  const before = structuredClone(getTestState());
  const fixtures = structuredClone(reviewIdentities);
  saveReviewStaff({ id: "U-M01", name: "unused", role: "MANAGER", store: "M01" });
  saveReviewStaff({ id: "U-S02", name: "unused", role: "SELLER", store: "M02" });
  const persisted = structuredClone(getTestState());
  commitTest(persisted);
  expect(getTestState().sales).toEqual(before.sales);
  expect(reviewIdentities).toEqual(fixtures);
  expect(workspaceIdentities().find((u) => u.id === "U-M01")?.active).toBe(true);
  setReviewActor("U-S02");
  openTestShift("M02", "Test seller 002", "0");
  receiveTestAccessory({
    store: "M02",
    name: "Case",
    sku: "AC-005",
    quantity: "1",
    category: "Cases",
    variant: "v",
    compatibility: "c",
    barcode: "AC000005",
    reference: "Intake",
    remarks: "",
  });
  expect(
    recordTestSale({
      key: "flexible-local-sale",
      store: "M02",
      lines: [{ id: "AC-005", quantity: 1 }],
      customerId: "WALK-IN",
      customerName: "Walk-in",
      tender: "Cash",
      paid: "1500",
    }).operatorId,
  ).toBe("U-S02");
  expect(() => addTestCashMovement("M02", "CASH_IN", "1", "cash")).toThrow(/store/);
  expect(() => saveReviewStaff({ name: "Denied", role: "MANAGER", store: "M02" })).toThrow(/Owner/);
});
