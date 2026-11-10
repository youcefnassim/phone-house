import "fake-indexeddb/auto";
import { describe, it, expect, vi } from "vitest";

describe("single local review lifecycle (isolated fake IndexedDB)", () => {
  it("preserves existing records across revision migration, reload and queued writes", async () => {
    const w = await import("@/data/test-workspace");
    const original = { ...w.seedTestState(), revision: "TW-older", version: 42, seq: 9 };
    const db = await new Promise<IDBDatabase>((resolve) => {
      const r = indexedDB.open("ph-test-workspace", 1);
      r.onupgradeneeded = () => r.result.createObjectStore("kv");
      r.onsuccess = () => resolve(r.result);
    });
    await new Promise<void>((resolve) => {
      const tx = db.transaction("kv", "readwrite");
      tx.objectStore("kv").put(original, "workspace");
      tx.oncomplete = () => resolve();
    });
    db.close();
    await w.hydrateTestWorkspace();
    expect(w.getTestState().phones).toEqual(original.phones);
    expect(w.getTestState().revision).toBe("TW-older");
    expect(w.getTestState().seq).toBe(9);
    expect(w.migrateReviewWorkspace(w.getTestState())).toEqual(w.getTestState());
    const before = w.exportLocalReview();
    await expect(
      w.prepareLocalCleanStart({
        kind: "empty",
        confirmation: "EMPTY LOCAL REVIEW",
        acknowledged: false,
        target: w.LOCAL_REVIEW_TARGET,
      }),
    ).rejects.toThrow("confirmation");
    expect(w.exportLocalReview().workspace).toEqual(before.workspace);
  });
  it("rejects any target outside the fixed browser namespace", async () => {
    const w = await import("@/data/test-workspace");
    await expect(
      w.prepareLocalCleanStart({
        kind: "empty",
        confirmation: "EMPTY LOCAL REVIEW",
        acknowledged: true,
        target: {
          ...w.LOCAL_REVIEW_TARGET,
          database: "remote" as typeof w.LOCAL_REVIEW_TARGET.database,
        },
      }),
    ).rejects.toThrow("namespace");
  });
  it("empty start clears local ledger and fixture references and survives a fresh hydration without reseed", async () => {
    const w = await import("@/data/test-workspace");
    await w.prepareLocalCleanStart({
      kind: "empty",
      confirmation: "EMPTY LOCAL REVIEW",
      acknowledged: true,
      target: w.LOCAL_REVIEW_TARGET,
    });
    expect(w.getTestState().phones).toEqual([]);
    expect(w.getTestState().sales).toEqual([]);
    expect(w.getTestState().accessories).toEqual([]);
    expect(w.sellersFor("M01")).toEqual([]);
    const { projectSnapshot } = await import("@/data/business-demo");
    expect(Object.values(projectSnapshot("ALL")).every((rows) => rows.length === 0)).toBe(true);
    const { ledgerView } = await import("@/data/ledger-view");
    expect(ledgerView(w.getTestState(), "ALL").total).toBe("0.00");
    vi.resetModules();
    const reloaded = await import("@/data/test-workspace");
    await reloaded.hydrateTestWorkspace();
    expect(reloaded.getTestState().fixturePolicy).toBe("empty");
    expect(reloaded.getTestState().phones).toEqual([]);
    expect(reloaded.getTestState().sales).toEqual([]);
  });
  it("explicit rehearsal restoration is a different operation and restores deterministic fictional stock", async () => {
    const w = await import("@/data/test-workspace");
    await expect(
      w.prepareLocalCleanStart({
        kind: "rehearsal",
        confirmation: "EMPTY LOCAL REVIEW",
        acknowledged: true,
        target: w.LOCAL_REVIEW_TARGET,
      }),
    ).rejects.toThrow("confirmation");
    await w.prepareLocalCleanStart({
      kind: "rehearsal",
      confirmation: "RESTORE FICTIONAL FIXTURES",
      acknowledged: true,
      target: w.LOCAL_REVIEW_TARGET,
    });
    expect(w.getTestState().phones).toEqual(w.seedTestState().phones);
    expect(w.getTestState().fixturePolicy).toBe("rehearsal");
    expect(w.getTestState().sales).toEqual([]);
  });
  it("export contains only local records, no authentication/session credentials", async () => {
    const w = await import("@/data/test-workspace");
    const data = w.exportLocalReview();
    expect(Object.keys(data).sort()).toEqual([
      "exportedAt",
      "format",
      "localOnly",
      "session",
      "workspace",
    ]);
    expect(data.format).toBe("phonehouse-browser-review-v1");
    expect(JSON.stringify(data)).not.toContain("access_token");
  });
});
