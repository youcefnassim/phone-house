// Real node:sqlite engine under the project's standard test environment.
import type { DatabaseSync as SqliteDatabase } from "node:sqlite";
import { beforeEach, describe, it, expect } from "vitest";
import { fromCentimes, planCheckout, toCentimes } from "@/backend/sqlite/checkout";
import { createNativeService, nativeModules } from "@/backend/sqlite/service";
import type { AtomicSqlPort, SqlStatement } from "@/backend/sqlite/port";
import { sqliteMigrations } from "./sqlite-migrations";
// Test-only native modules; keep them out of Vite's browser bundling graph.
const requireNative = process
  .getBuiltinModule("module")
  .createRequire(`${process.cwd()}/package.json`);
const { DatabaseSync } = requireNative("node:sqlite") as typeof import("node:sqlite");
const { readFileSync } = requireNative("node:fs") as typeof import("node:fs");
let db: SqliteDatabase;
const phone = "11111111-1111-4111-8111-111111111111",
  accessory = "22222222-2222-4222-8222-222222222222",
  shift = "33333333-3333-4333-8333-333333333333";
const identity = { userId: "seller", sessionId: "seller", expiresAt: 2000 },
  key = "checkout-key-00000001";
function envelope(
  kind: "phone" | "accessory" = "phone",
  quantity = "1",
  tenderedAmount = "100000.25",
  idempotencyKey = key,
) {
  return {
    contractVersion: "2026-11-review08",
    idempotencyKey,
    clientRequestId: "44444444-4444-4444-8444-444444444444",
    payload: {
      store: "M01",
      shiftId: shift,
      customerId: "55555555-5555-4555-8555-555555555555",
      lines: [{ itemId: kind === "phone" ? phone : accessory, kind, quantity }],
      tender: "Cash",
      tenderedAmount,
    },
  };
}
function run(plan: SqlStatement[]) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const results = plan.map((s) => {
      const statement = db.prepare(s.sql);
      if (s.sql.startsWith("SELECT"))
        return { rows: statement.all(...s.params) as Record<string, unknown>[], changes: 0 };
      const r = statement.run(...s.params);
      return { rows: [], changes: Number(r.changes) };
    });
    db.exec("COMMIT");
    return results;
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}
const count = (table: string) => Number(db.prepare(`SELECT count(*) n FROM ${table}`).get()?.["n"]);
beforeEach(() => {
  db?.close();
  db = new DatabaseSync(":memory:");
  for (const file of sqliteMigrations) db.exec(readFileSync(`db/sqlite/${file}`, "utf8"));
  db.exec(`
INSERT INTO accounts VALUES('seller',1),('seller2',1),('manager',1),('owner',1);
INSERT INTO sessions SELECT id,id,2000,0 FROM accounts;
INSERT INTO memberships VALUES('seller','M01','SELLER'),('seller2','M01','SELLER'),('manager','M01','MANAGER'),('owner','GLOBAL','SUPER_ADMIN');
INSERT INTO customers VALUES('55555555-5555-4555-8555-555555555555','M01','TEST BUYER','TEST-BUYER');
INSERT INTO drawers VALUES('drawer','M01');
INSERT INTO shifts VALUES('${shift}','M01','drawer','seller','OPEN',5000,NULL);
INSERT INTO catalog VALUES('model','phone','TEST-PH','Synthetic model','{}'),('${accessory}','accessory','TEST-AC','Synthetic accessory','{}');
INSERT INTO prices VALUES('M01','model',10000025),('M01','${accessory}',10025);
INSERT INTO phones(id,store_id,catalog_id,barcode,state,attributes_json) VALUES('${phone}','M01','model','TEST-BAR','AVAILABLE','{}');
INSERT INTO phone_identifiers VALUES('000000000000001','${phone}',1);
INSERT INTO accessory_balances VALUES('M01','${accessory}',2);
`);
});
describe("Local SQLite native-target transaction evidence (not D1 acceptance)", () => {
  it("rejects missing and other-store phone buyer before any durable sale", () => {
    const e = envelope();
    const { customerId, ...payload } = e.payload;
    expect(() => planCheckout({ ...e, payload }, identity, "a".repeat(64), "x", 1000)).toThrow(
      "PHONE_CUSTOMER_REQUIRED",
    );
    db.exec(`UPDATE customers SET store_id='M02' WHERE id='${customerId}'`);
    expect(() => run(planCheckout(e, identity, "a".repeat(64), "x", 1000))).toThrow();
    expect(count("sales")).toBe(0);
    expect(count("commands")).toBe(0);
  });
  it("requires trusted session and rejects revocation", () => {
    expect(() =>
      planCheckout(envelope(), { userId: "seller", expiresAt: 2000 }, "a".repeat(64), "x", 1000),
    ).toThrow("SESSION_REQUIRED");
    db.exec("UPDATE sessions SET revoked=1 WHERE id='seller'");
    expect(() => run(planCheckout(envelope(), identity, "a".repeat(64), "x", 1000))).toThrow();
    expect(count("sales")).toBe(0);
  });
  it("second M01 seller uses same open drawer with distinct actor attribution", () => {
    run(
      planCheckout(
        envelope(),
        { ...identity, userId: "seller2", sessionId: "seller2" },
        "a".repeat(64),
        "s2",
        1000,
      ),
    );
    expect(db.prepare("SELECT seller_id,shift_id FROM sales").get()).toEqual({
      seller_id: "seller2",
      shift_id: shift,
    });
    expect(count("shifts")).toBe(1);
  });
  it("M02 manager performs POS while M01 manager remains forbidden", () => {
    db.exec(
      "UPDATE memberships SET store_id='M02' WHERE user_id='manager';INSERT INTO drawers VALUES('drawer2','M02');",
    );
    db.prepare("INSERT INTO shifts VALUES(?,'M02','drawer2','manager','OPEN',0,NULL)").run(
      "66666666-6666-4666-8666-666666666666",
    );
    db.exec(
      "UPDATE phones SET store_id='M02';UPDATE customers SET store_id='M02';INSERT INTO prices VALUES('M02','model',10000025)",
    );
    const e = envelope();
    run(
      planCheckout(
        {
          ...e,
          payload: { ...e.payload, store: "M02", shiftId: "66666666-6666-4666-8666-666666666666" },
        },
        { userId: "manager", sessionId: "manager", expiresAt: 2000 },
        "a".repeat(64),
        "m2",
        1000,
      ),
    );
    expect(db.prepare("SELECT seller_id,store_id FROM sales").get()).toEqual({
      seller_id: "manager",
      store_id: "M02",
    });
  });
  it("preserves exact integer centimes without rounding", () => {
    expect(toCentimes("100000.25")).toBe(10000025);
    expect(fromCentimes(10000025)).toBe("100000.25");
    expect(() => toCentimes("1.001")).toThrow();
    expect(() => toCentimes("1000000000000")).toThrow();
  });
  it("atomically records stock, seller, payment, cash, balanced journal and audit", () => {
    run(planCheckout(envelope(), identity, "a".repeat(64), "sale1", 1000));
    expect(db.prepare("SELECT state FROM phones").get()?.["state"]).toBe("SOLD");
    expect(db.prepare("SELECT seller_id,total_minor,change_minor FROM sales").get()).toEqual({
      seller_id: "seller",
      total_minor: 10000025,
      change_minor: 0,
    });
    expect(count("payments")).toBe(1);
    expect(count("cash_movements")).toBe(1);
    expect(count("audit_events")).toBe(1);
    expect(db.prepare("SELECT sum(debit_minor-credit_minor) n FROM journals").get()?.["n"]).toBe(0);
  });
  it("replays same key exactly once after response loss", () => {
    run(planCheckout(envelope(), identity, "a".repeat(64), "sale1", 1000));
    const r = run(planCheckout(envelope(), identity, "a".repeat(64), "sale2", 1000));
    expect(r.at(-1)?.rows[0]?.["transaction_id"]).toBe("sale1");
    expect(count("sales")).toBe(1);
    expect(count("stock_movements")).toBe(1);
  });
  it("rejects key reuse with changed content without writes", () => {
    run(planCheckout(envelope(), identity, "a".repeat(64), "sale1", 1000));
    expect(() => run(planCheckout(envelope(), identity, "b".repeat(64), "sale2", 1000))).toThrow();
    expect(count("sales")).toBe(1);
  });
  it("competing serialized sale cannot oversell", () => {
    run(planCheckout(envelope(), identity, "a".repeat(64), "sale1", 1000));
    expect(() =>
      run(
        planCheckout(
          envelope("phone", "1", "100000.25", "checkout-key-00000002"),
          identity,
          "b".repeat(64),
          "sale2",
          1000,
        ),
      ),
    ).toThrow();
    expect(count("sales")).toBe(1);
    expect(count("commands")).toBe(1);
  });
  it("aggregates repeated accessory lines and rejects subsequent oversell", () => {
    const e = envelope("accessory", "1", "200.50");
    e.payload.lines.push({ itemId: accessory, kind: "accessory", quantity: "1" });
    run(planCheckout(e, identity, "a".repeat(64), "sale1", 1000));
    expect(db.prepare("SELECT quantity FROM accessory_balances").get()?.["quantity"]).toBe(0);
    expect(() =>
      run(
        planCheckout(
          envelope("accessory", "1", "100.25", "checkout-key-00000002"),
          identity,
          "b".repeat(64),
          "sale2",
          1000,
        ),
      ),
    ).toThrow();
  });
  it("rejects cross-store seller without any command or money", () => {
    db.exec("UPDATE memberships SET store_id='M02' WHERE user_id='seller'");
    expect(() => run(planCheckout(envelope(), identity, "a".repeat(64), "sale1", 1000))).toThrow();
    expect(count("commands")).toBe(0);
    expect(count("cash_movements")).toBe(0);
  });
  it("rejects manager pretending to be seller", () => {
    expect(() =>
      run(
        planCheckout(
          envelope(),
          { userId: "manager", expiresAt: 2000 },
          "a".repeat(64),
          "sale1",
          1000,
        ),
      ),
    ).toThrow();
    expect(count("sales")).toBe(0);
  });
  it("rejects closed shift", () => {
    db.exec("UPDATE shifts SET state='CLOSED'");
    expect(() => run(planCheckout(envelope(), identity, "a".repeat(64), "sale1", 1000))).toThrow();
    expect(count("commands")).toBe(0);
  });
  it("rolls back insufficient tender", () => {
    expect(() =>
      run(planCheckout(envelope("phone", "1", "1.00"), identity, "a".repeat(64), "sale1", 1000)),
    ).toThrow();
    expect(count("commands")).toBe(0);
    expect(db.prepare("SELECT state FROM phones").get()?.["state"]).toBe("AVAILABLE");
  });
  it("rolls back a late audit failure including stock/payment/cash", () => {
    db.exec(
      "CREATE TRIGGER fail_audit BEFORE INSERT ON audit_events BEGIN SELECT RAISE(ABORT,'TEST_FAILURE'); END;",
    );
    expect(() => run(planCheckout(envelope(), identity, "a".repeat(64), "sale1", 1000))).toThrow();
    for (const t of [
      "sales",
      "commands",
      "stock_movements",
      "payments",
      "cash_movements",
      "journals",
    ])
      expect(count(t)).toBe(0);
    expect(db.prepare("SELECT state FROM phones").get()?.["state"]).toBe("AVAILABLE");
  });
  it("bank reference is optional and bank never credits the drawer", () => {
    const e = { ...envelope(), payload: { ...envelope().payload, tender: "Bank" } };

    run(planCheckout(e, identity, "a".repeat(64), "sale1", 1000));
    expect(count("cash_movements")).toBe(0);
    expect(db.prepare("SELECT account FROM journals WHERE debit_minor>0").get()?.["account"]).toBe(
      "BANK_UNRECONCILED",
    );
  });
  it("expired identity and client price authority fail before SQL", () => {
    expect(() =>
      planCheckout(envelope(), { ...identity, expiresAt: 999 }, "a".repeat(64), "sale1", 1000),
    ).toThrow("AUTH_EXPIRED");
    const e = envelope();
    expect(() =>
      planCheckout(
        { ...e, payload: { ...e.payload, price: "1.00" } },
        identity,
        "a".repeat(64),
        "sale1",
        1000,
      ),
    ).toThrow();
  });
  it("one physical drawer per store and no cross-store drawer", () => {
    expect(() => db.exec("INSERT INTO drawers VALUES('other','M01')")).toThrow();
    expect(() =>
      db.exec("INSERT INTO shifts VALUES('wrong','M02','drawer','seller','OPEN',0,NULL)"),
    ).toThrow();
  });
  it("SQLite write lock prevents interleaving while an atomic sale is open", () => {
    const { mkdtempSync, rmSync } = requireNative("node:fs") as typeof import("node:fs");
    const { tmpdir } = requireNative("node:os") as typeof import("node:os");
    const dir = mkdtempSync(`${tmpdir()}/ph-lock-`);
    const a = new DatabaseSync(`${dir}/test.db`),
      b = new DatabaseSync(`${dir}/test.db`);
    try {
      a.exec(
        "CREATE TABLE stock(quantity INTEGER CHECK(quantity>=0));INSERT INTO stock VALUES(1);BEGIN IMMEDIATE;UPDATE stock SET quantity=quantity-1",
      );
      expect(() => b.exec("BEGIN IMMEDIATE")).toThrow();
      a.exec("COMMIT");
      b.exec("BEGIN IMMEDIATE");
      expect(
        b.prepare("UPDATE stock SET quantity=quantity-1 WHERE quantity>=1").run().changes,
      ).toBe(0);
      b.exec("COMMIT");
      expect(b.prepare("SELECT quantity FROM stock").get()?.["quantity"]).toBe(0);
    } finally {
      a.close();
      b.close();
      rmSync(dir, { recursive: true });
    }
  });
  it("requires both different transfer approvers and M01 facility scope", () => {
    db.exec(
      "INSERT INTO transfers VALUES('transfer','M01','M02','APPROVALS');INSERT INTO transfer_approvals VALUES('transfer','SUPER_ADMIN','owner')",
    );
    expect(() =>
      db.exec("INSERT INTO transfer_approvals VALUES('transfer','M02_MANAGER','owner')"),
    ).toThrow();
    expect(() =>
      db.exec(
        "INSERT INTO facilities VALUES('facility','M02','customer','TEST employer',100,100,'POLICY_BLOCKED')",
      ),
    ).toThrow();
  });
  it("caps repayment drafts at recorded obligation without pretending collection", () => {
    db.exec("INSERT INTO customers VALUES('customer','M01','TEST CUSTOMER','TEST-CUSTOMER')");
    run(planCheckout(envelope(), identity, "a".repeat(64), "sale1", 1000));
    db.exec(
      "INSERT INTO debts VALUES('debt','55555555-5555-4555-8555-555555555555','sale1',10000000,'POLICY_BLOCKED');INSERT INTO repayments VALUES('repay','debt',4000025,'TEST-PAY','DRAFT')",
    );
    expect(() =>
      db.exec("INSERT INTO repayments VALUES('over','debt',5999976,'TEST-OVER','DRAFT')"),
    ).toThrow();
    expect(
      db.prepare("SELECT sum(amount_minor) n FROM repayments WHERE state='RECORDED'").get()?.["n"],
    ).toBe(null);
    expect(count("cash_movements")).toBe(1);
  });
  it("preserves serialized ownership with no return/resale release", () => {
    run(planCheckout(envelope(), identity, "a".repeat(64), "sale1", 1000));
    db.exec("UPDATE phones SET state='AVAILABLE'");
    expect(() =>
      run(
        planCheckout(
          envelope("phone", "1", "100000.25", "checkout-key-00000002"),
          identity,
          "b".repeat(64),
          "sale2",
          1000,
        ),
      ),
    ).toThrow();
    expect(count("sale_lines")).toBe(1);
  });
  it("2026-11-09 M01 manager reads cost-free purchases; owner-only service verifies identity", async () => {
    const port: AtomicSqlPort = {
      capabilities: { atomicBatch: true },
      batch: async (p) => run(p),
      read: async (s) => db.prepare(s.sql).all(...s.params) as Record<string, unknown>[],
    };
    const service = createNativeService(
      port,
      {
        verify: async (c) =>
          c === "invalid" ? null : { userId: c, sessionId: c, expiresAt: 2000 },
      },
      { get: async () => null, put: async () => {} },
      () => 1000,
    );
    expect(nativeModules).toContain("facility");
    expect(nativeModules).toContain("sav");
    expect(nativeModules).toContain("reports");
    await expect(service.ownerFinance("manager", "M01")).rejects.toThrow("FORBIDDEN");
    await expect(service.read("invalid", "inventory", "M01")).rejects.toThrow("UNAUTHORIZED");
    await expect(service.read("seller", "inventory", "M02")).rejects.toThrow("FORBIDDEN");
    expect(await service.read("manager", "purchases", "M01")).toEqual([]);
    expect(await service.ownerFinance("owner", "M01")).toEqual([]);
    expect(await service.policyBlocked("seller", "M01", "sav.refund")).toEqual({
      operation: "sav.refund",
      state: "POLICY_UNCONFIGURED",
      posted: false,
    });
  });
});
