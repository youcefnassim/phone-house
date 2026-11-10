import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { ErpProvider } from "@/components/erp/context";
import { LocalCreditList } from "@/components/erp/credit-list";
import {
  resetTestWorkspace,
  workspaceIdentities,
  setReviewActor,
  getTestState,
  openTestShift,
  recordTestSale,
  recordLocalRepayment,
  reverseLocalRepayment,
  localCreditBalance,
  expectedCash,
  recordLocalCashMovement,
  blindCloseTestShift,
  voidTestSale,
} from "@/data/test-workspace";
import { decimalValue, minorUnits } from "@/domain/erp";
function setup() {
  const owner = workspaceIdentities().find((a) => a.role === "SUPER_ADMIN" && a.active);
  if (!owner) throw new Error("owner");
  setReviewActor(owner.id);
  const shift = openTestShift("M01", getTestState().sellers.M01, "0");
  const sku = getTestState().accessories.find((a) => a.store === "M01" && a.amount && a.quantity);
  if (!sku?.amount) throw new Error("sku");
  const sale = recordTestSale({
    key: "local-credit",
    store: "M01",
    lines: [{ id: sku.id, quantity: 1 }],
    customerId: "WALK-IN",
    customerName: "",
    newBuyer: { surname: "Buyer", givenName: "Name", contact: "0550123456" },
    buyer: { surname: "Buyer", givenName: "Name", contact: "0550123456" },
    tender: "Cash",
    paid: "0",
    creditAmount: sku.amount,
    dueDate: "2026-11-08",
  });
  return { sale, owner, shift };
}
beforeEach(() => {
  resetTestWorkspace();
  localStorage.setItem("ph-lang", "en");
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-09T12:00:00Z"));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
it("local full credit, staff repayment, owner reversal and ledger close preserve original sale", () => {
  const { sale, owner, shift } = setup();
  const before = JSON.stringify(sale);
  const seller = workspaceIdentities().find(
    (a) => a.role === "SELLER" && a.active && a.stores.includes("M01"),
  );
  if (!seller) throw new Error("seller");
  setReviewActor(seller.id);
  const p = recordLocalRepayment(sale.id, sale.total, "Cash");
  expect(localCreditBalance(sale)).toBe("0.00");
  expect(expectedCash(shift.id)).toBe(decimalValue(minorUnits(sale.total)));
  expect(() => reverseLocalRepayment(p.id, "Correction")).toThrow("FORBIDDEN");
  setReviewActor(owner.id);
  reverseLocalRepayment(p.id, "Correction");
  expect(localCreditBalance(sale)).toBe(decimalValue(minorUnits(sale.total)));
  expect(expectedCash(shift.id)).toBe("0.00");
  expect(JSON.stringify(getTestState().sales[0])).toBe(before);
});
it("local owner overdue alert, seller no alert; repayment form reads balance", () => {
  const { sale } = setup();
  render(
    <ErpProvider>
      <LocalCreditList />
    </ErpProvider>,
  );
  expect(screen.getAllByRole("alert").some((a) => a.textContent?.includes("Overdue credit"))).toBe(
    true,
  );
  fireEvent.click(screen.getByRole("button", { name: "Repayment" }));
  fireEvent.change(screen.getByLabelText("Repayment amount (DZD)"), {
    target: { value: sale.total },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(localCreditBalance(sale)).toBe("0.00");
  cleanup();
  const seller = workspaceIdentities().find(
    (a) => a.role === "SELLER" && a.active && a.stores.includes("M01"),
  );
  if (!seller) throw new Error("seller");
  setReviewActor(seller.id);
  render(
    <ErpProvider>
      <LocalCreditList />
    </ErpProvider>,
  );
  expect(screen.queryByRole("alert")).toBeNull();
});
it("local movements owner categories with Autre note, seller denial and expected close", () => {
  const { owner, shift } = setup();
  expect(() => recordLocalCashMovement("M01", "CASH_IN", "10", "Autre", "")).toThrow("VALIDATION");
  recordLocalCashMovement("M01", "CASH_IN", "100", "Autre", "Deposit");
  recordLocalCashMovement("M01", "CASH_OUT", "25", "Loyer", "");
  expect(expectedCash(shift.id)).toBe("75.00");
  const seller = workspaceIdentities().find(
    (a) => a.role === "SELLER" && a.active && a.stores.includes("M01"),
  );
  if (!seller) throw new Error("seller");
  setReviewActor(seller.id);
  expect(() => recordLocalCashMovement("M01", "CASH_IN", "10", "Frais", "")).toThrow();
  setReviewActor(owner.id);
  blindCloseTestShift("M01", "75", { shiftId: shift.id, operator: getTestState().sellers.M01 });
  expect(getTestState().shifts.find((s) => s.id === shift.id)?.expectedAtClose).toBe("75.00");
  expect(() => recordLocalCashMovement("M01", "CASH_IN", "10", "Frais", "")).toThrow();
});
it("local overpayment refused and active repayment must be explicitly reversed before void", () => {
  const { sale } = setup();
  expect(() =>
    recordLocalRepayment(sale.id, decimalValue(minorUnits(sale.total) + 1n), "Bank", "VIREMENT"),
  ).toThrow("OVERPAYMENT");
  recordLocalRepayment(sale.id, sale.total, "Bank", "VIREMENT");
  expect(() => voidTestSale(sale.id, "void-credit", "Correction")).toThrow("REJECTED");
});
