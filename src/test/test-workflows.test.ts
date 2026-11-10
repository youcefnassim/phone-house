import { describe, it, expect, beforeEach } from "vitest";
import {
  resetTestWorkspace,
  getTestState,
  openTestShift,
  recordTestSale,
  expectedCash,
  openShiftFor,
} from "@/data/test-workspace";
import { getSession } from "@/data/session-store";
import {
  createTestTransfer,
  approveTestTransfer,
  advanceTestTransfer,
  scanTestTransfer,
  saveCreditRequestDraft,
  saveDebtDraftChecked,
  saveRepaymentDraftChecked,
  debtBalance,
  saveFacilityDraft,
  addFacilityEvidence,
  saveServiceCase,
  addRefundReview,
  addServiceEvent,
} from "@/data/test-workflows";

const phone = (id: string) => getTestState().phones.find((p) => p.id === id)!;
const tr = () =>
  createTestTransfer({
    from: "M01",
    to: "M02",
    reference: "TR-REF-1",
    lines: [
      { id: "PH-001", quantity: 1 },
      { id: "AC-002", quantity: 2 },
    ],
  });
const toReceipt = (id: string) => {
  advanceTestTransfer(id);
  approveTestTransfer(id, "SUPER_ADMIN", "U-OWN");
  approveTestTransfer(id, "M02_MANAGER", "U-M02");
  advanceTestTransfer(id);
  advanceTestTransfer(id);
  advanceTestTransfer(id);
};

describe("local test transfers", () => {
  beforeEach(() => resetTestWorkspace());
  it("uses current source stock and rejects other-store items", () => {
    expect(() =>
      createTestTransfer({
        from: "M01",
        to: "M02",
        reference: "R",
        lines: [{ id: "PH-003", quantity: 1 }],
      }),
    ).toThrow(/source store/);
    expect(() =>
      createTestTransfer({
        from: "M01",
        to: "M02",
        reference: "R",
        lines: [{ id: "PH-005", quantity: 1 }],
      }),
    ).toThrow(/no longer available/);
  });
  it("a phone cannot be on two active transfers", () => {
    tr();
    expect(() =>
      createTestTransfer({
        from: "M01",
        to: "M02",
        reference: "R2",
        lines: [{ id: "PH-001", quantity: 1 }],
      }),
    ).toThrow(/another active transfer/);
  });
  it("dispatch requires both separately attributed approvals", () => {
    const t = tr();
    advanceTestTransfer(t.id);
    expect(() => advanceTestTransfer(t.id)).toThrow(/Both/);
    expect(() => approveTestTransfer(t.id, "M02_MANAGER", "U-S02")).toThrow(/cannot give/);
    expect(() => approveTestTransfer(t.id, "SUPER_ADMIN", "U-M02")).toThrow(/cannot give/);
    approveTestTransfer(t.id, "SUPER_ADMIN", "U-OWN");
    expect(() => approveTestTransfer(t.id, "SUPER_ADMIN", "U-OWN")).toThrow(/already/);
    expect(() => advanceTestTransfer(t.id)).toThrow(/Both/);
  });
  it("destination stock appears only after complete scan; incomplete scan and foreign codes are blocked", () => {
    const q0 = getTestState().accessories.find((a) => a.id === "AC-002")!.quantity;
    const t = tr();
    toReceipt(t.id);
    expect(phone("PH-001").status).toBe("In transit");
    expect(phone("PH-001").store).toBe("M01");
    expect(getTestState().accessories.find((a) => a.id === "AC-002")!.quantity).toBe(q0 - 2);
    scanTestTransfer(t.id, phone("PH-001").imei);
    expect(() => advanceTestTransfer(t.id)).toThrow(/Partial receipt is blocked/);
    expect(() => scanTestTransfer(t.id, "350000000000071")).toThrow(/not on this transfer/);
    expect(() => scanTestTransfer(t.id, phone("PH-001").imei)).toThrow(/Excess/);
    const code = getTestState().transfers[0]!.lines[1]!.code;
    scanTestTransfer(t.id, code);
    scanTestTransfer(t.id, code);
    advanceTestTransfer(t.id);
    expect(phone("PH-001")).toMatchObject({ store: "M02", status: "Available" });
    const dest = getTestState().accessories.find((a) => a.code === code && a.store === "M02")!;
    expect(dest.quantity).toBe(2);
    expect(dest.amount).toBeUndefined();
    expect(
      getTestState()
        .movements.filter((m) => m.reference === t.id)
        .map((m) => m.quantity)
        .sort(),
    ).toEqual([-2, 2]);
  });
});

