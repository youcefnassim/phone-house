import { describe, it, expect, beforeEach } from "vitest";
import {
  resetTestWorkspace,
  getTestState,
  openTestShift,
  recordTestSale,
  priceTestBasket,
} from "@/data/test-workspace";
import {
  createTestTransfer,
  approveTestTransfer,
  advanceTestTransfer,
  saveCreditRequestDraft,
  saveRepaymentDraftChecked,
  debtFiguresFor,
  debtFigures,
  transferConflicts,
  revalidateTestTransfer,
  transfersListing,
} from "@/data/test-workflows";
import { auditActionLabel, AUDIT_ACTIONS } from "@/locales/audit-actions";

const phone = (id: string) => getTestState().phones.find((p) => p.id === id)!;
const acc = (id: string) => getTestState().accessories.find((a) => a.id === id)!;

describe("financial honesty: posted vs draft", () => {
  beforeEach(() => {
    resetTestWorkspace();
    openTestShift("M01", "Test seller 001", "0");
  });
  it("100000.00 obligation → draft 40000.25 → projected 59999.75 while confirmed paid stays 0.00", () => {
    const d = saveCreditRequestDraft({
      store: "M01",
      customerId: "C-001",
      lines: [{ id: "PH-002", quantity: 1 }],
      paid: "26000",
      dueDate: "2026-12-31",
      authorizationReference: "AUTH-1",
    });
    expect(d.amount).toBe("100000.00");
    saveRepaymentDraftChecked(d.id, {
      amount: "40000.25",
      date: "2026-11-06",
      method: "Cash",
      reference: "R-1",
      authorizationReference: "A",
    });
    const f = debtFiguresFor(d.id);
    expect(f.recordedPaid).toBe("0.00");
    expect(f.draftRepayments).toBe("40000.25");
    expect(f.confirmedOutstanding).toBe("100000.00");
    expect(f.projectedRemaining).toBe("59999.75");
    expect(f.obligationRecorded).toBe(false);
  });
  it("overpayment of 59999.76 against the projected remainder fails", () => {
    const d = saveCreditRequestDraft({
      store: "M01",
      customerId: "C-001",
      lines: [{ id: "PH-002", quantity: 1 }],
      paid: "26000",
      dueDate: "2026-12-31",
      authorizationReference: "AUTH-1",
    });
    saveRepaymentDraftChecked(d.id, {
      amount: "40000.25",
      date: "2026-11-06",
      method: "Cash",
      reference: "R-1",
      authorizationReference: "A",
    });
    expect(() =>
      saveRepaymentDraftChecked(d.id, {
        amount: "59999.76",
        date: "2026-11-06",
        method: "Cash",
        reference: "R-2",
        authorizationReference: "A",
      }),
    ).toThrow(/exceeds outstanding/);
    expect(debtFiguresFor(d.id).draftRepayments).toBe("40000.25");
  });
  it("recorded fixture repayments count as confirmed, session drafts never do", () => {
    const f = debtFigures({ amount: "5000.00", source: "Fixture" }, [
      { amount: "2000.00", source: "Fixture" },
      { amount: "1000.10", source: "Session draft" },
    ]);
    expect(f).toMatchObject({
      recordedPaid: "2000.00",
      draftRepayments: "1000.10",
      confirmedOutstanding: "3000.00",
      projectedRemaining: "1999.90",
      obligationRecorded: true,
    });
  });
  it("credit request pricing uses pure stock-validated basket total, no fake tender", () => {
    expect(priceTestBasket("M01", [{ id: "PH-002", quantity: 1 }]).total).toBe("126000.00");
    expect(() => priceTestBasket("M01", [{ id: "PH-003", quantity: 1 }])).toThrow(/one store/);
    expect(() =>
      saveCreditRequestDraft({
        store: "M01",
        customerId: "C-001",
        lines: [{ id: "PH-002", quantity: 1 }],
        paid: "126000",
        dueDate: "2026-12-31",
        authorizationReference: "A",
      }),
    ).toThrow(/Nothing remains unpaid/);
    expect(() =>
      saveCreditRequestDraft({
        store: "M01",
        customerId: "C-001",
        lines: [{ id: "PH-005", quantity: 1 }],
        paid: "0",
        dueDate: "2026-12-31",
        authorizationReference: "A",
      }),
    ).toThrow(/no longer available/);
  });
});

