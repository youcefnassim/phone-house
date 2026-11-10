// @vitest-environment node
import { it, expect } from "vitest";
import { createHash } from "node:crypto";
import { localD1AdapterHarness } from "./local-d1-adapter-harness";
import { nativeRouteModules } from "@/domain/native-repository";
import { gateNativeTransport } from "@/data/native-activation";
import { createNativeRepository } from "@/data/native-repository";
import { permits, routeOperation } from "@/domain/permissions";

const accessory = "11111111-1111-4111-8111-111111111111";
const phone = "22222222-2222-4222-8222-222222222222";
const shift = "33333333-3333-4333-8333-333333333333";

it("all registered page reads pass through the frontend HTTP adapter to signed Worker and isolated D1", async () => {
  const h = await localD1AdapterHarness();
  try {
    const { repository: owner } = await h.repository("owner");
    for (const route of Object.keys(nativeRouteModules) as (keyof typeof nativeRouteModules)[]) {
      const result = await owner.read(route, "M01", { limit: 25, offset: 0 });
      expect(result.state, route).toBe("READY");
      if (result.state === "READY")
        expect(result.projection.page).toEqual({ limit: 25, offset: 0, hasMore: false });
    }
    const { repository: manager } = await h.repository("m2");
    for (const route of Object.keys(nativeRouteModules) as (keyof typeof nativeRouteModules)[]) {
      const result = await manager.read(route, "M02", { limit: 25, offset: 0 });
      expect(result.state, route).toBe(
        permits("MANAGER", "M02", "M02", routeOperation(route)) ? "READY" : "FORBIDDEN",
      );
    }
    const { repository: seller } = await h.repository("s1");
    expect((await seller.read("/users", "M01")).state).toBe("FORBIDDEN");
    expect((await seller.read("/settings", "M02")).state).toBe("FORBIDDEN");
    expect((await seller.finance("M01")).state).toBe("FORBIDDEN");
    await h.db.prepare("UPDATE sessions SET revoked=1 WHERE id='s1'").run();
    expect((await seller.read("/settings", "M01")).state).toBe("UNAUTHORIZED");
    expect(h.calls).toContain("/api/native/read");
  } finally {
    await h.dispose();
  }
}, 60000);

it("receiving → typed stock → atomic phone buyer/warranty → immutable specimen and cash readback with no reprint mutation", async () => {
  const h = await localD1AdapterHarness();
  try {
    await h.db.exec(
      `INSERT INTO catalog VALUES('${accessory}','accessory','CABLE','Cable','{}'),('model','phone','MODEL','Phone','{}'); INSERT INTO prices VALUES('M01','${accessory}',500),('M01','model',10000); INSERT INTO drawers VALUES('drawer','M01'); INSERT INTO shifts VALUES('${shift}','M01','drawer','s1','OPEN',0,NULL);`,
    );
    const { repository } = await h.repository("s1");
    const receive = {
      key: "adapter-receive-000001",
      store: "M01",
      itemId: "model",
      quantity: 1,
      newSupplierName: "Supplier A",
      phones: [{ id: phone, imei1: "490154203237518", barcode: "UNIT-1" }],
    };
    const first = await repository.receive(receive);
    expect(await repository.receive(receive)).toEqual(first);
    expect((await repository.supplierLookup("M01"))[0]?.name).toBe("Supplier A");
    expect(
      (await repository.posSearch({ store: "M01", search: "490154203237518" })).items[0]?.id,
    ).toBe(phone);
    const checkout = {
      contractVersion: "native-pos-2026-11-07",
      idempotencyKey: "adapter-checkout-000001",
      clientRequestId: "44444444-4444-4444-8444-444444444444",
      payload: {
        store: "M01",
        shiftId: shift,
        buyer: { surname: "Synthetic", givenName: "Buyer", contact: "" },
        lines: [{ itemId: phone, kind: "phone", quantity: "1" }],
        warranties: [{ itemId: phone, requested: true, months: 3 }],
        tender: "Cash",
        tenderedAmount: "100.00",
      },
    };
    const result = await repository.checkout(checkout);
    if (!("saleId" in result) || typeof result.saleId !== "string") throw new Error("sale missing");
    const snapshot = await repository.receipt({ store: "M01", id: result.saleId });
    expect(snapshot.buyer?.surname).toBe("Synthetic");
    expect(snapshot.warranties[0]?.months).toBe(3);
    expect(snapshot.specimen).toBe(1);
    expect(snapshot.lines[0]?.imei1).toBe("490154203237518");
    expect(await repository.checkout(checkout)).toEqual(result);
    expect(await repository.checkoutOutcome(checkout.idempotencyKey)).toEqual(result);
    expect(await repository.receipt({ store: "M01", id: result.saleId })).toEqual(snapshot);
    expect(await h.db.prepare("SELECT count(*) n FROM sales").first("n")).toBe(1);
    expect(await h.db.prepare("SELECT sum(amount_minor) n FROM cash_movements").first("n")).toBe(
      10000,
    );
    expect(
      (await repository.customerSearch({ store: "M01", search: "Synthetic" })).customers,
    ).toHaveLength(1);
    expect((await repository.salesHistory({ store: "M01" })).sales).toHaveLength(1);
    expect((await repository.cashLedger({ store: "M01" })).store).toBe("M01");
    await expect(
      repository.checkout({ ...checkout, idempotencyKey: "adapter-checkout-000002" }),
    ).rejects.toMatchObject({ code: "PHONE_NOT_AVAILABLE" });
    await expect(repository.receive({ ...receive, quantity: 2 })).rejects.toMatchObject({
      code: "IDEMPOTENCY_CONFLICT",
      key: receive.key,
    });
    expect(await h.db.prepare("SELECT count(*) n FROM customers").first("n")).toBe(1);
  } finally {
    await h.dispose();
  }
}, 60000);

