import { afterEach, describe, it, expect, vi } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { OperationDraftForm } from "@/components/erp/operation-ui";
import { ErpProvider } from "@/components/erp/context";
import { phoneDraftSchema, paymentDraftSchema, validatePaymentDraft } from "@/domain/operations";
import { canPreviewOwnerFinance } from "@/domain/business";
import { navigation } from "@/components/erp/shell";
const phone = {
  name: "Samsung Review",
  brand: "Samsung",
  store: "M01",
  condition: "USED",
  packaging: "NO_BOX",
  imei1: "359876543210991",
  imei2: "490154203237518",
  serial: "SYNTHETIC-991",
  color: "Black",
  storage: "128 GB",
  battery: "89",
  salePrice: "100.01",
  barcode: "RETAIL991",
  remarks: "Synthetic",
};
afterEach(cleanup);
describe("Everyday disclosure preserves operations", () => {
  it("keeps all 18 ERP destinations and pins the five daily workflows", () => {
    const paths = navigation.flatMap((g) => g.items.map((i) => i.path));
    expect(new Set(paths).size).toBe(19);
    expect(navigation[0]?.items.map((i) => i.path)).toEqual([
      "/",
      "/pos",
      "/stock/phones",
      "/stock/accessories",
      "/cash",
    ]);
    expect(paths).toContain("/facility");
    expect(paths).toContain("/audit");
  });
  it("submits optional phone identities unchanged while their disclosure is closed", () => {
    const save = vi.fn();
    render(
      <ErpProvider>
        <OperationDraftForm
          title="Phone"
          schema={phoneDraftSchema}
          fields={Object.keys(phone).map((name) => ({ name, label: name }))}
          optionalFields={["imei2", "serial", "battery", "remarks"]}
          defaults={phone}
          onSave={save}
          onCancel={() => {}}
        />
      </ErpProvider>,
    );
    fireEvent.submit(screen.getByRole("form", { name: "Phone" }));
    expect(save).toHaveBeenCalledWith(phone);
  });
  it("expands and focuses an invalid optional IMEI2 without delivering a phone", async () => {
    const save = vi.fn();
    render(
      <ErpProvider>
        <OperationDraftForm
          title="Phone"
          schema={phoneDraftSchema}
          fields={Object.keys(phone).map((name) => ({ name, label: name }))}
          optionalFields={["imei2", "serial"]}
          defaults={{ ...phone, imei2: "123" }}
          onSave={save}
          onCancel={() => {}}
        />
      </ErpProvider>,
    );
    fireEvent.submit(screen.getByRole("form", { name: "Phone" }));
    await waitFor(() => expect(screen.getByLabelText("imei2")).toHaveFocus());
    expect(screen.getByLabelText("imei2").closest("details")?.open).toBe(true);
    expect(save).not.toHaveBeenCalled();
  });
  it("rejects underpayment in the simplified payment form", () => {
    const save = vi.fn();
    render(
      <ErpProvider>
        <OperationDraftForm
          title="Payment"
          schema={paymentDraftSchema}
          fields={[
            { name: "tender", label: "method", options: ["Cash", "Bank"] },
            { name: "amount", label: "amount" },
            { name: "reference", label: "reference" },
          ]}
          optionalFields={["reference"]}
          defaults={{ tender: "Cash", amount: "100", reference: "" }}
          extraValidate={(v) => validatePaymentDraft(v, "100.01")}
          onSave={save}
          onCancel={() => {}}
        />
      </ErpProvider>,
    );
    fireEvent.submit(screen.getByRole("form", { name: "Payment" }));
    expect(save).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });
  it("requires a bank reference even when payment options were collapsed", async () => {
    const save = vi.fn();
    render(
      <ErpProvider>
        <OperationDraftForm
          title="Payment"
          schema={paymentDraftSchema}
          fields={[
            { name: "tender", label: "method", options: ["Cash", "Bank"] },
            { name: "amount", label: "amount" },
            { name: "reference", label: "reference" },
          ]}
          optionalFields={["reference"]}
          defaults={{ tender: "Bank", amount: "100.01" }}
          onSave={save}
          onCancel={() => {}}
        />
      </ErpProvider>,
    );
    fireEvent.submit(screen.getByRole("form", { name: "Payment" }));
    await waitFor(() => expect(screen.getByLabelText("reference")).toHaveFocus());
    expect(save).not.toHaveBeenCalled();
  });
  it("preserves owner-only confidential finance preview", () => {
    expect(canPreviewOwnerFinance("SELLER")).toBe(false);
    expect(canPreviewOwnerFinance("MANAGER")).toBe(false);
    expect(canPreviewOwnerFinance("SUPER_ADMIN")).toBe(true);
  });
});
