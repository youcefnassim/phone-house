import { z } from "zod";
import { minorUnits, decimalValue } from "./erp";
import type { TestSale, TestSaleLine } from "@/data/test-workspace";

export const testBuyerSchema = z
  .object({
    surname: z.string().trim().min(1).max(100),
    givenName: z.string().trim().min(1).max(100),
    contact: z.string().trim().max(160).default(""),
  })
  .strict();
export type TestBuyer = z.infer<typeof testBuyerSchema>;
// Pure document projection: never call a workspace mutator while previewing or printing.
export function testDocument(sale: TestSale, kind: "invoice" | "warranty", itemId?: string) {
  const total = decimalValue(
    sale.lines.reduce((sum, line) => sum + minorUnits(line.unitPrice) * BigInt(line.quantity), 0n) -
      minorUnits(sale.discountAmount ?? "0"),
  );
  if (total !== decimalValue(minorUnits(sale.total)))
    throw new Error("Document total does not match sale.");
  const lines: TestSaleLine[] =
    kind === "warranty" ? sale.lines.filter((l) => l.id === itemId) : sale.lines;
  if (
    kind === "warranty" &&
    sale.warranties &&
    !sale.warranties.some((w) => w.itemId === itemId && w.requested)
  )
    throw new Error("No warranty requested.");
  if (kind === "warranty" && lines.length !== 1) throw new Error("Select one sold item.");
  return {
    kind,
    reference: sale.id,
    store: sale.store,
    at: sale.at,
    buyer: sale.buyer,
    customer: sale.customer,
    seller: sale.seller,
    tender: sale.tender,
    lines,
    total,
    official: false as const,
    termsApproved: false as const,
  };
}
