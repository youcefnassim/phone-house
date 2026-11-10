import { describe, it, expect, vi } from "vitest";
import {
  transactionPayloads,
  transactionVersion,
  approvedFacilitySchedule,
  exactMoney,
} from "@/domain/transaction-contracts";
import { prepareAuthenticatedGateway, classifySqlError } from "@/backend/command-gateway.server";
import { facilitySchedule } from "@/domain/business";
const id = "ae523afb-45e6-4c28-a214-c00a7d18f530";
const checkout = {
  store: "M01",
  shiftId: id,
  customerId: id,
  lines: [{ itemId: id, kind: "phone", quantity: "1" }],
  tender: "Cash",
  tenderedAmount: "0.01",
};
const request = {
  contractVersion: transactionVersion,
  idempotencyKey: "review07-key-0001",
  clientRequestId: id,
  payload: checkout,
};
describe("Review07 production rules (local, not PostgreSQL acceptance)", () => {
  it("rejects forged seller identity", () =>
    expect(
      transactionPayloads["pos.checkout"].safeParse({ ...checkout, sellerId: id }).success,
    ).toBe(false));
  it("rejects browser unit prices", () =>
    expect(
      transactionPayloads["pos.checkout"].safeParse({
        ...checkout,
        lines: [{ ...checkout.lines[0], unitPrice: "0.01" }],
      }).success,
    ).toBe(false));
  it("rejects forged operational role", () =>
    expect(
      transactionPayloads["cash.shift.open"].safeParse({
        store: "M01",
        drawerId: id,
        openingFloat: "0.00",
        role: "SUPER_ADMIN",
      }).success,
    ).toBe(false));
  it("permits an exact zero opening float", () =>
    expect(
      transactionPayloads["cash.shift.open"].safeParse({
        store: "M01",
        drawerId: id,
        openingFloat: "0.00",
      }).success,
    ).toBe(true));
  it("rejects third decimal precision instead of rounding", () =>
    expect(exactMoney.safeParse("1.001").success).toBe(false));
  it("keeps high precision decimal strings without IEEE754 conversion", () =>
    expect(exactMoney.parse("9007199254740993.01")).toBe("9007199254740993.01"));
  it("supports explicit unequal installments summing exactly", () =>
    expect(
      approvedFacilitySchedule.safeParse({
        contractPrice: "100.01",
        installments: [
          { month: "2026-11", amount: "50.00" },
          { month: "2026-12", amount: "50.01" },
        ],
      }).success,
    ).toBe(true));
  it("rejects an installment sum differing by one cent", () =>
    expect(
      approvedFacilitySchedule.safeParse({
        contractPrice: "100.01",
        installments: [
          { month: "2026-11", amount: "50.00" },
          { month: "2026-12", amount: "50.00" },
        ],
      }).success,
    ).toBe(false));
  it("uses explicit amounts rather than projecting uniform installments", () =>
    expect(
      facilitySchedule({
        customerId: id,
        store: "M01",
        employer: "Synthetic",
        contractReference: "S",
        contractPrice: "100.01",
        months: "2",
        firstMonth: "2026-11",
        installmentAmount: "50.00",
        notes: "",
        installments: [
          { month: "2026-11", amount: "50.00" },
          { month: "2026-12", amount: "50.01" },
        ],
      })[1]?.amount,
    ).toBe("50.01"));
  it.each([
    ["42501", "AUTHORIZATION"],
    ["22023", "VALIDATION"],
    ["23505", "CONFLICT"],
    ["23514", "CONFLICT"],
    ["40001", "RETRYABLE"],
    ["40P01", "RETRYABLE"],
    ["08006", "BACKEND_UNAVAILABLE"],
    ["XX000", "BACKEND_ERROR"],
  ])("classifies SQLSTATE %s as %s", (code, kind) => expect(classifySqlError(code)).toBe(kind));
  it("returns retryable serialization error without raw details", async () => {
    const g = prepareAuthenticatedGateway({
      getVerifiedUser: async () => ({ id }),
      rpc: async () => ({ data: null, error: { code: "40001" } }),
    });
    expect(await g.execute({ operation: "pos.checkout", request })).toEqual({
      ok: false,
      kind: "RETRYABLE",
      reason: "RETRYABLE",
      retrySafe: true,
    });
  });
  it("does not RPC for invalid input", async () => {
    const rpc = vi.fn();
    const g = prepareAuthenticatedGateway({ getVerifiedUser: async () => ({ id }), rpc });
    expect(
      (
        await g.execute({
          operation: "pos.checkout",
          request: { ...request, payload: { ...checkout, sellerId: id } },
        })
      ).ok,
    ).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });
});
