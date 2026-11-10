import { describe, it, expect, beforeEach } from "vitest";
import {
  resetTestWorkspace,
  addTestPhone,
  openTestShift,
  recordTestSale,
  getTestState,
  nameTestSale,
  adjustTestAccessory,
  receiveTestAccessory,
  setTestAccessoryPrice,
} from "@/data/test-workspace";
import { getSession } from "@/data/session-store";
import { createPosCustomer } from "@/data/pos-customers";
import { testDocument } from "@/domain/test-documents";
import {
  saveTestSupplier,
  saveTestPurchase,
  saveTestPurchaseReceipt,
  saveTestExpense,
  saveTestExpenseCategory,
} from "@/data/test-procurement";
const phone = {
  name: "Unknown model",
  brand: "New brand",
  store: "M01" as const,
  condition: "NEW" as const,
  packaging: "OPEN_BOX" as const,
  imei1: "359000000000015",
  imei2: "359000000000023",
  serial: "S-TEST",
  battery: "",
  color: "Blue",
  storage: "128 GB",
  salePrice: "1000.01",
  barcode: "T-TEST",
  remarks: "",
};
const buy = () => {
  const customer = createPosCustomer("M01", {
    surname: "Synthetic",
    givenName: "Buyer",
    contact: "",
  });
  const p = addTestPhone(phone);
  openTestShift("M01", "Test seller 001", "0");
  return recordTestSale({
    key: "test-document-key",
    store: "M01",
    lines: [{ id: p.id, quantity: 1 }],
    customerId: customer.id,
    customerName: "Test buyer",
    warranties: [
      {
        itemId: p.id,
        requested: true,
        duration: "30 days draft",
        start: "2026-11-07",
        end: "2026-12-07",
      },
    ],
    tender: "Cash",
    paid: "1000.01",
    buyer: { surname: "Synthetic", givenName: "Buyer", contact: "" },
  });
};
beforeEach(resetTestWorkspace);
describe("test document invariants", () => {
  it("keeps exact cents, both IMEIs and immutable sold attributes", () => {
    const s = buy();
    const d = testDocument(s, "invoice");
    expect(d.total).toBe("1000.01");
    expect(d.lines[0]?.imei2).toBe("359000000000023");
    expect(d.lines[0]?.detail).toBe("128 GB · Blue");
    expect(d.official).toBe(false);
  });
  it("warranty is a separate one-item projection with no approved terms", () => {
    const s = buy();
    const d = testDocument(s, "warranty", s.lines[0]?.id);
    expect(d.lines).toHaveLength(1);
    expect(d.kind).toBe("warranty");
    expect(d.termsApproved).toBe(false);
    expect(() => testDocument(s, "warranty", "other")).toThrow();
  });
  it("reopening/reprinting projections do not change stock, cash, sales, debts or audit", () => {
    const s = buy();
    const before = JSON.stringify({ ws: getTestState(), session: getSession() });
    for (let i = 0; i < 3; i++) {
      testDocument(s, "invoice");
      testDocument(s, "warranty", s.lines[0]?.id);
    }
    expect(JSON.stringify({ ws: getTestState(), session: getSession() })).toBe(before);
  });
  it("buyer naming changes metadata only, not balances or audit", () => {
    const s = buy();
    const cash = JSON.stringify(getTestState().cash);
    const audit = JSON.stringify(getSession().audit);
    nameTestSale(s.id, { surname: "Test", givenName: "Buyer", contact: "" });
    expect(JSON.stringify(getTestState().cash)).toBe(cash);
    expect(JSON.stringify(getSession().audit)).toBe(audit);
    expect(getTestState().sales[0]?.buyer?.surname).toBe("Test");
  });
  it("invalid buyer prevents sale before any stock or cash effect", () => {
    const p = addTestPhone(phone);
    openTestShift("M01", "Test seller 001", "0");
    expect(() =>
      recordTestSale({
        key: "bad",
        store: "M01",
        lines: [{ id: p.id, quantity: 1 }],
        customerId: "WALK-IN",
        customerName: "",
        tender: "Cash",
        paid: "1000.01",
        buyer: { surname: "", givenName: "", contact: "" },
      }),
    ).toThrow();
    expect(getTestState().sales).toHaveLength(0);
    expect(getTestState().phones.find((x) => x.id === p.id)?.status).toBe("Available");
  });
  it("supports zero applicable IMEIs without inventing an identity", () => {
    const p = addTestPhone({ ...phone, imei1: "", imei2: "" });
    expect(p.imei).toBe("");
    expect(p.code).toBe("T-TEST");
  });
  it("cross-slot cross-store collision rejected; malformed IMEI rejected at data boundary", () => {
    addTestPhone(phone);
    expect(() =>
      addTestPhone({
        ...phone,
        store: "M02",
        imei1: "359000000000023",
        imei2: "",
        barcode: "OTHER",
        serial: "",
      }),
    ).toThrow();
    expect(() =>
      addTestPhone({ ...phone, imei1: "123", imei2: "", barcode: "OTHER", serial: "" }),
    ).toThrow();
  });
  it("duplicate sale key and sold identity never decrement twice", () => {
    const s = buy();
    expect(() =>
      recordTestSale({
        key: s.key,
        store: "M01",
        lines: [{ id: s.lines[0]?.id ?? "", quantity: 1 }],
        customerId: "WALK-IN",
        customerName: "",
        tender: "Cash",
        paid: "1000.01",
      }),
    ).toThrow();
    expect(getTestState().sales).toHaveLength(1);
    expect(getTestState().cash.filter((x) => x.kind === "SALE")).toHaveLength(1);
  });
});
describe("inventory and procurement draft integrity", () => {
  it("receive 20 and sell one leaves 19 with two real local movements", () => {
    receiveTestAccessory({
      name: "Test cable",
      sku: "NEW",
      category: "Cable",
      variant: "Blue",
      compatibility: "USB-C",
      barcode: "BC-NEW",
      store: "M01",
      quantity: "20",
      reference: "RC-NEW",
      remarks: "",
    });
    setTestAccessoryPrice("NEW", "1.01");
    openTestShift("M01", "Test seller 001", "0");
    recordTestSale({
      key: "AC-SALE",
      store: "M01",
      lines: [{ id: "NEW", quantity: 1 }],
      customerId: "WALK-IN",
      customerName: "",
      tender: "Cash",
      paid: "1.01",
    });
    expect(getTestState().accessories.find((a) => a.id === "NEW")?.quantity).toBe(19);
    expect(
      getTestState()
        .movements.filter((m) => m.sku === "NEW")
        .map((m) => m.quantity),
    ).toEqual([-1, 20]);
  });
  it("adjustment is audited and negative stock / store leakage rejected", () => {
    expect(adjustTestAccessory("AC-001", "M01", "-1", "COUNT")).toBe(19);
    expect(getSession().audit[0]?.action).toBe("Test quantity adjustment");
    expect(() => adjustTestAccessory("AC-001", "M01", "-20", "COUNT")).toThrow();
    expect(() => adjustTestAccessory("AC-001", "M02", "1", "COUNT")).toThrow();
  });
  it("supplier → purchase → receiving preview is shared without stock mutation", () => {
    const s = saveTestSupplier({
      name: "Synthetic supplier",
      contact: "Test contact",
      store: "M01",
      documentReference: "SUP-NEW",
      notes: "",
    });
    const p = saveTestPurchase({
      supplierId: s.id,
      store: "M01",
      kind: "Accessory",
      product: "Test cable",
      quantity: "20",
      documentReference: "PO-NEW",
      expectedDate: "2026-11-10",
      notes: "",
    });
    const before = JSON.stringify(getTestState().accessories);
    saveTestPurchaseReceipt(p.id, {
      quantity: "20",
      imei1: "",
      imei2: "",
      serial: "",
      barcode: "TEST-CABLE",
      documentReference: "PR-NEW",
      notes: "",
    });
    expect(getSession().purchaseReceipts[0]?.purchaseId).toBe(p.id);
    expect(JSON.stringify(getTestState().accessories)).toBe(before);
    expect(() =>
      saveTestPurchaseReceipt(p.id, {
        quantity: "1",
        imei1: "",
        imei2: "",
        serial: "",
        barcode: "TEST-CABLE",
        documentReference: "PR-2",
        notes: "",
      }),
    ).toThrow();
  });
  it("expense/category drafts are shared, duplicate references blocked and cash unchanged", () => {
    const before = JSON.stringify(getTestState().cash);
    saveTestExpenseCategory({ name: "Test category", reference: "EC-TEST" });
    const v = {
      category: "Test category",
      description: "Synthetic expense",
      store: "M01" as const,
      amount: "10.01",
      method: "Cash" as const,
      date: "2026-11-07",
      documentReference: "EX-TEST",
      notes: "",
    };
    saveTestExpense(v);
    expect(getSession().expenses[0]?.amount).toBe("10.01");
    expect(getSession().expenseCategories[0]?.name).toBe("Test category");
    expect(() => saveTestExpense(v)).toThrow();
    expect(JSON.stringify(getTestState().cash)).toBe(before);
  });
});
