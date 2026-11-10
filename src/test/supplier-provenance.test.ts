import { beforeEach, it, expect } from "vitest";
import {
  resetTestWorkspace,
  addTestPhone,
  receiveTestAccessory,
  getTestState,
  setReviewActor,
  correctSupplierProvenance,
} from "@/data/test-workspace";
import { getSession } from "@/data/session-store";
import {
  receivingSuppliers,
  ownerReceiptHistory,
  ownerSupplierName,
  provenanceCorrections,
} from "@/data/supplier-provenance";
import { canPreviewOwnerFinance } from "@/domain/business";
const phone = (store: "M01" | "M02", serial: string, supplierId?: string) => ({
  name: "Source phone",
  brand: "Source",
  store,
  condition: "NEW" as const,
  packaging: "UNKNOWN" as const,
  imei1: "",
  imei2: "",
  serial,
  color: "",
  storage: "",
  battery: "",
  salePrice: "100",
  barcode: "",
  remarks: "",
  supplierId,
});
const acc = (supplierId?: string) => ({
  name: "Cable",
  sku: "AC-001",
  category: "",
  variant: "",
  compatibility: "",
  barcode: "",
  store: "M01" as const,
  quantity: "2",
  reference: "Delivery",
  remarks: "",
  supplierId,
});
beforeEach(() => resetTestWorkspace());
it("retains supplier A M01 and B M02 on physical units", () => {
  const [a, b] = receivingSuppliers();
  expect(a).toBeDefined();
  expect(b).toBeDefined();
  const one = addTestPhone(phone("M01", "SOURCE-M01", a?.id));
  const two = addTestPhone(phone("M02", "SOURCE-M02", b?.id));
  expect(one.supplierId).toBe(a?.id);
  expect(two.supplierId).toBe(b?.id);
  expect(one.receivedBy).toBe("U-OWN");
});
it("retains both accessory inbound sources, never a timeless SKU supplier", () => {
  const [a, b] = receivingSuppliers();
  receiveTestAccessory(acc(a?.id));
  receiveTestAccessory(acc(b?.id));
  const receipts = ownerReceiptHistory("AC-001");
  expect(receipts).toHaveLength(2);
  expect(receipts.map((r) => r.supplierId)).toEqual([b?.id, a?.id]);
  expect(receipts.map((r) => r.quantity)).toEqual([2, 2]);
  expect(getTestState().accessories.find((a) => a.id === "AC-001")).not.toHaveProperty(
    "supplierId",
  );
});
it("quick-add persists a stable supplier and rejects normalized duplicates", () => {
  const p = addTestPhone({ ...phone("M01", "QUICK"), newSupplierName: " Source   Supplier " });
  expect(getSession().suppliers[0]?.id).toBe(p.supplierId);
  expect(() =>
    addTestPhone({ ...phone("M01", "QUICK2"), newSupplierName: "source supplier" }),
  ).toThrow(/existing supplier/);
  expect(getSession().suppliers).toHaveLength(1);
});
it("unknown supplier rejects without creating stock", () => {
  const n = getTestState().phones.length;
  expect(() => addTestPhone(phone("M01", "UNKNOWN", "missing"))).toThrow(/Unknown supplier/);
  expect(getTestState().phones).toHaveLength(n);
});
it("legacy missing provenance stays absent and new missing is allowed", () => {
  expect(getTestState().phones[0]).not.toHaveProperty("supplierId");
  expect(ownerSupplierName()).toBeUndefined();
  const p = addTestPhone(phone("M01", "MISSING"));
  expect(p.supplierId).toBeUndefined();
});
it("owner correction appends old/new/reason without rewriting original receipt", () => {
  const [a, b] = receivingSuppliers();
  receiveTestAccessory(acc(a?.id));
  const receipt = ownerReceiptHistory("AC-001")[0];
  if (!receipt) throw new Error("receipt missing");
  const before = JSON.stringify(getTestState());
  correctSupplierProvenance("receipt", receipt.id, b?.id ?? "", "Supplier correction");
  expect(JSON.stringify(getTestState())).toBe(before);
  const e = provenanceCorrections(receipt.id)[0];
  expect(JSON.parse(e?.detail ?? "{}")).toMatchObject({
    old: a?.id,
    new: b?.id,
    reason: "Supplier correction",
    operatorId: "U-OWN",
  });
});
it("seller receives own store but cannot read owner history/cost or correct/cross-store", () => {
  setReviewActor("U-S01");
  addTestPhone(phone("M01", "SELLER"));
  expect(() => addTestPhone(phone("M02", "BAD"))).toThrow(/store/);
  expect(() => ownerReceiptHistory("AC-001")).toThrow(/Owner/);
  expect(() => ownerSupplierName()).toThrow(/Owner/);
  expect(() => correctSupplierProvenance("phone", "PH-001", "", "x")).toThrow(/Owner/);
  expect(canPreviewOwnerFinance("SELLER")).toBe(false);
});
it("M02 manager selects provenance without owner finance", () => {
  setReviewActor("U-M02");
  const p = addTestPhone(phone("M02", "MGR", receivingSuppliers()[0]?.id));
  expect(p.receivedBy).toBe("U-M02");
  expect(canPreviewOwnerFinance("MANAGER")).toBe(false);
  expect(() => ownerReceiptHistory("AC-001")).toThrow(/Owner/);
});