describe("debts, credit requests and repayments", () => {
  beforeEach(() => {
    resetTestWorkspace();
    openTestShift("M01", "Test seller 001", "0");
  });
  it("credit request draft keeps stock and cash unchanged and computes exact remainder", () => {
    const shift = openShiftFor("M01")!.id;
    const before = expectedCash(shift);
    const d = saveCreditRequestDraft({
      store: "M01",
      customerId: "C-001",
      lines: [{ id: "PH-002", quantity: 1 }],
      paid: "26000.50",
      dueDate: "2026-12-31",
      authorizationReference: "AUTH-1",
    });
    expect(d.amount).toBe("99999.50");
    expect(phone("PH-002").status).toBe("Available");
    expect(expectedCash(shift)).toBe(before);
    expect(() =>
      saveCreditRequestDraft({
        store: "M01",
        customerId: "WALK-IN",
        lines: [{ id: "PH-002", quantity: 1 }],
        paid: "0",
        dueDate: "2026-12-31",
        authorizationReference: "A",
      }),
    ).toThrow(/registered customer/);
    expect(() =>
      saveCreditRequestDraft({
        store: "M01",
        customerId: "C-003",
        lines: [{ id: "PH-002", quantity: 1 }],
        paid: "0",
        dueDate: "2026-12-31",
        authorizationReference: "A",
      }),
    ).toThrow(/selected store/);
  });
  it("partial repayment preview reduces outstanding exactly and overpayment is rejected", () => {
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
    expect(debtBalance(d.id)).toBe("59999.75");
    expect(() =>
      saveRepaymentDraftChecked(d.id, {
        amount: "59999.76",
        date: "2026-11-06",
        method: "Cash",
        reference: "R-2",
        authorizationReference: "A",
      }),
    ).toThrow(/exceeds outstanding/);
    expect(() =>
      saveRepaymentDraftChecked(d.id, {
        amount: "1",
        date: "2026-11-06",
        method: "Cash",
        reference: "R-1",
        authorizationReference: "A",
      }),
    ).toThrow(/already used/);
  });
  it("a fully paid test cash sale cannot be converted into a debt; unknown sales are rejected", () => {
    const s = recordTestSale({
      key: "k1",
      store: "M01",
      lines: [{ id: "PH-002", quantity: 1 }],
      customerId: "C-001",
      customerName: "C",
      tender: "Cash",
      paid: "126000",
    });
    expect(() =>
      saveDebtDraftChecked({
        customerId: "C-001",
        store: "M01",
        saleReference: s.id,
        amount: "1000",
        dueDate: "2026-12-01",
        authorizationReference: "A",
        notes: "",
      }),
    ).toThrow(/fully paid/);
    expect(() =>
      saveDebtDraftChecked({
        customerId: "C-001",
        store: "M01",
        saleReference: "S-NOPE",
        amount: "1000",
        dueDate: "2026-12-01",
        authorizationReference: "A",
        notes: "",
      }),
    ).toThrow(/not found/);
  });
});

