import { describe, it, expect, vi } from "vitest";
import { transactionPayloads, transactionVersion } from "@/domain/transaction-contracts";
import { prepareAuthenticatedGateway } from "@/backend/command-gateway.server";
const id = "00000000-0000-4000-8000-000000000001";
const payload = {
  store: "M01",
  saleId: id,
  saleLineId: id,
  customerId: id,
  imei: "000000000000099",
  issue: "Synthetic inspection",
  requestedAction: "Inspection only",
  documentReference: "SYNTHETIC-1",
};
const envelope = (input: unknown) => ({
  contractVersion: transactionVersion,
  idempotencyKey: "supplier-sav-key-0001",
  clientRequestId: id,
  payload: input,
});
describe("supplier and service typed commands — no database execution", () => {
  it("rejects purchase costs in operational supplier creation", () =>
    expect(
      transactionPayloads["supplier.create"].safeParse({
        store: "M01",
        name: "Synthetic",
        contact: "Synthetic",
        documentReference: "S-1",
        unitCost: "1.00",
      }).success,
    ).toBe(false));
  it("requires the original sale line for a service case", () => {
    const { saleLineId, ...missing } = payload;
    expect(transactionPayloads["sav.case.create"].safeParse(missing).success).toBe(false);
  });
  it("does not accept a service refund amount as an inspection input", () =>
    expect(
      transactionPayloads["sav.case.create"].safeParse({ ...payload, refundAmount: "100.00" })
        .success,
    ).toBe(false));
  it("rejects actor attribution in a service event", () =>
    expect(
      transactionPayloads["sav.event.record"].safeParse({
        store: "M01",
        caseId: id,
        note: "Synthetic",
        documentReference: "S-1",
        recordedBy: id,
      }).success,
    ).toBe(false));
  it("dispatches supplier creation only through the verified-user RPC", async () => {
    const rpc = vi.fn(async () => ({
      data: {
        ok: true,
        transactionId: id,
        idempotencyKey: "supplier-sav-key-0001",
        replayed: false,
        data: { supplierId: id },
      },
      error: null,
    }));
    const gateway = prepareAuthenticatedGateway({ getVerifiedUser: async () => ({ id }), rpc });
    const input = {
      store: "M01",
      name: "Synthetic",
      contact: "Synthetic",
      documentReference: "S-1",
    };
    expect(
      (await gateway.execute({ operation: "supplier.create", request: envelope(input) })).ok,
    ).toBe(true);
    expect(rpc).toHaveBeenCalledWith("command_supplier_create", { request: envelope(input) });
  });
  it("refuses service commands without a verified Auth user", async () => {
    const rpc = vi.fn();
    const gateway = prepareAuthenticatedGateway({ getVerifiedUser: async () => null, rpc });
    expect(
      (await gateway.execute({ operation: "sav.case.create", request: envelope(payload) })).ok,
    ).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });
});
