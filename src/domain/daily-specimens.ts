import { nativeReceipt, type NativeReceipt } from "./native-documents";

/** Pure immutable projection suitable for A4/label presentation. Never calls a
 * repository or mutates a sale. No fiscal fields or approved legal terms. */
export function projectNativeSpecimens(input: NativeReceipt) {
  const receipt = nativeReceipt.parse(input);
  return {
    invoice: { kind: "INVOICE_SPECIMEN" as const, fiscal: false as const, receipt },
    warranties: receipt.warranties
      .filter((w) => w.requested)
      .map((w) => {
        const phone = receipt.lines.find(
          (line) => line.kind === "phone" && line.itemId === w.itemId,
        );
        if (!phone || !receipt.buyer || !w.months || !w.start || !w.end)
          throw new Error("INVALID_WARRANTY_SPECIMEN");
        return {
          kind: "WARRANTY_SPECIMEN" as const,
          legalTermsApproved: false as const,
          saleId: receipt.saleId,
          buyer: receipt.buyer,
          phone,
          months: w.months,
          start: w.start,
          end: w.end,
        };
      }),
    labels: receipt.lines
      .filter((line) => line.barcode)
      .map((line) => ({
        product: line.name,
        reference: line.reference,
        barcode: line.barcode,
        symbology: "CODE128" as const,
      })),
  };
}