describe("transfer vs POS conflict", () => {
  beforeEach(() => {
    resetTestWorkspace();
    openTestShift("M01", "Test seller 001", "0");
  });
  const sellPh001 = () =>
    recordTestSale({
      key: "conflict-1",
      store: "M01",
      lines: [{ id: "PH-001", quantity: 1 }],
      customerId: "C-001",
      customerName: "Demo customer 001",
      tender: "Cash",
      paid: phone("PH-001").amount!,
    });
  it("selling a phone on a DRAFT transfer is allowed and flags the transfer; dispatch and approval refuse", () => {
    const t = createTestTransfer({
      from: "M01",
      to: "M02",
      reference: "R",
      lines: [
        { id: "PH-001", quantity: 1 },
        { id: "AC-002", quantity: 1 },
      ],
    });
    expect(transfersListing("PH-001").map((x) => x.id)).toEqual([t.id]);
    advanceTestTransfer(t.id);
    approveTestTransfer(t.id, "SUPER_ADMIN", "U-OWN");
    sellPh001();
    expect(phone("PH-001").status).toBe("Sold");
    const cur = getTestState().transfers.find((x) => x.id === t.id)!;
    expect(transferConflicts(cur)).toEqual(["PH-001"]);
    expect(() => approveTestTransfer(t.id, "M02_MANAGER", "U-M02")).toThrow(/revalidate/);
    expect(() => advanceTestTransfer(t.id)).toThrow(/revalidate/);
    expect(getTestState().transfers.find((x) => x.id === t.id)!.stage).toBe("APPROVALS");
  });
  it("stale approval at DISPATCH is refused, source/destination stock exact, revalidation clears approvals", () => {
    const q0 = acc("AC-002").quantity;
    const t = createTestTransfer({
      from: "M01",
      to: "M02",
      reference: "R",
      lines: [
        { id: "PH-001", quantity: 1 },
        { id: "AC-002", quantity: 1 },
      ],
    });
    advanceTestTransfer(t.id);
    approveTestTransfer(t.id, "SUPER_ADMIN", "U-OWN");
    approveTestTransfer(t.id, "M02_MANAGER", "U-M02");
    advanceTestTransfer(t.id);
    expect(getTestState().transfers[0]!.stage).toBe("DISPATCH");
    sellPh001();
    expect(() => advanceTestTransfer(t.id)).toThrow(/revalidate/);
    expect(acc("AC-002").quantity).toBe(q0);
    expect(phone("PH-001")).toMatchObject({ store: "M01", status: "Sold" });
    expect(getTestState().phones.some((p) => p.id === "PH-001" && p.store === "M02")).toBe(false);
    const r = revalidateTestTransfer(t.id);
    expect(r).toMatchObject({ stage: "DRAFT", superAdmin: false, m02Manager: false });
    expect(r.lines.map((l) => l.id)).toEqual(["AC-002"]);
    expect(() => revalidateTestTransfer(t.id)).toThrow(/No conflict/);
  });
  it("revalidation refuses when nothing available remains", () => {
    const t = createTestTransfer({
      from: "M01",
      to: "M02",
      reference: "R",
      lines: [{ id: "PH-001", quantity: 1 }],
    });
    sellPh001();
    expect(() => revalidateTestTransfer(t.id)).toThrow(/No available items remain/);
  });
});

describe("audit action localization", () => {
  it("maps known codes in FR/AR and falls back to the raw value", () => {
    expect(auditActionLabel("fr-DZ", "Test phone intake")).toBe("Entrée de téléphone (test)");
    expect(auditActionLabel("ar-DZ", "Test phone intake")).toBe("إدخال هاتف (اختبار)");
    expect(auditActionLabel("fr-DZ", "User note XYZ-123")).toBe("User note XYZ-123");
    for (const v of Object.values(AUDIT_ACTIONS)) {
      expect(v[1]).not.toBe(v[0]);
      expect(v[2]).not.toBe(v[0]);
    }
  });
});