it("activation denies each missing prerequisite and revoked identity without any local fallback", async () => {
  const h = await localD1AdapterHarness();
  try {
    const { transport } = await h.repository("owner");
    const evidence = {
      ownerApproved: true,
      environmentVerified: true,
      schemaVerified: true,
      providerConfigured: true,
    };
    for (const key of Object.keys(evidence) as (keyof typeof evidence)[]) {
      const gated = createNativeRepository(
        gateNativeTransport(transport, { ...evidence, [key]: false }),
      );
      expect((await gated.read("/settings", "M01")).state).toBe("NOT_CONNECTED");
    }
    const gated = createNativeRepository(gateNativeTransport(transport, evidence));
    expect((await gated.read("/settings", "M01")).state).toBe("READY");
    await h.db.prepare("UPDATE accounts SET active=0 WHERE id='owner'").run();
    expect((await gated.read("/settings", "M01")).state).toBe("NOT_CONNECTED");
  } finally {
    await h.dispose();
  }
}, 60000);

it("M02 manager receives and sells anonymous accessories by bank without cash or customer writes", async () => {
  const h = await localD1AdapterHarness();
  try {
    await h.db.exec(
      `INSERT INTO catalog VALUES('${accessory}','accessory','CABLE','Cable','{}'); INSERT INTO prices VALUES('M02','${accessory}',500); INSERT INTO drawers VALUES('m2-drawer','M02'); INSERT INTO shifts VALUES('${shift}','M02','m2-drawer','m2','OPEN',0,NULL);`,
    );
    const { repository } = await h.repository("m2");
    await repository.receive({
      key: "m2-receiving-key-000001",
      store: "M02",
      itemId: accessory,
      quantity: 2,
    });
    const result = await repository.checkout({
      contractVersion: "native-pos-2026-11-07",
      idempotencyKey: "m2-sale-key-00000001",
      clientRequestId: "44444444-4444-4444-8444-444444444444",
      payload: {
        store: "M02",
        shiftId: shift,
        lines: [{ itemId: accessory, kind: "accessory", quantity: "2" }],
        warranties: [],
        tender: "Bank",
        tenderedAmount: "10.00",
        bankReference: "SYNTHETIC-BANK",
      },
    });
    if (!("saleId" in result) || typeof result.saleId !== "string") throw new Error("sale missing");
    const specimen = await repository.receipt({ id: result.saleId, store: "M02" });
    expect(specimen.buyer).toBeNull();
    expect(specimen.warranties).toEqual([]);
    expect(specimen.payment).toBe("Bank");
    expect(await h.db.prepare("SELECT count(*) n FROM customers").first("n")).toBe(0);
    expect(await h.db.prepare("SELECT count(*) n FROM cash_movements").first("n")).toBe(0);
    expect(
      await h.db
        .prepare("SELECT quantity FROM accessory_balances WHERE store_id='M02'")
        .first("quantity"),
    ).toBe(0);
  } finally {
    await h.dispose();
  }
}, 60000);

it("additive legacy supplier migration retains exact history checksum; logical export restores to a fresh local D1 only", async () => {
  const h = await localD1AdapterHarness();
  try {
    await h.migrate(
      h.restore,
      h.files.filter((f) => !f.startsWith("0008")),
    );
    await h.restore.exec(
      "INSERT INTO suppliers(id,store_id,name,reference) VALUES('legacy','M01','Legacy actual name','ORIGINAL');",
    );
    const digest = (value: unknown) =>
      createHash("sha256").update(JSON.stringify(value)).digest("hex");
    const before = (
      await h.restore.prepare("SELECT id,store_id,name,reference FROM suppliers ORDER BY id").all()
    ).results;
    await h.migrate(h.restore, ["0008_supplier_name_keys.sql"]);
    const after = (
      await h.restore.prepare("SELECT id,store_id,name,reference FROM suppliers ORDER BY id").all()
    ).results;
    expect(digest(after)).toBe(digest(before));
    expect(
      await h.restore.prepare("SELECT name_key FROM suppliers WHERE id='legacy'").first("name_key"),
    ).toBeNull();
    // Scoped logical supplier snapshot, not a complete/hosted D1 backup utility.
    const exported = JSON.parse(JSON.stringify(after)) as {
      id: string;
      store_id: string;
      name: string;
      reference: string;
    }[];
    await h.db.batch(
      exported.map((r) =>
        h.db
          .prepare("INSERT INTO suppliers(id,store_id,name,reference) VALUES(?,?,?,?)")
          .bind(r.id, r.store_id, r.name, r.reference),
      ),
    );
    const restored = (
      await h.db.prepare("SELECT id,store_id,name,reference FROM suppliers ORDER BY id").all()
    ).results;
    expect(digest(restored)).toBe(digest(before));
    expect((await h.db.prepare("PRAGMA foreign_key_check").all()).results).toEqual([]);
  } finally {
    await h.dispose();
  }
}, 60000);