describe("facility evidence (M01, bank-settled)", () => {
  beforeEach(() => resetTestWorkspace());
  const f = () =>
    saveFacilityDraft({
      customerId: "C-001",
      employer: "EMP-1",
      store: "M01",
      contractReference: "FC-1",
      contractPrice: "60000",
      months: "3",
      firstMonth: "2026-12",
      installmentAmount: "20000",
      notes: "",
    });
  it("requires an M01 customer and an exact schedule", () => {
    expect(() =>
      saveFacilityDraft({
        customerId: "C-003",
        employer: "E",
        store: "M01",
        contractReference: "X",
        contractPrice: "60000",
        months: "3",
        firstMonth: "2026-12",
        installmentAmount: "20000",
        notes: "",
      }),
    ).toThrow(/M01 customer/);
    expect(() =>
      saveFacilityDraft({
        customerId: "C-001",
        employer: "E",
        store: "M01",
        contractReference: "X",
        contractPrice: "60001",
        months: "3",
        firstMonth: "2026-12",
        installmentAmount: "20000",
        notes: "",
      }),
    ).toThrow(/must match/);
  });
  it("bank remittance needs evidence, is capped per month and never touches cash", () => {
    const fac = f();
    const cashBefore = getTestState().cash.length;
    expect(() =>
      addFacilityEvidence(fac.id, "Bank remittance", {
        month: "2026-12",
        amount: "20000",
        reference: "BK-1",
      }),
    ).toThrow(/bank evidence/);
    addFacilityEvidence(
      fac.id,
      "Bank remittance",
      { month: "2026-12", amount: "15000", reference: "BK-1" },
      "statement.pdf",
    );
    expect(() =>
      addFacilityEvidence(
        fac.id,
        "Bank remittance",
        { month: "2026-12", amount: "5000.01", reference: "BK-2" },
        "s.pdf",
      ),
    ).toThrow(/exceeds/);
    expect(() =>
      addFacilityEvidence(fac.id, "Salary deduction", {
        month: "2027-06",
        amount: "1",
        reference: "D-1",
      }),
    ).toThrow(/outside/);
    addFacilityEvidence(fac.id, "Salary deduction", {
      month: "2026-12",
      amount: "20000",
      reference: "D-1",
    });
    expect(getSession().facilityEvents).toHaveLength(2);
    expect(getTestState().cash.length).toBe(cashBefore);
  });
});

describe("SAV linked to sold units", () => {
  beforeEach(() => {
    resetTestWorkspace();
    openTestShift("M01", "Test seller 001", "0");
  });
  it("requires a real sold unit, blocks duplicates and caps refund reviews without restocking", () => {
    const s = recordTestSale({
      key: "k2",
      store: "M01",
      lines: [{ id: "PH-002", quantity: 1 }],
      customerId: "C-001",
      customerName: "C",
      tender: "Cash",
      paid: "126000",
    });
    const imei = phone("PH-002").imei;
    const base = {
      customerId: "C-001",
      store: "M01" as const,
      saleReference: s.id,
      imei,
      issue: "Screen",
      requestedAction: "Return" as const,
      documentReference: "DOC",
      notes: "",
    };
    expect(() => saveServiceCase({ ...base, saleReference: "TS-9999" })).toThrow(/not found/);
    expect(() => saveServiceCase({ ...base, imei: "350000000000061" })).toThrow(/not found/);
    expect(() => saveServiceCase({ ...base, store: "M02" })).toThrow(/not found/);
    const c = saveServiceCase(base);
    expect(() => saveServiceCase(base)).toThrow(/already exists/);
    addRefundReview(c.id, {
      amount: "100000",
      reference: "RF-1",
      authorizationReference: "A",
      reason: "r",
    });
    expect(() =>
      addRefundReview(c.id, {
        amount: "26000.01",
        reference: "RF-2",
        authorizationReference: "A",
        reason: "r",
      }),
    ).toThrow(/exceeds/);
    expect(() =>
      addRefundReview(c.id, {
        amount: "1",
        reference: "RF-1",
        authorizationReference: "A",
        reason: "r",
      }),
    ).toThrow(/already used/);
    addServiceEvent(c.id, { stage: "Closed draft", note: "n", documentReference: "d" });
    expect(() =>
      addServiceEvent(c.id, { stage: "Ready", note: "n", documentReference: "d" }),
    ).toThrow(/closed/);
    expect(phone("PH-002").status).toBe("Sold");
  });
});
