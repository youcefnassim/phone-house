import { describe, it, expect } from "vitest";
import {
  idempotencyKeySchema,
  isRetryable,
  operationContracts,
  posCheckoutRequest,
  phoneIntakeRequest,
  facilityRemittanceRequest,
  type OperationResult,
} from "@/domain/demo/legacy-contracts";

describe("integration contracts", () => {
  it("idempotency keys follow the shared format", () => {
    expect(idempotencyKeySchema.safeParse("chk-2026-11-06-abcdef123456").success).toBe(true);
    expect(idempotencyKeySchema.safeParse("short").success).toBe(false);
    expect(idempotencyKeySchema.safeParse("has spaces in the key value!!").success).toBe(false);
  });
  it("POS checkout requires at least one line and a positive tender", () => {
    expect(
      posCheckoutRequest.safeParse({
        store: "M01",
        shiftId: "SH-1",
        sellerId: "U-3",
        lines: [],
        tender: "Cash",
        tenderedAmount: "100.00",
      }).success,
    ).toBe(false);
    expect(
      posCheckoutRequest.safeParse({
        store: "M01",
        shiftId: "SH-1",
        sellerId: "U-3",
        lines: [{ itemId: "PH-001", kind: "phone", quantity: "1", unitPrice: "189000.00" }],
        tender: "Cash",
        tenderedAmount: "189000.00",
      }).success,
    ).toBe(true);
  });
  it("phone intake enforces 15-digit IMEI1", () => {
    const base = {
      store: "M01",
      model: "Model",
      imei1: "000000000000099",
      imei2: "",
      serial: "",
      barcode: "PH000099",
      condition: "NEW",
      packaging: "SEALED",
      salePrice: "1000.00",
      documentReference: "DOC-1",
    };
    expect(phoneIntakeRequest.safeParse(base).success).toBe(true);
    expect(phoneIntakeRequest.safeParse({ ...base, imei1: "123" }).success).toBe(false);
  });
  it("facility remittance is month-formatted and positive", () => {
    expect(
      facilityRemittanceRequest.safeParse({
        facilityId: "FA-001",
        month: "2026-11",
        amount: "10000.00",
        bankReference: "BANK-1",
        confirmedBy: "U-1",
      }).success,
    ).toBe(true);
    expect(
      facilityRemittanceRequest.safeParse({
        facilityId: "FA-001",
        month: "11/2026",
        amount: "10000.00",
        bankReference: "BANK-1",
        confirmedBy: "U-1",
      }).success,
    ).toBe(false);
  });
  it("only retry-safe conflicts may be retried", () => {
    const conflict: OperationResult<unknown> = {
      ok: false,
      kind: "CONFLICT",
      reason: "stage mismatch",
      retrySafe: true,
    };
    const validation: OperationResult<unknown> = {
      ok: false,
      kind: "VALIDATION",
      issues: [{ path: "amount", message: "Required" }],
      retrySafe: false,
    };
    const auth: OperationResult<unknown> = {
      ok: false,
      kind: "AUTHORIZATION",
      reason: "Forbidden",
      retrySafe: false,
    };
    expect(isRetryable(conflict)).toBe(true);
    expect(isRetryable(validation)).toBe(false);
    expect(isRetryable(auth)).toBe(false);
  });
  it("contract catalogue covers all nine operational groups with invariants and authorization", () => {
    const names = operationContracts.map((c) => c.name);
    for (const expected of [
      "phone.intake",
      "accessory.receiving",
      "pos.checkout",
      "cash.shift",
      "debt.lifecycle",
      "supplier.settlement",
      "transfer.lifecycle",
      "facility.remittance",
      "warranty.case",
    ])
      expect(names).toContain(expected);
    for (const c of operationContracts) {
      expect(c.invariants.length).toBeGreaterThan(0);
      expect(c.authorization.length).toBeGreaterThan(0);
      expect(c.conflictPolicy.length).toBeGreaterThan(0);
    }
  });
});
