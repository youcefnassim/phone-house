import { beforeEach, describe, expect, it } from "vitest";
import { activeReviewIdentities, reviewIdentities } from "@/domain/review-staff";
import {
  resetTestWorkspace,
  getTestState,
  commitTest,
  migrateReviewWorkspace,
  setReviewActor,
  setTestSeller,
  openTestShift,
  blindCloseTestShift,
  reviewTestClose,
  openShiftFor,
  expectedCash,
  recordTestSale,
  addTestCashMovement,
  addTestPhone,
  receiveTestAccessory,
  drawerOf,
  type SaleRequest,
} from "@/data/test-workspace";
import { getSession } from "@/data/session-store";
import { canPreviewOwnerFinance } from "@/domain/business";
import {
  createTestTransfer,
  advanceTestTransfer,
  approveTestTransfer,
  saveCreditRequestDraft,
} from "@/data/test-workflows";
import { phoneDraftSchema, paymentDraftSchema } from "@/domain/operations";
const request = (key: string, store: "M01" | "M02" = "M01"): SaleRequest => ({
  key,
  store,
  lines: [{ id: store === "M01" ? "AC-001" : "AC-005", quantity: 1 }],
  customerId: "WALK-IN",
  customerName: "Walk-in",
  tender: "Cash",
  paid: store === "M01" ? "1800" : "1500",
});
beforeEach(() => resetTestWorkspace());
describe("approved local staff and direct closeout", () => {
  it("2026-11-09 flexible roles preserve the existing roster without silently activating legacy identities", () => {
    expect(activeReviewIdentities().map((u) => [u.id, u.role, u.stores])).toEqual([
      ["U-S01", "SELLER", ["M01"]],
      ["U-S03", "SELLER", ["M01"]],
      ["U-M02", "MANAGER", ["M02"]],
      ["U-OWN", "SUPER_ADMIN", ["M01", "M02"]],
    ]);
    expect(reviewIdentities.find((u) => u.id === "U-M01")?.active).toBe(false);
    expect(reviewIdentities.find((u) => u.id === "U-S02")?.active).toBe(false);
  });
  it("idempotently migrates current choices without rewriting historical sale, cash or audit", () => {
    openTestShift("M02", "Test manager M02", "0");
    const sale = recordTestSale(request("legacy", "M02"));
    const old = {
      ...getTestState(),
      sellers: { M01: "Test manager M01", M02: "Test seller 002" },
      sales: [{ ...sale, seller: "Test seller 002" }],
    };
    const audit = structuredClone(getSession().audit);
    const next = migrateReviewWorkspace(old);
    expect(next.sellers).toEqual({ M01: "Test seller 001", M02: "Test manager M02" });
    expect(next.sales).toEqual(old.sales);
    expect(next.cash).toEqual(old.cash);
    expect(next.shifts).toEqual(old.shifts);
    expect(getSession().audit).toEqual(audit);
    expect(migrateReviewWorkspace(next)).toEqual(next);
    commitTest(next);
    expect(getTestState().sales[0]?.seller).toBe("Test seller 002");
  });
  it("M02 Manager receives phones/accessories and checks out, without owner costs", () => {
    setReviewActor("U-M02");
    const p = addTestPhone(
      phoneDraftSchema.parse({
        name: "Android",
        brand: "Any brand",
        store: "M02",
        condition: "NEW",
        packaging: "SEALED",
        imei1: "490154203237518",
        salePrice: "100.01",
      }),
    );
    receiveTestAccessory({
      name: "Silicone case",
      sku: "AC-005",
      category: "Cases",
      variant: "v",
      compatibility: "c",
      barcode: "AC000005",
      store: "M02",
      quantity: "2",
      reference: "receive",
      remarks: "",
    });
    openTestShift("M02", "Test manager M02", "0");
    expect(
      recordTestSale({
        ...request("m2", "M02"),
        lines: [{ id: p.id, quantity: 1 }],
        customerId: "C-003",
        paid: "100.01",
      }).operatorId,
    ).toBe("U-M02");
    expect(canPreviewOwnerFinance("MANAGER")).toBe(false);
  });
  it("M01 seller cannot receive, open, sell or move cash at M02", () => {
    setReviewActor("U-S01");
    expect(() => openTestShift("M02", "Test manager M02", "0")).toThrow(/store/);
    expect(() => recordTestSale(request("wrong", "M02"))).toThrow(/store/);
    expect(() => addTestCashMovement("M02", "CASH_IN", "1", "x")).toThrow(/store/);
    expect(() =>
      addTestPhone(
        phoneDraftSchema.parse({
          name: "X",
          brand: "X",
          store: "M02",
          condition: "NEW",
          packaging: "SEALED",
          imei1: "490154203237518",
          salePrice: "1",
        }),
      ),
    ).toThrow(/store/);
  });
  it("both M01 sellers share one drawer and retain distinct sale/operator attribution", () => {
    setReviewActor("U-S01");
    const shift = openTestShift("M01", "Test seller 001", "0");
    const a = recordTestSale(request("s1"));
    setTestSeller("M01", "Test seller 003");
    const b = recordTestSale(request("s3"));
    expect([a.operatorId, b.operatorId]).toEqual(["U-S01", "U-S03"]);
    expect(a.shiftId).toBe(shift.id);
    expect(b.shiftId).toBe(shift.id);
    expect(getTestState().shifts).toHaveLength(1);
    expect(drawerOf("M01")).toBe("DRAWER-M01");
    expect(drawerOf("M02")).toBe("DRAWER-M02");
  });
  for (const [id, name] of [
    ["U-S01", "Test seller 001"],
    ["U-S03", "Test seller 003"],
  ])
    it(`${id} closes immediately with pending retrospective review`, () => {
      setReviewActor(id ?? "");
      const s = openTestShift("M01", name ?? "", "100");
      const c = blindCloseTestShift("M01", "99.99", { shiftId: s.id });
      expect(c.status).toBe("CLOSED");
      expect(c.closedById).toBe(id);
      expect(c.reviewStatus).toBe("REVIEW_PENDING");
      expect(c.expectedAtClose).toBe("100.00");
      expect(c.discrepancy).toBe("-0.01");
      expect(openShiftFor("M01")).toBeUndefined();
    });
  it("only owner reviews CLOSED sessions, retaining immutable close snapshot and flag", () => {
    setReviewActor("U-S01");
    const s = openTestShift("M01", "Test seller 001", "100");
    expect(() => reviewTestClose(s.id, false, "", "U-S01")).toThrow(/Super Admin/);
    const c = blindCloseTestShift("M01", "90");
    setReviewActor("U-OWN");
    const r = reviewTestClose(c.id, true, "Ten short", "U-OWN");
    const { ownerReview, reviewStatus, ...snapshot } = r;
    const { reviewStatus: _pending, ...original } = c;
    expect(snapshot).toEqual(original);
    expect(ownerReview?.actorId).toBe("U-OWN");
    expect(reviewStatus).toBe("OWNER_REVIEWED_FLAGGED");
    expect(() => reviewTestClose(c.id, false, "", "U-OWN")).toThrow(/already/);
    expect(openShiftFor("M01")).toBeUndefined();
  });
  it("owner review cannot precede close, and no-issue review never changes discrepancy", () => {
    const s = openTestShift("M01", "Test seller 001", "1");
    expect(() => reviewTestClose(s.id, false, "", "U-OWN")).toThrow(/before/);
    const c = blindCloseTestShift("M01", "0");
    const r = reviewTestClose(c.id, false, "Acknowledged", "U-OWN");
    expect(r.discrepancy).toBe("-1.00");
    expect(r.reviewStatus).toBe("OWNER_REVIEWED_NO_ISSUE");
  });
  it("M02 manager directly closes with no required owner review", () => {
    setReviewActor("U-M02");
    openTestShift("M02", "Test manager M02", "10");
    const s = blindCloseTestShift("M02", "10");
    expect(s.status).toBe("CLOSED");
    expect(s.closedById).toBe("U-M02");
    expect(s.reviewStatus).toBeUndefined();
  });
  it("rejects sale into closed session and stale close/movement after explicit new shift", () => {
    const s = openTestShift("M01", "Test seller 001", "0");
    blindCloseTestShift("M01", "0", { shiftId: s.id });
    expect(() => recordTestSale(request("closed"))).toThrow(/shift/);
    expect(() => blindCloseTestShift("M01", "0", { shiftId: s.id })).toThrow();
    openTestShift("M01", "Test seller 001", "0");
    expect(() => recordTestSale({ ...request("stale"), shiftId: s.id })).toThrow(/changed/);
    expect(() => blindCloseTestShift("M01", "0", { shiftId: s.id })).toThrow(/changed/);
    expect(() => addTestCashMovement("M01", "CASH_IN", "1", "r", { shiftId: s.id })).toThrow(
      /changed/,
    );
    expect(getTestState().sales).toHaveLength(0);
  });
  it("rejects double cash movement and double sale without extra postings", () => {
    const s = openTestShift("M01", "Test seller 001", "0");
    addTestCashMovement("M01", "CASH_IN", "1", "r", { key: "once" });
    expect(() => addTestCashMovement("M01", "CASH_IN", "1", "r2", { key: "once" })).toThrow(
      /already/,
    );
    const req = request("once-sale");
    recordTestSale(req);
    expect(() => recordTestSale(req)).toThrow(/already/);
    expect(expectedCash(s.id)).toBe("1801.00");
    expect(getTestState().cash.filter((c) => c.kind === "SALE")).toHaveLength(1);
  });
  it("rejects cross-store session ID and only net cash tender reaches physical drawer", () => {
    const m1 = openTestShift("M01", "Test seller 001", "0");
    const m2 = openTestShift("M02", "Test manager M02", "0");
    expect(() => recordTestSale({ ...request("cross"), shiftId: m2.id })).toThrow(/changed/);
    recordTestSale({ ...request("bank"), tender: "Bank" });
    recordTestSale({ ...request("cash"), paid: "3000" });
    expect(expectedCash(m1.id)).toBe("1800.00");
    expect(expectedCash(m2.id)).toBe("0.00");
  });
  it("seller cannot approve; owner and M02 manager remain independent required actors", () => {
    const t = createTestTransfer({
      from: "M01",
      to: "M02",
      reference: "two",
      lines: [{ id: "PH-001", quantity: 1 }],
    });
    advanceTestTransfer(t.id);
    setReviewActor("U-S01");
    expect(() => approveTestTransfer(t.id, "SUPER_ADMIN", "U-OWN")).toThrow();
    setReviewActor("U-OWN");
    expect(() => approveTestTransfer(t.id, "M02_MANAGER", "U-M01")).toThrow();
    approveTestTransfer(t.id, "SUPER_ADMIN", "U-OWN");
    expect(() => advanceTestTransfer(t.id)).toThrow(/Both/);
    approveTestTransfer(t.id, "M02_MANAGER", "U-M02");
    expect(advanceTestTransfer(t.id).stage).toBe("DISPATCH");
  });
  it("credit remains a draft with no cash/stock posting and discounts are not accepted as payment authority", () => {
    openTestShift("M01", "Test seller 001", "0");
    const cash = structuredClone(getTestState().cash);
    const qty = getTestState().accessories.find((a) => a.id === "AC-001")?.quantity;
    const d = saveCreditRequestDraft({
      store: "M01",
      customerId: "C-001",
      lines: [{ id: "AC-001", quantity: 1 }],
      paid: "0",
      dueDate: "2026-12-01",
      authorizationReference: "draft-only",
    });
    expect(d.source).toBe("Session draft");
    expect(getTestState().cash).toEqual(cash);
    expect(getTestState().accessories.find((a) => a.id === "AC-001")?.quantity).toBe(qty);
    expect(() => recordTestSale({ ...request("discount"), paid: "1799.99" })).toThrow(
      /unconfigured/,
    );
    expect(
      paymentDraftSchema.safeParse({ tender: "Credit", amount: "0", reference: "x" }).success,
    ).toBe(false);
  });
});
