import "fake-indexeddb/auto";
import { beforeEach, afterEach, it, expect } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { ErpProvider } from "@/components/erp/context";
import { StockCount } from "@/components/erp/stock-count";
import {
  resetTestWorkspace,
  getTestState,
  setReviewActor,
  workspaceIdentities,
  exportLocalReview,
  openTestShift,
  expectedCash,
} from "@/data/test-workspace";
import {
  startLocalCount,
  enterLocalCount,
  submitLocalCount,
  localCountProjection,
  adjustLocalCount,
  reviewLocalAdjustment,
} from "@/data/local-stock-count";
import {
  recordLocalSupplierCost,
  localSupplierPayables,
  recordLocalSupplierPayment,
} from "@/data/local-supplier-finance";
import { saveTestSupplier } from "@/data/test-procurement";
import { visibleCashMovements } from "@/domain/blind-count";
const actor = (role: string) => {
  const a = workspaceIdentities().find(
    (a) => a.active && a.role === role && (role === "SUPER_ADMIN" || a.stores.includes("M01")),
  );
  if (!a) throw new Error("actor");
  setReviewActor(a.id);
  return a;
};
beforeEach(async () => {
  await (await import("@/data/test-workspace")).hydrateTestWorkspace();
  resetTestWorkspace();
  localStorage.setItem("ph-lang", "en");
  actor("SUPER_ADMIN");
});
afterEach(cleanup);
it("local seller blind count, required reason adjustment PENDING then owner review, missing phones unchanged", () => {
  actor("SELLER");
  const a = getTestState().accessories.find((a) => a.store === "M01" && a.quantity > 0);
  if (!a) throw new Error("accessory");
  const phones = JSON.stringify(getTestState().phones),
    id = startLocalCount("M01", "2026-11");
  enterLocalCount(id, a.id, a.quantity - 1);
  expect(localCountProjection(id).rows).toEqual([
    { item_id: a.id, kind: "accessory", counted: a.quantity - 1 },
  ]);
  submitLocalCount(id);
  expect(localCountProjection(id).rows.every((r) => r.kind === "accessory")).toBe(true);
  expect(() => adjustLocalCount(id, a.id, "")).toThrow("Required");
  adjustLocalCount(id, a.id, "Count");
  const review = getTestState().adjustmentReviews?.find((r) => r.itemId === a.id);
  if (!review) throw new Error("review");
  expect(review.outcome).toBe("PENDING");
  expect(() => adjustLocalCount(id, a.id, "Again")).toThrow("REJECTED");
  expect(() => reviewLocalAdjustment(review.movementId, "OK", "Checked")).toThrow();
  actor("SUPER_ADMIN");
  reviewLocalAdjustment(review.movementId, "FLAGGED", "Checked");
  expect(getTestState().adjustmentReviews?.[0]?.outcome).toBe("FLAGGED");
  expect(JSON.stringify(getTestState().phones)).toBe(phones);
});
it.each(["en", "fr-DZ", "ar-DZ"])(
  "%s mounted count submits blind and shows accessory differences with reasoned adjustment",
  async (lang) => {
    localStorage.setItem("ph-lang", lang);
    actor("SELLER");
    const a = getTestState().accessories.find((a) => a.store === "M01" && a.quantity > 0);
    if (!a) throw new Error("accessory");
    const t = (await import("@/locales/stock-count")).stockCountText(lang);
    render(
      <ErpProvider>
        <StockCount store="M01" />
      </ErpProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: t.count }));
    fireEvent.change(screen.getByLabelText(t.month), { target: { value: "2026-11" } });
    fireEvent.click(screen.getByRole("button", { name: t.open }));
    await screen.findByRole("button", { name: t.submit });
    fireEvent.change(screen.getByLabelText(t.scan), { target: { value: a.id } });
    fireEvent.change(screen.getByLabelText(t.quantity), {
      target: { value: String(a.quantity - 1) },
    });
    fireEvent.click(screen.getByRole("button", { name: t.save }));
    await waitFor(() =>
      expect(getTestState().stockCounts?.[0]?.entries[a.id]).toBe(a.quantity - 1),
    );
    fireEvent.click(screen.getByRole("button", { name: t.submit }));
    await waitFor(() => expect(getTestState().stockCounts?.[0]?.state).toBe("SUBMITTED"));
    fireEvent.change(screen.getByLabelText(t.reason), { target: { value: "Count" } });
    fireEvent.click(screen.getAllByRole("button", { name: t.adjust })[0] as HTMLElement);
    await waitFor(() =>
      expect(getTestState().adjustmentReviews?.some((r) => r.countId)).toBe(true),
    );
  },
);
it("private local supplier ledger excluded from workspace/export and forbidden to seller; cash payment hidden to staff", async () => {
  const s = saveTestSupplier({
    name: "Supplier",
    contact: "0550000000",
    store: "M01",
    documentReference: "",
    notes: "",
  });
  const p = getTestState().phones.find((p) => p.store === "M01");
  if (!p) throw new Error("phone");
  await recordLocalSupplierCost(p.id, s.id, "123.45");
  expect((await localSupplierPayables()).find((r) => r.supplier_id === s.id)?.balance_minor).toBe(
    12345,
  );
  openTestShift("M01", getTestState().sellers.M01, "500");
  await recordLocalSupplierPayment(s.id, "M01", "10", "Cash");
  expect(expectedCash(getTestState().shifts[0]?.id ?? "")).toBe("490.00");
  expect(JSON.stringify(exportLocalReview())).not.toContain("123.45");
  actor("SELLER");
  await expect(localSupplierPayables()).rejects.toThrow("FORBIDDEN");
  const shifts = getTestState().shifts.map((s) => ({ ...s, status: "CLOSED" }));
  expect(
    visibleCashMovements(getTestState().cash, shifts, "SELLER").some(
      (m) => m.reference === "Paiement fournisseur",
    ),
  ).toBe(false);
});
