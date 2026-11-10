// @vitest-environment node
import { it, expect } from "vitest";
import { Miniflare } from "miniflare";
import { readFileSync } from "node:fs";
import { sqliteMigrations } from "./sqlite-migrations";
import { createD1Port } from "@/backend/sqlite/d1-port";
import { planRetailCheckout } from "@/backend/sqlite/retail-checkout";
import { planNativeCommand } from "@/backend/sqlite/commands";
import { planStandaloneReceiving } from "@/backend/sqlite/standalone-receiving";
import { createNativeService } from "@/backend/sqlite/service";
const phone = "11111111-1111-4111-8111-111111111111",
  shift = "33333333-3333-4333-8333-333333333333";
it("isolated Miniflare/workerd D1 executes aggregate, replay, CHECK rollback and immutable close review", async () => {
  const mf = new Miniflare({
    modules: true,
    script: 'export default {fetch(){return new Response("isolated")}}',
    compatibilityDate: "2026-08-06",
    d1Databases: ["DB"],
  });
  try {
    const db = await mf.getD1Database("DB");
    const port = createD1Port(db);
    for (const file of sqliteMigrations) {
      // D1 exec requires individual complete statements; prepare/batch handles multiline triggers.
      const source = readFileSync(`db/sqlite/${file}`, "utf8").replace(/^--.*$/gm, "");
      const statements = source.match(/\s*CREATE TRIGGER[\s\S]*?END;|\s*[^;]+;/g) ?? [];
      await db.batch(statements.map((s) => db.prepare(s)));
    }
    await db.exec(
      `INSERT INTO accounts VALUES('owner',1),('s1',1),('s2',1); INSERT INTO memberships VALUES('owner','GLOBAL','SUPER_ADMIN'),('s1','M01','SELLER'),('s2','M01','SELLER'); INSERT INTO sessions SELECT id,id,9999999999999,0 FROM accounts; INSERT INTO drawers VALUES('d1','M01'); INSERT INTO shifts VALUES('${shift}','M01','d1','s1','OPEN',1000,NULL); INSERT INTO catalog VALUES('model','phone','PH','Phone','{}'); INSERT INTO prices VALUES('M01','model',10001); INSERT INTO phones(id,store_id,catalog_id,barcode,state,attributes_json,serial) VALUES('${phone}','M01','model','BAR','AVAILABLE','{}','SERIAL'); INSERT INTO phone_identifiers VALUES('490154203237518','${phone}',1);`,
    );
    const at = Date.parse("2026-01-30T23:30:00Z"),
      identity = { userId: "s2", sessionId: "s2", expiresAt: 9999999999999 };
    const service = createNativeService(
      port,
      { verify: async () => identity },
      { get: async () => null, put: async () => {} },
      () => at,
    );
    expect(
      (await service.posSearch("synthetic", { store: "M01", search: "490154203237518" })).items[0],
    ).toMatchObject({ id: phone, amountMinor: 10001, serial: "SERIAL" });
    expect(
      (await service.posSearch("synthetic", { store: "M01", search: "%" })).items,
    ).toHaveLength(0);
    const e = {
      contractVersion: "native-pos-2026-11-07",
      idempotencyKey: "d1-parity-key-000001",
      clientRequestId: "44444444-4444-4444-8444-444444444444",
      payload: {
        store: "M01",
        shiftId: shift,
        buyer: { surname: "D1", givenName: "Buyer", contact: "" },
        lines: [{ itemId: phone, kind: "phone", quantity: "1" }],
        warranties: [{ itemId: phone, requested: true, months: 12 }],
        tender: "Cash",
        tenderedAmount: "100.01",
      },
    };
    // Late failure inside real D1 batch: customer and stock must roll back.
    await db
      .prepare(
        "CREATE TRIGGER fail_snapshot BEFORE INSERT ON receipt_snapshots BEGIN SELECT RAISE(ABORT,'TEST_FAILURE'); END",
      )
      .run();
    await expect(
      port.batch(planRetailCheckout(e, identity, "a".repeat(64), "sale", at)),
    ).rejects.toThrow();
    expect(await db.prepare("SELECT count(*) n FROM customers").first("n")).toBe(0);
    expect(await db.prepare("SELECT state FROM phones").first("state")).toBe("AVAILABLE");
    await db.prepare("DROP TRIGGER fail_snapshot").run();
    await port.batch(planRetailCheckout(e, identity, "a".repeat(64), "sale", at));
    await port.batch(planRetailCheckout(e, identity, "a".repeat(64), "sale2", at));
    expect(await db.prepare("SELECT count(*) n FROM sales").first("n")).toBe(1);
    expect(await db.prepare("SELECT count(*) n FROM customer_details").first("n")).toBe(1);
    expect(await db.prepare("SELECT months FROM warranty_requests").first("months")).toBe(12);
    expect(await db.prepare("SELECT amount_minor FROM cash_movements").first("amount_minor")).toBe(
      10001,
    );
    await expect(
      port.batch(planRetailCheckout(e, identity, "b".repeat(64), "sale3", at)),
    ).rejects.toThrow();
    const close = planNativeCommand(
      {
        version: "native-2026-11-06",
        key: "d1-close-key-000001",
        operation: "cash.close",
        payload: { store: "M01", shiftId: shift, counted: "110.01" },
      },
      { ...identity, userId: "s1", sessionId: "s1" },
      "c".repeat(64),
      "close",
      at,
    );
    await port.batch(close);
    await expect(
      port.batch(
        planRetailCheckout(
          { ...e, idempotencyKey: "d1-parity-key-000002" },
          identity,
          "b".repeat(64),
          "afterclose",
          at,
        ),
      ),
    ).rejects.toThrow();
    await port.batch(
      planNativeCommand(
        {
          version: "native-2026-11-06",
          key: "d1-review-key-000001",
          operation: "cash.review",
          payload: { store: "M01", shiftId: shift, outcome: "NO_ISSUE", note: "Count verified" },
        },
        { ...identity, userId: "owner", sessionId: "owner" },
        "d".repeat(64),
        "review",
        at,
      ),
    );
    expect(
      await db.prepare("SELECT expected_minor FROM shift_closures").first("expected_minor"),
    ).toBe(11001);
    expect(await db.prepare("SELECT outcome FROM shift_reviews").first("outcome")).toBe("NO_ISSUE");
    await db.exec(
      "INSERT INTO catalog VALUES('acc','accessory','AC-CODE','Accessory','{}'); INSERT INTO suppliers(id,store_id,name,reference) VALUES('A','M01','Supplier A','REF-A'),('B','M01','Supplier B','REF-B');",
    );
    const receipt = {
      key: "d1-receiving-key-0001",
      store: "M01",
      itemId: "acc",
      quantity: 2,
      supplierId: "A",
    };
    await port.batch(planStandaloneReceiving(receipt, identity, "e".repeat(64), "r1", at));
    await port.batch(
      planStandaloneReceiving(
        { ...receipt, key: "d1-receiving-key-0002", supplierId: "B", quantity: 3 },
        identity,
        "f".repeat(64),
        "r2",
        at,
      ),
    );
    expect(
      await db
        .prepare("SELECT quantity FROM accessory_balances WHERE item_id='acc'")
        .first("quantity"),
    ).toBe(5);
    expect(
      (await db.prepare("SELECT supplier_id FROM standalone_receipts ORDER BY id").all()).results,
    ).toEqual([{ supplier_id: "A" }, { supplier_id: "B" }]);
    expect(
      (await service.posSearch("synthetic", { store: "M01", search: "AC-CODE" })).items[0],
    ).toMatchObject({ id: "acc", quantity: 5, amountMinor: null });
    await db.prepare("UPDATE sessions SET revoked=1 WHERE id='s2'").run();
    await expect(service.posSearch("synthetic", { store: "M01" })).rejects.toThrow("FORBIDDEN");
    expect(await db.prepare("PRAGMA foreign_key_check").all()).toMatchObject({ results: [] });
  } finally {
    await mf.dispose();
  }
}, 60000);
