import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ErpProvider } from "@/components/erp/context";
import { NativeDocumentDialog } from "@/components/erp/native-documents";
import type { NativeReceipt } from "@/domain/native-documents";

const receipt: NativeReceipt = {
  specimen: 1,
  saleId: "immutable-sale",
  store: "M01",
  operator: "s2",
  shift: "shared",
  customerId: "buyer",
  buyer: { name: "Buyer Name", surname: "Buyer", givenName: "Name", contact: null },
  payment: "Cash",
  totalMinor: 10000,
  tenderedMinor: 10000,
  changeMinor: 0,
  bankReference: null,
  soldAt: 1794096000000,
  lines: [
    {
      itemId: "phone",
      kind: "phone",
      quantity: 1,
      unitMinor: 10000,
      name: "Phone",
      reference: "REF",
      barcode: "CODE-1",
      serial: null,
      imei1: "490154203237518",
      imei2: null,
    },
  ],
  warranties: [
    { itemId: "phone", requested: true, months: 3, start: "2026-11-08", end: "2027-02-08" },
  ],
};
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it("native invoice/warranty print uses immutable native DTO, isolated A4 portal and zero record changes", async () => {
  localStorage.setItem("ph-lang", "en");
  const before = JSON.stringify(receipt);
  const print = vi.spyOn(window, "print").mockImplementation(() => {
    expect(document.body.classList.contains("printing-test-document")).toBe(true);
    expect(
      document.querySelector(".test-document-print-root [data-testid=native-document-sheet]"),
    ).not.toBeNull();
  });
  render(
    <ErpProvider>
      <NativeDocumentDialog receipt={receipt} onClose={() => {}} />
    </ErpProvider>,
  );
  fireEvent.click(await screen.findByRole("button", { name: "Print / Save as PDF" }));
  fireEvent.click(screen.getByRole("button", { name: "Warranty specimen" }));
  fireEvent.click(screen.getByRole("button", { name: "Print / Save as PDF" }));
  expect(print).toHaveBeenCalledTimes(2);
  expect(JSON.stringify(receipt)).toBe(before);
  expect(document.body.classList.contains("printing-test-document")).toBe(false);
});
it("explicit NO warranty native sale cannot print a warranty certificate", async () => {
  localStorage.setItem("ph-lang", "en");
  render(
    <ErpProvider>
      <NativeDocumentDialog
        receipt={{ ...receipt, warranties: [{ itemId: "phone", requested: false }] }}
        onClose={() => {}}
      />
    </ErpProvider>,
  );
  expect(await screen.findByRole("button", { name: "Warranty specimen" })).toBeDisabled();
});
