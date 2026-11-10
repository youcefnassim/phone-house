// @vitest-environment node
import { expect, it } from "vitest";
import { localD1AdapterHarness } from "./local-d1-adapter-harness";
import { provenanceResult } from "@/domain/native-provenance";

it("owner provenance HTTP history has concrete pagination, immutable original and appended corrections; staff/revoked owner denied", async () => {
  const h = await localD1AdapterHarness();
  try {
    await h.db.exec("INSERT INTO catalog VALUES('acc','accessory','SKU','Cable','{}');");
    const owner = (await h.repository("owner")).repository;
    const seller = (await h.repository("s1")).repository;
    await seller.receive({
      key: "sources-http-rcv001",
      store: "M01",
      itemId: "acc",
      quantity: 2,
      newSupplierName: "Source A",
    });
    await seller.receive({
      key: "sources-http-rcv002",
      store: "M01",
      itemId: "acc",
      quantity: 1,
      newSupplierName: "Source B",
    });
    const all = await owner.supplierHistory({ store: "M01" });
    expect(all.receipts).toHaveLength(2);
    const receipt = all.receipts.find((r) => r.quantity === 2);
    const supplier = (await seller.supplierLookup("M01")).find((s) => s.name === "Source B");
    if (!receipt || !supplier) throw new Error("SOURCE_MISSING");
    const original = receipt.originalSupplierId;
    const correction = {
      key: "sources-http-fix001",
      store: "M01",
      receiptId: receipt.id,
      supplierId: supplier.id,
      reason: "Owner verified actual supplier",
    };
    await owner.correctStandaloneSupplier(correction);
    await owner.correctStandaloneSupplier(correction);
    const after = (await owner.supplierHistory({ store: "M01" })).receipts.find(
      (r) => r.id === receipt.id,
    );
    expect(after).toMatchObject({
      originalSupplierId: original,
      effectiveSupplierId: supplier.id,
      reviews: [
        {
          actorId: "owner",
          oldSupplierId: original,
          newSupplierId: supplier.id,
          reason: correction.reason,
        },
      ],
    });
    expect(after?.reviews).toHaveLength(1);
    const page = await owner.supplierHistory({ store: "M01", limit: 1, offset: 0 });
    expect(page.receipts).toHaveLength(1);
    expect(page.hasMore).toBe(true);
    expect(
      (await owner.supplierHistory({ store: "M01", limit: 1, offset: 1 })).receipts[0]?.id,
    ).not.toBe(page.receipts[0]?.id);
    expect(JSON.stringify(after)).not.toMatch(/cost|margin|profit|object_key/i);
    await expect(seller.supplierHistory({ store: "M01" })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(
      seller.correctStandaloneSupplier({ ...correction, key: "sources-http-denied" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await h.db.prepare("SELECT count(*) n FROM standalone_source_reviews").first("n")).toBe(
      1,
    );
    await h.db.prepare("UPDATE sessions SET revoked=1 WHERE id='owner'").run();
    await expect(owner.supplierHistory({ store: "M01" })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  } finally {
    await h.dispose();
  }
}, 60000);

it("native provenance DTO rejects finance fields instead of accepting cost-bearing row casts", () => {
  expect(
    provenanceResult.safeParse({
      source: "SERVER",
      store: "M01",
      hasMore: false,
      receipts: [
        {
          id: "r",
          kind: "STANDALONE",
          itemId: "sku",
          quantity: 1,
          receivedAt: 1,
          actorId: "s1",
          reference: null,
          originalSupplierId: null,
          effectiveSupplierId: null,
          originalSupplierName: null,
          reviews: [],
          costMinor: 100,
        },
      ],
    }).success,
  ).toBe(false);
});
