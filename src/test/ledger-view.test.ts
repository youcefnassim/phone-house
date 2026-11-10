import { describe, it, expect } from "vitest";
import { ledgerView } from "@/data/ledger-view";
import { getTestState, type TestState } from "@/data/test-workspace";
describe("dashboard figures derive from the test ledger", () => {
  it("counts only the selected store and starts with no sales", () => {
    const s = getTestState();
    const all = ledgerView(s, "ALL");
    const m1 = ledgerView(s, "M01");
    const m2 = ledgerView(s, "M02");
    expect(all.saleCount).toBe(0);
    expect(all.total).toBe("0.00");
    expect(m1.availablePhones + m2.availablePhones).toBe(all.availablePhones);
    expect(m1.accessoryUnits + m2.accessoryUnits).toBe(all.accessoryUnits);
  });
  it("sums sale totals exactly per store", () => {
    const s: TestState = {
      ...getTestState(),
      sales: [
        {
          id: "S1",
          key: "k",
          at: "2026-11-07T10:00:00Z",
          store: "M01",
          seller: "a",
          customerId: "c",
          customer: "C",
          tender: "Cash",
          total: "1200.50",
          paid: "1200.50",
          change: "0.00",
          lines: [],
        },
        {
          id: "S2",
          key: "k2",
          at: "2026-11-07T11:00:00Z",
          store: "M02",
          seller: "b",
          customerId: "c",
          customer: "C",
          tender: "Cash",
          total: "99.50",
          paid: "99.50",
          change: "0.00",
          lines: [],
        },
      ],
    };
    const now = new Date("2026-11-07T12:00:00Z");
    expect(ledgerView(s, "ALL", now).total).toBe("1300.00");
    expect(ledgerView(s, "M01", now).todayTotal).toBe("1200.50");
    expect(ledgerView(s, "M02", now).week[6]).toEqual({ day: "11-07", M01: 0, M02: 99.5 });
  });
  it("uses Algeria midnight for dashboard and preserves chart centimes", () => {
    const s: TestState = {
      ...getTestState(),
      sales: [
        {
          id: "S3",
          key: "k3",
          at: "2026-11-06T23:30:00Z",
          store: "M01",
          seller: "a",
          customerId: "c",
          customer: "C",
          tender: "Bank",
          total: "0.99",
          paid: "0.99",
          change: "0.00",
          lines: [],
        },
      ],
    };
    const v = ledgerView(s, "M01", new Date("2026-11-06T23:45:00Z"));
    expect(v.todayTotal).toBe("0.99");
    expect(v.week[6]).toEqual({ day: "11-07", M01: 0.99, M02: 0 });
    expect(v.stores).toEqual([{ store: "M01", total: "0.99", count: 1 }]);
  });
});
