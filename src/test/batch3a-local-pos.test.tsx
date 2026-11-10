import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { ErpProvider } from "@/components/erp/context";
import { Pos } from "@/components/erp/pos";
import {
  resetTestWorkspace,
  getTestState,
  openTestShift,
  recordTestSale,
  voidTestSale,
  setReviewActor,
  workspaceIdentities,
  saveTestSetting,
  expectedCash,
} from "@/data/test-workspace";
beforeEach(() => {
  resetTestWorkspace();
  localStorage.setItem("ph-lang", "en");
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it("local split discount and void preserve sale while returning stock and drawer", () => {
  const owner = workspaceIdentities().find((a) => a.role === "SUPER_ADMIN" && a.active);
  if (!owner) throw new Error("Missing owner");
  setReviewActor(owner.id);
  saveTestSetting("pos.discountLimitDzd", "100.00");
  const actor = workspaceIdentities().find(
    (a) => a.role === "SELLER" && a.active && a.stores.includes("M01"),
  );
  if (!actor) throw new Error("Missing seller");
  setReviewActor(actor.id);
  const shift = openTestShift("M01", actor.name, "0");
  const sku = getTestState().accessories.find(
    (a) => a.store === "M01" && a.amount && a.quantity > 0,
  );
  if (!sku?.amount) throw new Error("Missing accessory");
  const total = Number(sku.amount) - 1;
  const sale = recordTestSale({
    key: "local-split",
    store: "M01",
    lines: [{ id: sku.id, quantity: 1 }],
    customerId: "WALK-IN",
    customerName: "",
    tender: "Split",
    paid: String(total),
    cashAmount: String(total),
    bankAmount: "0",
    discountAmount: "1",
    bankMethod: "VIREMENT",
  });
  expect(sale.discountAmount).toBe("1");
  expect(expectedCash(shift.id)).toBe(`${total}.00`);
  expect(() => voidTestSale(sale.id, "void-key", "Correction")).toThrow();
  setReviewActor(owner.id);
  const before = JSON.stringify(sale);
  voidTestSale(sale.id, "void-key", "Correction");
  expect(JSON.stringify(getTestState().sales.find((s) => s.id === sale.id))).toBe(before);
  expect(expectedCash(shift.id)).toBe("0.00");
  expect(getTestState().accessories.find((a) => a.id === sku.id)?.quantity).toBe(sku.quantity);
  expect(() => voidTestSale(sale.id, "another-void", "Correction")).toThrow("SALE_VOIDED");
});
it("park/resume local basket does not reserve stock or post a sale; empty setting hides discount input", () => {
  render(
    <ErpProvider>
      <Pos />
    </ErpProvider>,
  );
  const before = getTestState();
  const button = screen.getAllByRole("button").find((b) => b.textContent?.includes("iPhone"));
  if (!button) throw new Error("Missing phone button");
  fireEvent.click(button);
  fireEvent.click(screen.getByRole("button", { name: "Park basket" }));
  expect(getTestState().sales).toEqual(before.sales);
  expect(getTestState().phones).toEqual(before.phones);
  fireEvent.click(screen.getByRole("button", { name: "Resume · 1" }));
  expect(screen.getByRole("button", { name: "Park basket" })).not.toBeDisabled();
  expect(screen.queryByLabelText("Discount (DZD)")).toBeNull();
});
