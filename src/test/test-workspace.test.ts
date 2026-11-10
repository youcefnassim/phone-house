import { describe, it, expect, beforeEach } from "vitest";
import {
  resetTestWorkspace,
  getTestState,
  addTestPhone,
  receiveTestAccessory,
  recordTestSale,
  setTestSeller,
  setTestAccessoryPrice,
  openTestShift,
  addTestCashMovement,
  blindCloseTestShift,
  expectedCash,
  openShiftFor,
  sellersFor,
  type SaleRequest,
} from "@/data/test-workspace";
import type { PhoneDraft, AccessoryDraft } from "@/domain/operations";

const phone = (o: Partial<PhoneDraft> = {}): PhoneDraft =>
  ({
    name: "Test phone",
    brand: "Test",
    store: "M01",
    condition: "NEW",
    packaging: "SEALED",
    imei1: "359999999999915",
    imei2: "359999999999923",
    serial: "",
    battery: "",
    color: "Black",
    storage: "128 GB",
    salePrice: "45000",
    barcode: "TPH999",
    remarks: "",
    ...o,
  }) as PhoneDraft;
const acc = (o: Partial<AccessoryDraft> = {}): AccessoryDraft =>
  ({
    name: "Silicone case",
    sku: "AC-001",
    category: "Cases",
    variant: "Black",
    compatibility: "iPhone 15 Pro",
    barcode: "AC000001",
    store: "M01",
    quantity: "5",
    reference: "BR-1",
    remarks: "",
    ...o,
  }) as AccessoryDraft;
let n = 0;
const sale = (o: Partial<SaleRequest> = {}): SaleRequest => ({
  key: `k${++n}`,
  store: "M01",
  lines: [{ id: "PH-001", quantity: 1 }],
  customerId: "C-001",
  customerName: "Demo customer 001",
  tender: "Cash",
  paid: "189000",
  ...o,
});
const open = () => openTestShift("M01", "Test seller 001", "10000");

describe("test workspace inventory", () => {
  beforeEach(() => resetTestWorkspace());
  it("phone intake appears in stock as available", () => {
    const p = addTestPhone(phone());
    expect(getTestState().phones.find((x) => x.id === p.id)?.status).toBe("Available");
  });
  it("rejects an IMEI already used in either slot", () => {
    addTestPhone(phone());
    expect(() =>
      addTestPhone(phone({ imei1: "359999999999923", imei2: "", barcode: "X2" })),
    ).toThrow(/IMEI/);
  });
  it("rejects identical IMEI1 and IMEI2", () => {
    expect(() => addTestPhone(phone({ imei2: "359999999999915" }))).toThrow();
  });
  it("receiving an existing SKU adds to that store balance", () => {
    expect(receiveTestAccessory(acc()).balance).toBe(25);
  });
  it("a new SKU has no invented price and is blocked from checkout until priced", () => {
    open();
    const r = receiveTestAccessory(acc({ sku: "AC-NEW", barcode: "ACNEW1", name: "New cable" }));
    expect(r.priced).toBe(false);
    expect(getTestState().accessories.find((a) => a.id === "AC-NEW")?.amount).toBeUndefined();
    expect(() =>
      recordTestSale(sale({ lines: [{ id: "AC-NEW", quantity: 1 }], paid: "1000" })),
    ).toThrow(/price not configured/);
    setTestAccessoryPrice("AC-NEW", "900");
    expect(
      recordTestSale(sale({ lines: [{ id: "AC-NEW", quantity: 1 }], paid: "1000" })).change,
    ).toBe("100.00");
  });
  it("receiving an SKU of the other store is rejected (store isolation)", () => {
    expect(() => receiveTestAccessory(acc({ store: "M02" }))).toThrow(/other store/);
  });
});

