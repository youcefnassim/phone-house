// Evidence for V1 checklist row "Suppliers | List / name and phone" (Phase 1 audit, 2026-11-10).
// The row previously cited a test that never exercised the supplier phone.
import { beforeEach, it, expect } from "vitest";
import { sqliteHarness } from "./sqlite-harness";
import { createNativeService } from "@/backend/sqlite/service";

let h: ReturnType<typeof sqliteHarness>,
  n = 0;
const now = Date.parse("2026-11-10T12:00:00Z");
const svc = () =>
  createNativeService(
    h.port,
    { verify: async (u) => ({ userId: u, sessionId: u, expiresAt: now + 100000 }) },
    { get: async () => null, put: async () => {} },
    () => now,
  );
const save = (payload: Record<string, unknown>, actor = "manager") =>
  svc().execute(actor, {
    version: "native-2026-11-06",
    key: `supplier-phone-command-${++n}`,
    operation: "supplier.save",
    payload: { store: "M01", ...payload },
  });
const list = async (actor = "manager", store = "M01", search?: string) =>
  (await svc().read(actor, "suppliers", store, search ? { search } : {})) as Array<
    Record<string, unknown>
  >;

beforeEach(() => {
  h = sqliteHarness();
  h.db.exec(
    `INSERT INTO accounts VALUES('owner',1),('seller',1),('manager',1),('m2',1);
     INSERT INTO memberships VALUES('owner','GLOBAL','SUPER_ADMIN'),('seller','M01','SELLER'),('manager','M01','MANAGER'),('m2','M02','MANAGER');
     INSERT INTO sessions SELECT id,id,${now + 100000},0 FROM accounts;`,
  );
});

it("supplier list returns name and phone; phone is updated in place and blank is allowed", async () => {
  await save({ id: "sup-a", name: "Alpha Telecom", reference: "SUP-A", phone: "0555 12 34 56" });
  await save({ id: "sup-b", name: "Beta Mobile", reference: "SUP-B" });
  let rows = await list();
  expect(rows.map((r) => [r["name"], r["phone"]])).toEqual([
    ["Alpha Telecom", "0555 12 34 56"],
    ["Beta Mobile", ""],
  ]);
  // Re-saving changes the phone without creating a second supplier or contact row.
  await save({ id: "sup-a", name: "Alpha Telecom", reference: "SUP-A", phone: "0661 00 00 00" });
  rows = await list();
  expect(rows).toHaveLength(2);
  expect(rows.find((r) => r["id"] === "sup-a")?.["phone"]).toBe("0661 00 00 00");
  expect(h.db.prepare("SELECT count(*) n FROM supplier_contacts").get()?.["n"]).toBe(2);
  // Name search finds the supplier with its phone.
  const found = await list("manager", "M01", "Beta");
  expect(found.map((r) => [r["name"], r["phone"]])).toEqual([["Beta Mobile", ""]]);
});

it("supplier list is store-scoped and not readable by sellers", async () => {
  await save({ id: "sup-a", name: "Alpha Telecom", reference: "SUP-A", phone: "0555123456" });
  await expect(list("seller")).rejects.toThrow("FORBIDDEN");
  await expect(list("m2", "M01")).rejects.toThrow("FORBIDDEN");
  expect(await list("m2", "M02")).toEqual([]);
  expect((await list("owner"))[0]?.["phone"]).toBe("0555123456");
});

it("supplier phone is bounded to 80 characters", async () => {
  await expect(
    save({ id: "sup-x", name: "Long", reference: "SUP-X", phone: "0".repeat(81) }),
  ).rejects.toThrow("VALIDATION");
  expect(h.db.prepare("SELECT count(*) n FROM suppliers").get()?.["n"]).toBe(0);
});
