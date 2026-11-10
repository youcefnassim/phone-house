import { z } from "zod";
import { imeiChecksumValid } from "./operations";
const id = z.string().regex(/^[A-Za-z0-9-]{1,80}$/);
const imei = z
  .string()
  .regex(/^\d{15}$/)
  .refine(imeiChecksumValid);
const phone = z
  .object({
    id,
    imei1: imei.optional(),
    imei2: imei.optional(),
    serial: id.optional(),
    barcode: id,
    attributes: z.record(z.string()).default({}),
  })
  .strict()
  .superRefine((p, c) => {
    if (!p.imei1 && !p.serial) c.addIssue({ code: "custom", message: "IDENTIFIER_REQUIRED" });
    if (p.imei2 && (!p.imei1 || p.imei2 === p.imei1))
      c.addIssue({ code: "custom", message: "INVALID_IMEI_SLOTS" });
  });
export const nativeReceiving = z
  .object({
    key: id.min(16),
    store: z.enum(["M01", "M02"]),
    itemId: id,
    quantity: z.number().int().min(1).max(2147483647),
    supplierId: id.optional(),
    newSupplierName: z.string().trim().min(1).max(160).optional(),
    reference: z.string().trim().max(160).default(""),
    phones: z.array(phone).max(100).default([]),
  })
  .strict()
  .refine((v) => !(v.supplierId && v.newSupplierName), "SELECT_OR_CREATE_SUPPLIER");
