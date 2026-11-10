import type { TestSale } from "@/data/test-workspace";
import { minorUnits } from "./erp";
import type { NativeReceipt } from "./native-documents";

/** Immutable local snapshot mapped to the shared print contract, never native storage. */
export function localSaleReceipt(sale: TestSale): NativeReceipt {
  return {
    specimen: 1,
    saleId: sale.id,
    invoiceNumber: sale.invoiceNumber ?? null,
    publicRef: sale.publicRef ?? null,
    store: sale.store,
    operator: sale.seller,
    shift: sale.shiftId ?? "",
    customerId: sale.customerId,
    buyer: sale.buyer
      ? { name: `${sale.buyer.surname} ${sale.buyer.givenName}`, ...sale.buyer }
      : null,
    payment: sale.tender,
    creditMinor: Number(minorUnits(sale.creditAmount ?? "0")),
    dueDate: sale.dueDate ?? null,
    cashMinor: Number(minorUnits(sale.cashPart ?? (sale.tender === "Cash" ? sale.total : "0"))),
    bankMinor: Number(minorUnits(sale.bankPart ?? (sale.tender === "Bank" ? sale.total : "0"))),
    bankMethod: sale.bankMethod ?? null,
    discountMinor: Number(minorUnits(sale.discountAmount ?? "0")),
    totalMinor: Number(minorUnits(sale.total)),
    tenderedMinor: Number(minorUnits(sale.paid)),
    changeMinor: Number(minorUnits(sale.change)),
    bankReference: null,
    soldAt: new Date(sale.at).getTime(),
    lines: sale.lines.map((l) => ({
      itemId: l.id,
      kind: l.kind,
      quantity: l.quantity,
      unitMinor: Number(minorUnits(l.unitPrice)),
      name: l.name,
      reference: l.id,
      barcode: l.barcode ?? null,
      serial: l.serial ?? null,
      imei1: l.imei ?? null,
      imei2: l.imei2 ?? null,
    })),
    warranties: (sale.warranties ?? []).map((w) => ({
      itemId: w.itemId,
      requested: w.requested,
      ...(w.provider ? { provider: w.provider } : {}),
      ...([1, 3, 6, 12].includes(w.months ?? 0) ? { months: w.months as 1 | 3 | 6 | 12 } : {}),
      ...(w.start ? { start: w.start } : {}),
      ...(w.end ? { end: w.end } : {}),
    })),
  };
}