describe("test workspace sale", () => {
  beforeEach(() => {
    resetTestWorkspace();
    open();
  });
  it("recomputes total and change from workspace prices", () => {
    const s = recordTestSale(
      sale({
        lines: [
          { id: "PH-001", quantity: 1 },
          { id: "AC-002", quantity: 1 },
        ],
        paid: "200000",
      }),
    );
    expect(s.total).toBe("193500.00");
    expect(s.change).toBe("6500.00");
  });
  it("aggregates duplicate accessory lines and never goes negative", () => {
    expect(() =>
      recordTestSale(
        sale({
          lines: [
            { id: "AC-002", quantity: 2 },
            { id: "AC-002", quantity: 2 },
          ],
          paid: "18000",
        }),
      ),
    ).toThrow(/Insufficient/);
    recordTestSale(
      sale({
        lines: [
          { id: "AC-002", quantity: 2 },
          { id: "AC-002", quantity: 1 },
        ],
        paid: "13500",
      }),
    );
    expect(getTestState().accessories.find((a) => a.id === "AC-002")!.quantity).toBe(0);
  });
  it("rejects duplicate phone lines", () => {
    expect(() =>
      recordTestSale(
        sale({
          lines: [
            { id: "PH-001", quantity: 1 },
            { id: "PH-001", quantity: 1 },
          ],
          paid: "378000",
        }),
      ),
    ).toThrow(/only be sold once/);
  });
  it("rejects a repeated submission of the same sale key", () => {
    const r = sale();
    recordTestSale(r);
    expect(() => recordTestSale({ ...r })).toThrow(/already recorded/);
    expect(getTestState().sales).toHaveLength(1);
  });
  it("rejects underpayment and malformed amounts", () => {
    expect(() => recordTestSale(sale({ paid: "188999.99" }))).toThrow();
    expect(() => recordTestSale(sale({ paid: "1e6" }))).toThrow();
    expect(() => recordTestSale(sale({ paid: "189000.001" }))).toThrow();
  });
  it("bank tender must equal the total (no change)", () => {
    expect(() => recordTestSale(sale({ tender: "Bank", paid: "190000" }))).toThrow(/Bank/);
    expect(recordTestSale(sale({ tender: "Bank" })).change).toBe("0.00");
  });
  it("rejects an unsupported tender", () => {
    expect(() => recordTestSale(sale({ tender: "Card" as never }))).toThrow(/tender/);
  });
  it("rejects a sold phone and a cross-store line", () => {
    recordTestSale(sale());
    expect(() => recordTestSale(sale())).toThrow(/no longer available/);
    expect(() =>
      recordTestSale(sale({ lines: [{ id: "PH-003", quantity: 1 }], paid: "89000" })),
    ).toThrow(/one store/);
  });
  it("cash sale records a cash movement equal to the total in the open shift", () => {
    const s = recordTestSale(sale({ paid: "190000" }));
    const shift = openShiftFor("M01")!;
    expect(s.shiftId).toBe(shift.id);
    expect(expectedCash(shift.id)).toBe("199000.00");
  });
});

describe("test workspace cash and sellers", () => {
  beforeEach(() => resetTestWorkspace());
  it("cash sale without an open shift is rejected", () => {
    expect(() => recordTestSale(sale())).toThrow(/shift/);
  });
  it("one open shift per physical drawer", () => {
    open();
    expect(() => open()).toThrow(/already open/);
  });
  it("movement without shift rejected; cash out cannot exceed drawer", () => {
    expect(() => addTestCashMovement("M01", "CASH_IN", "100", "R1")).toThrow(/No open/);
    open();
    expect(() => addTestCashMovement("M01", "CASH_OUT", "10000.01", "R2")).toThrow(/exceeds/);
  });
  it("blind close computes discrepancy only at close and allows a new sequential shift", () => {
    open();
    addTestCashMovement("M01", "CASH_IN", "500", "R1");
    const c = blindCloseTestShift("M01", "10499.99");
    expect(c.expectedAtClose).toBe("10500.00");
    expect(c.discrepancy).toBe("-0.01");
    expect(() => open()).not.toThrow();
  });
  it("active store operators include M02 Manager and owner but exclude retired seller", () => {
    expect(sellersFor("M02").map((u) => u.name)).toEqual([
      "Test manager M02",
      "Test owner (Super Admin)",
    ]);
    expect(() => setTestSeller("M02", "Test seller 002")).toThrow();
    setTestSeller("M02", "Test manager M02");
    setTestSeller("M01", "Test seller 003");
    expect(getTestState().sellers.M01).toBe("Test seller 003");
  });
  it("reset restores the fixture revision", () => {
    open();
    recordTestSale(sale());
    resetTestWorkspace();
    const s = getTestState();
    expect(s.sales).toHaveLength(0);
    expect(s.shifts).toHaveLength(0);
    expect(s.phones.find((p) => p.id === "PH-001")!.status).toBe("Available");
  });
});
