import { beforeEach, describe, it, expect } from "vitest";
import {
  resetTestWorkspace,
  recordTestSale,
  openTestShift,
  getTestState,
  expectedCash,
  blindCloseTestShift,
  setReviewActor,
  setTestAccessoryPrice,
  adjustTestAccessory,
  type SaleRequest,
} from "@/data/test-workspace";
import { createPosCustomer, findBuyer } from "@/data/pos-customers";
import { getSession } from "@/data/session-store";
import { testDocument } from "@/domain/test-documents";
import { algiersDate, salesDateRange, warrantyDates } from "@/domain/sales-review";
const request = (extra: Partial<SaleRequest> = {}): SaleRequest => ({
  key: "new-sale",
  store: "M01",
  lines: [{ id: "PH-001", quantity: 1 }],
  customerId: "C-001",
  customerName: "ignored",
  paid: "189000",
  tender: "Cash",
  ...extra,
});
beforeEach(() => {
  resetTestWorkspace();
  openTestShift("M01", "Test seller 001", "0");
});
describe("owner integrated POS rules", () => {
  it.each([1, 3, 6, 12])(
    "records user selected %i months from sale date without approval",
    (months) => {
      const sale = recordTestSale(
        request({
          warranties: [
            { itemId: "PH-001", requested: true, months, duration: "", start: "", end: "" },
          ],
        }),
      );
      expect(sale.warranties?.[0]).toMatchObject({
        months,
        duration: String(months),
        ...warrantyDates(sale.at, months),
        status: "DRAFT_PENDING",
      });
    },
  );
  it("clamps Algeria month anniversaries and handles leap years", () => {
    expect(warrantyDates("2026-01-30T23:30:00Z", 1)).toEqual({
      start: "2026-01-31",
      end: "2026-02-28",
    });
    expect(warrantyDates("2023-08-31T10:00:00Z", 6).end).toBe("2024-02-29");
    expect(() => warrantyDates("2026-11-07", 1.5)).toThrow();
  });
  it("stages a new inline buyer and commits sale/customer together", () => {
    const sale = recordTestSale(
      request({
        customerId: "WALK-IN",
        newBuyer: { surname: "Inline", givenName: "Buyer", contact: "" },
      }),
    );
    expect(getSession().customers).toHaveLength(1);
    expect(sale.customerId).toBe(getSession().customers[0]?.id);
    expect(sale.buyer).toEqual({ surname: "Inline", givenName: "Buyer", contact: "" });
  });
  it("does not create customer when sale validation fails", () => {
    const before = JSON.stringify([getTestState(), getSession()]);
    expect(() =>
      recordTestSale(
        request({
          customerId: "WALK-IN",
          paid: "1",
          newBuyer: { surname: "Inline", givenName: "Buyer", contact: "" },
        }),
      ),
    ).toThrow();
    expect(JSON.stringify([getTestState(), getSession()])).toBe(before);
  });
  it("accepts a matching new inline buyer and records the buyer as typed", () => {
    const c = createPosCustomer("M01", { surname: "Inline", givenName: "Buyer", contact: "" });
    const sale = recordTestSale(
      request({
        customerId: "WALK-IN",
        newBuyer: { surname: " inline ", givenName: "BUYER", contact: "" },
      }),
    );
    expect(getSession().customers).toHaveLength(2);
    expect(sale.customerId).not.toBe(c.id);
    expect(sale.buyer).toEqual({ surname: "inline", givenName: "BUYER", contact: "" });
  });
  it("anonymous bank accessories need neither buyer nor warranty nor cash", () => {
    const s = recordTestSale(
      request({
        customerId: "WALK-IN",
        lines: [{ id: "AC-001", quantity: 2 }],
        paid: "3600",
        tender: "Bank",
      }),
    );
    expect(s.customerId).toBe("WALK-IN");
    expect(s.buyer).toBeUndefined();
    expect(s.warranties).toEqual([]);
    expect(getSession().customers).toHaveLength(0);
    expect(expectedCash(s.shiftId ?? "")).toBe("0.00");
  });
  it("explicit existing customerId reuses the selected demo customer", () => {
    const customer = createPosCustomer("M01", {
      surname: "Existing",
      givenName: "Buyer",
      contact: "Contact",
    });
    const sale = recordTestSale(request({ customerId: customer.id }));
    expect(sale.customerId).toBe(customer.id);
    expect(sale.buyer).toEqual({ surname: "Existing", givenName: "Buyer", contact: "Contact" });
    expect(getSession().customers).toHaveLength(1);
  });
  it("rejects an unchosen phone warranty and duplicate posting without any mutation", () => {
    const before = JSON.stringify([getTestState(), getSession()]);
    expect(() => recordTestSale(request({ warranties: [] }))).toThrow(/warranty/);
    expect(JSON.stringify([getTestState(), getSession()])).toBe(before);
    const sale = recordTestSale(request());
    const after = JSON.stringify([getTestState(), getSession()]);
    expect(() => recordTestSale(request())).toThrow(/already/);
    testDocument(sale, "invoice");
    testDocument(sale, "invoice");
    expect(JSON.stringify([getTestState(), getSession()])).toBe(after);
  });
  it("requires linked phone buyer with no stock/cash/audit change", () => {
    const before = JSON.stringify([getTestState(), getSession()]);
    expect(() => recordTestSale(request({ customerId: "WALK-IN" }))).toThrow(/customer/);
    expect(JSON.stringify([getTestState(), getSession()])).toBe(before);
  });
  it("requires buyer even in a mixed phone/accessory basket", () => {
    expect(() =>
      recordTestSale(
        request({
          customerId: "WALK-IN",
          lines: [
            { id: "PH-001", quantity: 1 },
            { id: "AC-001", quantity: 1 },
          ],
          paid: "190800",
        }),
      ),
    ).toThrow(/customer/);
    expect(getTestState().sales).toHaveLength(0);
  });
  it("allows accessory walk-in and decrements exactly one quantity", () => {
    const q = getTestState().accessories.find((a) => a.id === "AC-001")?.quantity;
    recordTestSale(
      request({ customerId: "WALK-IN", lines: [{ id: "AC-001", quantity: 1 }], paid: "1800" }),
    );
    expect(getTestState().accessories.find((a) => a.id === "AC-001")?.quantity).toBe((q ?? 0) - 1);
  });
  it("creates proper customer and detects normalized duplicate for explicit reuse", () => {
    const c = createPosCustomer("M01", { surname: "Synthetic", givenName: "Buyer", contact: "" });
    expect(findBuyer("M01", { surname: " synthetic ", givenName: "BUYER", contact: "" })?.id).toBe(
      c.id,
    );
    expect(() =>
      createPosCustomer("M01", { surname: "Synthetic", givenName: "Buyer", contact: "" }),
    ).toThrow(/existing/);
    expect(getSession().customers).toHaveLength(1);
    const sale = recordTestSale(request({ customerId: c.id }));
    expect(sale.buyer).toEqual({ surname: "Synthetic", givenName: "Buyer", contact: "" });
    expect(sale.customerId).toBe(c.id);
  });
  it("rejects wrong store customer", () => {
    expect(() => recordTestSale(request({ customerId: "C-003" }))).toThrow(/customer/);
    expect(getTestState().sales).toHaveLength(0);
  });
  it("bank paid sale affects no physical cash", () => {
    const s = recordTestSale(request({ tender: "Bank" }));
    expect(s.shiftId).toBe(getTestState().shifts[0]?.id);
    expect(expectedCash(s.shiftId ?? "")).toBe("0.00");
    expect(getTestState().cash.filter((c) => c.kind === "SALE")).toHaveLength(0);
  });
  it("rejects bank sale after closed shift", () => {
    blindCloseTestShift("M01", "0");
    expect(() => recordTestSale(request({ tender: "Bank" }))).toThrow(/shift/);
  });
  it("requested warranty remains draft, explicit dates preserved and printing pure", () => {
    const s = recordTestSale(
      request({
        warranties: [
          {
            itemId: "PH-001",
            requested: true,
            duration: "30 days draft",
            start: "2026-11-07",
            end: "2026-12-07",
          },
        ],
      }),
    );
    expect(s.warranties?.[0]?.status).toBe("DRAFT_PENDING");
    const before = JSON.stringify([getTestState(), getSession()]);
    expect(testDocument(s, "warranty", "PH-001").official).toBe(false);
    testDocument(s, "invoice");
    expect(JSON.stringify([getTestState(), getSession()])).toBe(before);
  });
  it("no warranty prevents certificate projection", () => {
    const s = recordTestSale(request());
    expect(s.warranties?.[0]?.status).toBe("NONE");
    expect(() => testDocument(s, "warranty", "PH-001")).toThrow(/No warranty/);
  });
  it("invalid calendar dates never become warranty terms", () => {
    expect(() =>
      recordTestSale(
        request({
          warranties: [
            {
              itemId: "PH-001",
              requested: true,
              duration: "draft",
              start: "2026-02-30",
              end: "2026-03-10",
            },
          ],
        }),
      ),
    ).toThrow();
    expect(getTestState().sales).toHaveLength(0);
  });
  it("invalid requested warranty aborts all changes", () => {
    const before = JSON.stringify([getTestState(), getSession()]);
    expect(() =>
      recordTestSale(
        request({
          warranties: [{ itemId: "PH-001", requested: true, duration: "", start: "", end: "" }],
        }),
      ),
    ).toThrow();
    expect(JSON.stringify([getTestState(), getSession()])).toBe(before);
  });
  it("inventory pricing and adjustment reject actor other-store mutation", () => {
    setReviewActor("U-M02");
    const before = JSON.stringify(getTestState());
    expect(() => setTestAccessoryPrice("AC-001", "1")).toThrow(/store/);
    expect(() => adjustTestAccessory("AC-001", "M01", "1", "x")).toThrow(/store/);
    expect(JSON.stringify(getTestState())).toBe(before);
  });
  it("Algeria local date crosses UTC midnight and week begins Sunday", () => {
    expect(algiersDate("2026-11-07T23:30:00Z")).toBe("2026-11-08");
    expect(salesDateRange("week", new Date("2026-11-07T23:30:00Z"))).toEqual({
      from: "2026-11-08",
      to: "2026-11-08",
    });
    expect(salesDateRange("yesterday", new Date("2026-11-07T23:30:00Z"))).toEqual({
      from: "2026-11-07",
      to: "2026-11-07",
    });
  });
});
