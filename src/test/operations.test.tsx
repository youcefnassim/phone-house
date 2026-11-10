import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import {
  phoneDraftSchema,
  accessoryDraftSchema,
  cashDiscrepancy,
  validatePhoneIdentity,
  documentPolicy,
  drawerFor,
  paymentDraftSchema,
  validatePaymentDraft,
  paymentChange,
  validateAccessoryIdentity,
} from "@/domain/operations";
import { operationsDemo } from "@/data/operations-demo";
import { stock } from "@/data/demo";
import { addToCart } from "@/domain/erp";
import { OperationDraftForm } from "@/components/erp/operation-ui";
import { ErpProvider } from "@/components/erp/context";

const phone = {
  name: "Synthetic model",
  brand: "Synthetic brand",
  store: "M01",
  condition: "USED",
  packaging: "NO_BOX",
  imei1: "000000000000091",
  imei2: "",
  serial: "",
  color: "Blue",
  storage: "128 GB",
  battery: "89",
  salePrice: "100.01",
  barcode: "DEMO099",
  remarks: "",
};
const accessory = {
  name: "Synthetic case",
  sku: "DEMO-CASE",
  category: "Cases",
  variant: "Blue",
  compatibility: "Synthetic model",
  barcode: "DEMOCASE",
  store: "M01",
  quantity: "7",
  reference: "DEMO-RECV",
  remarks: "",
};
afterEach(cleanup);
describe("Operational wave 02 frontend validation", () => {
  it("preserves phone sale prices as exact decimal strings", () => {
    expect(phoneDraftSchema.parse(phone).salePrice).toBe("100.01");
    expect(phoneDraftSchema.safeParse({ ...phone, salePrice: "100.001" }).success).toBe(false);
  });
  it("requires an explicit bank reference and exact allocation", () => {
    expect(
      paymentDraftSchema.safeParse({ tender: "Bank", amount: "100.01", reference: "" }).success,
    ).toBe(false);
    expect(
      validatePaymentDraft({ tender: "Bank", amount: "100.02", reference: "DEMO-BANK" }, "100.01"),
    ).toBeDefined();
    expect(
      validatePaymentDraft({ tender: "Bank", amount: "100.01", reference: "DEMO-BANK" }, "100.01"),
    ).toBeUndefined();
  });
  it("blocks underpayments without inventing credit terms", () => {
    expect(
      validatePaymentDraft({ tender: "Cash", amount: "100", reference: "" }, "100.01"),
    ).toBeDefined();
  });
  it("calculates cash change without rounding", () => {
    expect(paymentChange({ tender: "Cash", amount: "200", reference: "" }, "100.01")).toBe("99.99");
  });
  it("receives an existing SKU without allowing a conflicting new identity", () => {
    const parsed = accessoryDraftSchema.parse(accessory);
    const records = [{ sku: "DEMO-CASE", barcode: "DEMOCASE" }];
    expect(validateAccessoryIdentity(parsed, records)).toBeDefined();
    expect(validateAccessoryIdentity(parsed, records, "DEMO-CASE")).toBeUndefined();
    expect(validateAccessoryIdentity({ ...parsed, sku: "OTHER" }, records)).toBeDefined();
  });
  it("keeps NEW/USED independent from box condition", () => {
    expect(
      phoneDraftSchema.safeParse({ ...phone, condition: "NEW", packaging: "NO_BOX" }).success,
    ).toBe(true);
    expect(
      phoneDraftSchema.safeParse({ ...phone, condition: "USED", packaging: "SEALED" }).success,
    ).toBe(true);
  });
  it("rejects malformed and duplicate IMEI identities", () => {
    expect(phoneDraftSchema.safeParse({ ...phone, imei1: "123" }).success).toBe(false);
    expect(phoneDraftSchema.safeParse({ ...phone, imei2: phone.imei1 }).success).toBe(false);
    const parsed = phoneDraftSchema.parse(phone);
    expect(validatePhoneIdentity(parsed, [phone.imei1])).toBeDefined();
  });
  it("accepts optional IMEI2 and rejects battery health beyond 100", () => {
    expect(phoneDraftSchema.safeParse(phone).success).toBe(true);
    expect(phoneDraftSchema.safeParse({ ...phone, battery: "101" }).success).toBe(false);
  });
  it("rejects zero and fractional accessory receiving quantities", () => {
    expect(accessoryDraftSchema.safeParse({ ...accessory, quantity: "0" }).success).toBe(false);
    expect(accessoryDraftSchema.safeParse({ ...accessory, quantity: "1.5" }).success).toBe(false);
    expect(accessoryDraftSchema.parse(accessory).quantity).toBe("7");
  });
  it("represents exactly one physical drawer per store without a daily shift cap", () => {
    expect(operationsDemo.drawers("ALL").map((drawer) => drawer.drawer)).toEqual([
      "DRAWER-M01",
      "DRAWER-M02",
    ]);
    expect(drawerFor("M01")).toBe("DRAWER-M01");
    expect(documentPolicy.drawerPerStore).toBe(1);
    expect(documentPolicy.shiftPerDayLimit).toBeNull();
  });
  it("computes signed cash discrepancy without rounding", () => {
    expect(cashDiscrepancy("41999.99", "42000")).toBe("-0.01");
    expect(cashDiscrepancy("42000.01", "42000")).toBe("0.01");
  });
  it("blocks official receipt issuance and hardware acceptance claims", () => {
    expect(documentPolicy.officialIssuance).toBe(false);
    expect(documentPolicy.receipt).toBe("DRAFT_ONLY");
    expect(documentPolicy.hardwareVerified).toBe(false);
  });
  it("rejects sold phone units from demo checkout", () => {
    const item = stock.find((row) => row.status === "Sold");
    if (!item) throw new Error("Missing sold fixture");
    expect(() => addToCart([], item)).toThrow("not available");
  });
  it("rejects a mixed-store basket and zero accessory stock", () => {
    const first = stock[0];
    const second = stock.find((row) => row.store === "M02");
    const item = stock.find((row) => row.kind === "accessory");
    if (!first || !second || !item || item.kind !== "accessory")
      throw new Error("Missing fixtures");
    expect(() => addToCart(addToCart([], first), second)).toThrow("one store");
    expect(() => addToCart([], { ...item, quantity: 0 })).toThrow("quantity reached");
  });
  it("validates receiving form before delivering an isolated draft", () => {
    const saved: unknown[] = [];
    render(
      <ErpProvider>
        <OperationDraftForm
          title="Receiving test"
          fields={Object.keys(accessory).map((name) => ({ name, label: name }))}
          schema={accessoryDraftSchema}
          onSave={(value) => saved.push(value)}
          onCancel={() => {}}
        />
      </ErpProvider>,
    );
    fireEvent.submit(screen.getByRole("form", { name: "Receiving test" }));
    expect(saved).toHaveLength(0);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    Object.entries(accessory).forEach(([name, value]) =>
      fireEvent.change(screen.getByLabelText(name), { target: { value } }),
    );
    fireEvent.submit(screen.getByRole("form", { name: "Receiving test" }));
    expect(saved).toEqual([accessory]);
    expect(operationsDemo.accessories("M01").find((row) => row.id === "AC-001")?.quantity).toBe(20);
  });
});
