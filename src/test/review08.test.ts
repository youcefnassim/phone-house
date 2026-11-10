import { describe, expect, it, vi } from "vitest";
import {
  transactionPayloads,
  transactionEnvelope,
  transactionVersion,
} from "@/domain/transaction-contracts";
import { physicalPhoneSchema } from "@/domain/inventory-contracts";
import { parsePostedCommand } from "@/domain/command-results";
import { prepareBlockedOperation } from "@/domain/command-capabilities";
import { ownerFinanceSchema } from "@/domain/backend";
import { prepareAuthenticatedGateway } from "@/backend/command-gateway.server";
const id = "ae523afb-45e6-4c28-a214-c00a7d18f530";
const phone = {
  store: "M01",
  modelId: id,
  variantId: id,
  purchaseId: id,
  supplierId: id,
  imei1: "000000000000099",
  imei2: "000000000000098",
  serial: "Synthetic",
  barcode: "UNIT-01",
  condition: "USED",
  packaging: "NO_BOX",
  color: "Blue",
  storage: "256 GB",
  batteryHealth: 87,
  conditionRemarks: "Surface mark",
  documentReference: "SYNTHETIC",
};
describe("Review08 local contract rules, not database acceptance", () => {
  it("retains all approved physical attributes", () =>
    expect(transactionPayloads["phone.intake"].parse(phone)).toEqual(phone));
  it("requires authenticated purchase linkage identifiers", () => {
    const { purchaseId, ...missing } = phone;
    expect(transactionPayloads["phone.intake"].safeParse(missing).success).toBe(false);
  });
  it("keeps unavailable battery health explicitly unknown", () =>
    expect(
      transactionPayloads["phone.intake"].parse({ ...phone, batteryHealth: null }).batteryHealth,
    ).toBeNull());
  it("keeps box status separate from condition", () =>
    expect(
      transactionPayloads["phone.intake"].parse({
        ...phone,
        condition: "NEW",
        packaging: "OPEN_BOX",
      }).packaging,
    ).toBe("OPEN_BOX"));
  it("rejects duplicate IMEI slots", () =>
    expect(
      transactionPayloads["phone.intake"].safeParse({ ...phone, imei2: phone.imei1 }).success,
    ).toBe(false));
  it("rejects submitted purchase cost", () =>
    expect(
      transactionPayloads["phone.intake"].safeParse({ ...phone, unitCost: "0.00" }).success,
    ).toBe(false));
  it("preserves unknown owner costs instead of zero", () =>
    expect(
      ownerFinanceSchema.parse({ purchaseId: id, unitCost: null, obligation: null, paid: "0" })
        .unitCost,
    ).toBeNull());
  it("rejects old production envelope versions", () =>
    expect(
      transactionEnvelope.safeParse({
        contractVersion: "2026-11-review05",
        idempotencyKey: "review08-key-00001",
        clientRequestId: id,
        payload: phone,
      }).success,
    ).toBe(false));
  it("rejects financial result extras", () =>
    expect(() =>
      parsePostedCommand("phone.intake", {
        ok: true,
        transactionId: id,
        idempotencyKey: "review08-key-00001",
        replayed: false,
        data: { phoneId: id, receiptId: id, cost: "80.00" },
      }),
    ).toThrow());
  it("rejects numeric rather than decimal-string money results", () =>
    expect(() =>
      parsePostedCommand("pos.checkout", {
        ok: true,
        transactionId: id,
        idempotencyKey: "review08-key-00001",
        replayed: false,
        data: { saleId: id, total: 100.01, change: "0.00" },
      }),
    ).toThrow());
  it("rejects blind close discrepancy results", () =>
    expect(() =>
      parsePostedCommand("cash.shift.close", {
        ok: true,
        transactionId: id,
        idempotencyKey: "review08-key-00001",
        replayed: false,
        data: { shiftId: id, state: "CLOSED", countedAmount: "1.00", discrepancy: "0.01" },
      }),
    ).toThrow());
  it("blocks unresolved expense posting even with valid inputs", () =>
    expect(
      prepareBlockedOperation("expense.post", {
        store: "M01",
        amount: "1.00",
        evidenceReference: "S",
        description: "S",
      }),
    ).toEqual({
      ok: false,
      kind: "POLICY_UNCONFIGURED",
      operation: "expense.post",
      posted: false,
    }));
  it("blocks financial reversal rather than inventing accounting policy", () =>
    expect(
      prepareBlockedOperation("journal.reverse", {
        store: "M01",
        journalId: id,
        reason: "S",
        evidenceReference: "S",
      }).posted,
    ).toBe(false));
  it("requires M01 for facility bank allocation", () =>
    expect(() =>
      prepareBlockedOperation("facility.bank.allocate", {
        store: "M02",
        installmentId: id,
        amount: "1.00",
        bankReference: "S",
      }),
    ).toThrow());
  it("rejects fabricated receiving identity before RPC", async () => {
    const rpc = vi.fn();
    const g = prepareAuthenticatedGateway({ getVerifiedUser: async () => ({ id }), rpc });
    await g.execute({
      operation: "phone.intake",
      request: {
        contractVersion: transactionVersion,
        idempotencyKey: "review08-key-00001",
        clientRequestId: id,
        payload: { ...phone, receivedBy: id },
      },
    });
    expect(rpc).not.toHaveBeenCalled();
  });
  it("does not mislabel a malformed committed response as invalid input", async () => {
    const g = prepareAuthenticatedGateway({
      getVerifiedUser: async () => ({ id }),
      rpc: async () => ({
        data: {
          ok: true,
          transactionId: id,
          idempotencyKey: "review08-key-00001",
          replayed: false,
          data: { phoneId: id },
        },
        error: null,
      }),
    });
    expect(
      await g.execute({
        operation: "phone.intake",
        request: {
          contractVersion: transactionVersion,
          idempotencyKey: "review08-key-00001",
          clientRequestId: id,
          payload: phone,
        },
      }),
    ).toEqual({
      ok: false,
      kind: "BACKEND_ERROR",
      reason: "RESPONSE_CONTRACT_INVALID_OUTCOME_UNKNOWN_RETAIN_IDEMPOTENCY_KEY",
      retrySafe: false,
    });
  });
});
