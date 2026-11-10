import { describe, it, expect } from "vitest";
import {
  addToCart,
  cartTotal,
  minorUnits,
  operationPolicy,
  canViewFinance,
  storeLabel,
} from "@/domain/erp";
import { stock, scopedRows } from "@/data/demo";
describe("Frontend domain policies (not backend validation)", () => {
  it("allows only one line quantity for a serialized phone", () => {
    const phone = stock[0];
    if (!phone) throw new Error("Missing phone fixture");
    const cart = addToCart([], phone);
    expect(addToCart(cart, phone)[0]?.quantity).toBe(1);
  });
  it("increments repeated accessory scans", () => {
    const item = stock.find((i) => i.id === "AC-001");
    if (!item) throw new Error("Missing fixture");
    expect(addToCart(addToCart([], item), item)[0]?.quantity).toBe(2);
  });
  it("keeps exact decimal amounts without whole-dinar rounding", () => {
    expect(minorUnits("100.01")).toBe(10001n);
    const phone = stock[0];
    if (!phone) throw new Error("Missing phone fixture");
    expect(cartTotal([{ item: { ...phone, amount: "100.01" }, quantity: 1 }])).toBe("100.01");
  });
  it("filters synthetic M01 stock independently from M02", () => {
    expect(scopedRows(stock, "M01").every((r) => r.store === "M01")).toBe(true);
    expect(scopedRows(stock, "M02")).toHaveLength(3);
  });
  it("does not enable operational offline sales", () => {
    expect(operationPolicy.offlineSales).toBe(false);
  });
  it("leaves discounts unconfigured", () => {
    expect(operationPolicy.discounts).toBe("UNCONFIGURED");
  });
  it("keeps operational writes blocked", () => {
    expect(operationPolicy.productionWrites).toBe(false);
  });
  it("marks owner finance exclusive in frontend policy, not a security proof", () => {
    expect(canViewFinance("SUPER_ADMIN")).toBe(true);
    expect(canViewFinance("MANAGER")).toBe(false);
    expect(canViewFinance("SELLER")).toBe(false);
  });
  it("uses only approved store labels", () => {
    expect(storeLabel("M01")).toBe("Magasin 1 (M01)");
    expect(storeLabel("M02")).toBe("Magasin 2 (M02)");
  });
});
