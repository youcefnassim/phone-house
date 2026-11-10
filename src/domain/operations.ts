import { z } from "zod";
import { minorUnits, decimalValue, type StoreId, type Money } from "./erp";

const text = z.string().trim().min(1, "Required");
const optionalText = z.string().trim().default("");
const imei = z
  .string()
  .trim()
  .regex(/^\d{15}$/, "Use exactly 15 digits");
/** Luhn check digit used by genuine 15-digit IMEIs. */
export function imeiChecksumValid(value: string): boolean {
  if (!/^\d{15}$/.test(value)) return false;
  let sum = 0;
  for (let i = 0; i < 15; i++) {
    let d = Number(value[i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}
const genuineImei = imei.refine(imeiChecksumValid, "IMEI check digit is invalid");
/** Collapse whitespace so "iPhone  15" and "iPhone 15" are one name; variants (Pro/Max) stay distinct. */
export const normalizeName = (v: string) => v.trim().replace(/\s+/g, " ");
const name = z.string().transform(normalizeName).pipe(z.string().min(1, "Required"));
export const phoneDraftSchema = z
  .object({
    name,
    brand: name,
    store: z.enum(["M01", "M02"], { errorMap: () => ({ message: "Choose the store" }) }),
    condition: z.enum(["NEW", "USED"], { errorMap: () => ({ message: "Choose New or Used" }) }),
    packaging: z.preprocess(
      (v) => (v === "" || v === undefined ? "UNKNOWN" : v),
      z.enum(["UNKNOWN", "SEALED", "OPEN_BOX", "NO_BOX"]),
    ),
    imei1: z.union([genuineImei, z.literal("")]).default(""),
    imei2: z.union([genuineImei, z.literal("")]).default(""),
    serial: optionalText,
    color: optionalText,
    storage: optionalText,
    battery: z
      .union([
        z.literal(""),
        z
          .string()
          .regex(/^\d+$/)
          .refine((v) => Number(v) >= 0 && Number(v) <= 100, "Use 0–100"),
      ])
      .default(""),
    salePrice: z
      .string()
      .trim()
      .regex(/^\d+(\.\d{1,2})?$/, "Use a non-negative decimal, at most two decimal places")
      .refine(
        (v) => !/^\d+(\.\d{1,2})?$/.test(v) || minorUnits(v) > 0n,
        "Price must be greater than zero",
      ),
    barcode: optionalText,
    remarks: optionalText,
    supplierId: z.string().trim().optional(),
    newSupplierName: z.string().trim().max(160).optional(),
    incomingReference: z.string().trim().max(160).optional(),
    /** A serialized phone is always exactly one stock unit; any other quantity is rejected. */
    quantity: z
      .union([z.literal("1"), z.literal(1)], {
        errorMap: () => ({ message: "A phone is always exactly one unit" }),
      })
      .optional(),
  })
  .refine((v) => !v.imei2 || v.imei1 !== v.imei2, {
    path: ["imei2"],
    message: "IMEI2 must differ from IMEI1",
  })
  .refine((v) => !v.imei2 || v.imei1, { path: ["imei1"], message: "Enter IMEI1 before IMEI2" })
  .refine((v) => v.imei1 || v.serial, {
    path: ["imei1"],
    message: "Enter the IMEI, or the serial number if this phone has no IMEI",
  });
export type PhoneDraft = z.infer<typeof phoneDraftSchema>;
export const accessoryDraftSchema = z.object({
  name: text,
  sku: optionalText,
  category: optionalText,
  variant: optionalText,
  compatibility: optionalText,
  barcode: optionalText,
  store: z.enum(["M01", "M02"]),
  supplierId: z.string().trim().optional(),
  newSupplierName: z.string().trim().max(160).optional(),
  quantity: z
    .string()
    .regex(/^\d+$/, "Use a positive whole quantity")
    .refine(
      (v) => Number.isSafeInteger(Number(v)) && Number(v) > 0,
      "Use a positive whole quantity",
    ),
  reference: optionalText,
  remarks: optionalText,
  salePrice: z
    .union([
      z.literal(""),
      z
        .string()
        .regex(/^\d+(\.\d{1,2})?$/)
        .refine((v) => minorUnits(v) > 0n, "Price must be greater than zero"),
    ])
    .optional(),
});
export type AccessoryDraft = z.infer<typeof accessoryDraftSchema>;
export const moneySchema = z
  .string()
  .regex(/^\d+(\.\d{1,2})?$/, "Use a non-negative decimal, at most two decimal places");
export const cashDraftSchema = z.object({
  store: z.enum(["M01", "M02"]),
  operator: text,
  amount: moneySchema,
  reference: text,
  remarks: optionalText,
});
export type CashDraft = z.infer<typeof cashDraftSchema>;
export const paymentDraftSchema = z
  .object({ tender: z.enum(["Cash", "Bank"]), amount: moneySchema, reference: optionalText })
  .refine((value) => value.tender !== "Bank" || value.reference.length > 0, {
    path: ["reference"],
    message: "Bank reference required for this draft",
  });
export type PaymentDraft = z.infer<typeof paymentDraftSchema>;
export function validatePaymentDraft(payment: PaymentDraft, total: Money): string | undefined {
  return minorUnits(payment.amount) < minorUnits(total)
    ? "Entered amount is below the basket total. Credit and partial-payment policies are unconfigured."
    : payment.tender === "Bank" && minorUnits(payment.amount) !== minorUnits(total)
      ? "Bank preview must match the basket total; allocation policy is unconfigured."
      : undefined;
}
export function paymentChange(payment: PaymentDraft, total: Money): Money {
  const difference = minorUnits(payment.amount) - minorUnits(total);
  if (difference < 0n) throw new Error("Payment below total");
  return decimalValue(difference);
}
export function validateAccessoryIdentity(
  draft: AccessoryDraft,
  records: { sku: string; barcode: string }[],
  existingSku?: string,
): string | undefined {
  return records.some(
    (row) =>
      ((draft.sku && row.sku === draft.sku) || (draft.barcode && row.barcode === draft.barcode)) &&
      row.sku !== existingSku,
  )
    ? "SKU or barcode conflicts with an existing demo product. Select the existing SKU to receive it."
    : undefined;
}
export interface DemoEvent {
  id: string;
  store: StoreId;
  subject: string;
  action: string;
  operator: string;
  status: "Synthetic fixture" | "Session draft";
}
export interface DrawerFixture {
  store: StoreId;
  drawer: string;
  shift: string;
  operator: string;
  opening: Money;
  expected: Money;
}
export const drawerFor = (store: StoreId) => `DRAWER-${store}`;
export function cashDiscrepancy(counted: Money, expected: Money): string {
  const difference = minorUnits(counted) - minorUnits(expected);
  return `${difference < 0n ? "-" : ""}${decimalValue(difference < 0n ? -difference : difference)}`;
}
export function validatePhoneIdentity(
  draft: PhoneDraft,
  identifiers: string[],
): string | undefined {
  const known = new Set(identifiers.map((v) => v.trim().toUpperCase()));
  return [draft.imei1, draft.imei2, draft.serial]
    .filter(Boolean)
    .some((value) => known.has(value.toUpperCase()))
    ? "An identifier is already present in the demo inventory."
    : undefined;
}
export const documentPolicy = {
  receipt: "DRAFT_ONLY",
  officialIssuance: false,
  hardwareVerified: false,
  drawerPerStore: 1,
  shiftPerDayLimit: null,
} as const;
