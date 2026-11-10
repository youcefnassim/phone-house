import { it, expect } from "vitest";
import { sqliteHarness } from "./sqlite-harness";
import { createSupplierProvenanceService } from "@/backend/sqlite/supplier-provenance";
it("native receipt FK and immutable source with owner-only idempotent reviews", async () => {
  const h = sqliteHarness();
  try {
    h.db.exec(
      `INSERT INTO accounts VALUES('owner',1),('seller',1);INSERT INTO memberships VALUES('owner','GLOBAL','SUPER_ADMIN'),('seller','M01','SELLER');INSERT INTO sessions VALUES('owner','owner',2000,0),('seller','seller',2000,0);INSERT INTO suppliers(id,store_id,name,reference) VALUES('A','M01','Supplier A','REF-A'),('B','M02','Supplier B','REF-B');INSERT INTO catalog VALUES('item','phone','sku','Phone','{}');INSERT INTO phones(id,store_id,catalog_id,barcode,state,attributes_json,serial) VALUES('p','M01','item','unit','AVAILABLE','{}','SERIAL');INSERT INTO receipt_sources VALUES('r','M01','p',NULL,'A',1,1000,'seller','DELIVERY');`,
    );
    expect(() =>
      h.db.exec(
        "INSERT INTO receipt_sources VALUES('bad','M02','p',NULL,'A',1,1000,'seller',NULL)",
      ),
    ).toThrow(/SOURCE_SCOPE/);
    expect(() => h.db.exec("UPDATE receipt_sources SET supplier_id='B'")).toThrow(/APPEND_ONLY/);
    const svc = createSupplierProvenanceService(
      h.port,
      { verify: async (t) => ({ userId: t, sessionId: t, expiresAt: 2000 }) },
      () => 1000,
    );
    await expect(svc.read("seller", "M01")).rejects.toThrow(/FORBIDDEN/);
    await expect(
      svc.correct("owner", {
        key: "source-cross-store-001",
        store: "M01",
        sourceId: "r",
        supplierId: "B",
        reason: "Wrong store",
      }),
    ).rejects.toThrow();
    h.db.exec(
      "INSERT INTO suppliers(id,store_id,name,reference) VALUES('C','M01','Supplier C','REF-C')",
    );
    const v = {
      key: "source-correction-001",
      store: "M01",
      sourceId: "r",
      supplierId: "C",
      reason: "Owner verified source",
    };
    await expect(svc.correct("seller", v)).rejects.toThrow(/FORBIDDEN/);
    await svc.correct("owner", v);
    await svc.correct("owner", v);
    expect(h.db.prepare("SELECT * FROM supplier_source_reviews").all()).toHaveLength(1);
    expect(h.db.prepare("SELECT supplier_id FROM receipt_sources").get()).toMatchObject({
      supplier_id: "A",
    });
    await expect(
      svc.correct("owner", { ...v, key: "source-correction-002", store: "M02" }),
    ).rejects.toThrow();
    await expect(
      svc.correct("owner", { ...v, key: "source-correction-003", supplierId: "missing" }),
    ).rejects.toThrow();
    const read = await svc.read("owner", "M01");
    expect(JSON.stringify(read)).not.toMatch(/cost_minor|obligation_minor|margin/);
  } finally {
    h.db.close();
  }
});
