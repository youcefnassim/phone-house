import { z } from "zod";
import { imeiChecksumValid } from "./operations";

/**
 * Owner settings (decisions 2026-11-09). Unknown values stay empty; never invent
 * a check URL or label size. Initial lists come from the owner's answers.
 */
export const boxTrackedEntry = z
  .object({
    brand: z.string().trim().min(1).max(60),
    /** Empty = every model of the brand; otherwise a model/series prefix (e.g. "Galaxy S"). */
    series: z.string().trim().max(60).default(""),
  })
  .strict();
export const warrantyRuleSchema = z
  .object({
    brand: z.string().trim().min(1).max(60),
    series: z.string().trim().max(60),
    provider: z.enum(["SHOP", "MANUFACTURER"]),
    months: z.union([z.literal(1), z.literal(3), z.literal(6), z.literal(12)]),
  })
  .strict();
const legalText = z.string().trim().max(500);
export const settingSchemas = {
  "cash.movementReasons": z.array(z.string().trim().min(1).max(80)).max(60),
  "pos.discountLimitDzd": z
    .string()
    .regex(/^(?:|[0-9]+(?:\.[0-9]{1,2})?)$/)
    .refine((v) => {
      if (!v) return true;
      const [whole = "0", fraction = ""] = v.split(".");
      return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0")) <= 99999999999999n;
    }),
  "company.legalName": legalText,
  "company.legalForm": legalText,
  "company.storeAddress": z.object({ M01: legalText, M02: legalText }).strict(),
  "company.rc": legalText,
  "company.nif": legalText,
  "company.nis": legalText,
  "company.ai": legalText,
  "company.contacts": z
    .object({ phone: legalText, email: legalText, facebook: legalText })
    .strict(),
  "warranty.conditions": z
    .object({ fr: z.string().trim().max(6000), ar: z.string().trim().max(6000) })
    .strict(),
  "documents.invoiceNumbering": z.enum(["LEGAL_SEQUENCE", "PUBLIC_REF"]),
  "warranty.rules": z.array(warrantyRuleSchema).max(100),
  "intake.checkUrlTemplate": z
    .string()
    .trim()
    .max(500)
    .refine((v) => v === "" || /^https:\/\/[^\s]+$/i.test(v), "HTTPS_URL_REQUIRED")
    .refine((v) => v === "" || /\{(serial|imei)\}/.test(v), "PLACEHOLDER_REQUIRED"),
  "intake.boxTrackedModels": z.array(boxTrackedEntry).max(50),
  "intake.accessoryCategories": z.array(z.string().trim().min(1).max(60)).max(60),
  "labels.sizeMm": z
    .object({
      width: z.number().int().min(10).max(200),
      height: z.number().int().min(10).max(200),
    })
    .strict()
    .nullable(),
} as const;
export type SettingKey = keyof typeof settingSchemas;
export const settingKeys = Object.keys(settingSchemas) as SettingKey[];
/** Keys staff may read. Anything not listed here (future keys) is owner-only. */
export const staffReadableSettings: readonly SettingKey[] = [
  "cash.movementReasons",
  "pos.discountLimitDzd",
  "intake.checkUrlTemplate",
  "intake.boxTrackedModels",
  "intake.accessoryCategories",
  "labels.sizeMm",
  "company.legalName",
  "company.legalForm",
  "company.storeAddress",
  "company.rc",
  "company.nif",
  "company.nis",
  "company.ai",
  "company.contacts",
  "warranty.conditions",
  "warranty.rules",
  "documents.invoiceNumbering",
];
export interface AppSettings {
  "cash.movementReasons": string[];
  "pos.discountLimitDzd": string;
  "company.legalName": string;
  "company.legalForm": string;
  "company.storeAddress": { M01: string; M02: string };
  "company.rc": string;
  "company.nif": string;
  "company.nis": string;
  "company.ai": string;
  "company.contacts": { phone: string; email: string; facebook: string };
  "warranty.conditions": { fr: string; ar: string };
  "documents.invoiceNumbering": "LEGAL_SEQUENCE" | "PUBLIC_REF";
  "warranty.rules": z.infer<typeof warrantyRuleSchema>[];
  "intake.checkUrlTemplate": string;
  "intake.boxTrackedModels": z.infer<typeof boxTrackedEntry>[];
  "intake.accessoryCategories": string[];
  "labels.sizeMm": { width: number; height: number } | null;
}
export const defaultSettings: AppSettings = {
  "cash.movementReasons": ["Loyer", "Électricité", "Salaires", "Frais", "Autre"],
  "pos.discountLimitDzd": "",
  "company.legalName": "PHONE HOUSE MAGHNIA",
  "company.legalForm": "Personne physique",
  "company.storeAddress": { M01: "", M02: "" },
  "company.rc": "",
  "company.nif": "",
  "company.nis": "",
  "company.ai": "",
  "company.contacts": { phone: "", email: "", facebook: "" },
  "warranty.conditions": { fr: "", ar: "" },
  "documents.invoiceNumbering": "LEGAL_SEQUENCE",
  "warranty.rules": [
    { brand: "Apple", series: "", provider: "SHOP", months: 12 },
    { brand: "Samsung", series: "Galaxy S", provider: "SHOP", months: 12 },
    ...["Oppo", "Vivo", "Infinix"].map((brand) => ({
      brand,
      series: "",
      provider: "MANUFACTURER" as const,
      months: 12 as const,
    })),
  ],
  "intake.checkUrlTemplate": "",
  "intake.boxTrackedModels": [
    { brand: "Apple", series: "" },
    { brand: "Samsung", series: "Galaxy S" },
  ],
  "intake.accessoryCategories": [
    "Pochettes",
    "Incassables",
    "Kitman",
    "Chargeurs",
    "Câbles",
    "Powerbank",
    "Lens caméra",
  ],
  "labels.sizeMm": null,
};
export const settingsSaveValue = z
  .object({
    key: z.enum(settingKeys as [SettingKey, ...SettingKey[]]),
    value: z.unknown(),
  })
  .strict()
  .superRefine((v, c) => {
    const r = settingSchemas[v.key].safeParse(v.value);
    if (!r.success) c.addIssue({ code: "custom", message: "INVALID_SETTING" });
  });
/** Merge stored rows over owner defaults; invalid stored values fall back safely. */
export function resolveSettings(rows: Partial<Record<string, unknown>>): AppSettings {
  const out = { ...defaultSettings } as Record<SettingKey, unknown>;
  for (const k of settingKeys) {
    if (!(k in rows)) continue;
    const r = settingSchemas[k].safeParse(rows[k]);
    if (r.success) out[k] = r.data;
  }
  return out as unknown as AppSettings;
}

/** Owner-configured verification link; null hides the button. No request is made. */
export function buildCheckUrl(template: string, ids: { serial?: string; imei?: string }) {
  const t = template.trim();
  if (!t || !/^https:\/\//i.test(t)) return null;
  const needsSerial = t.includes("{serial}");
  const needsImei = t.includes("{imei}");
  if (!needsSerial && !needsImei) return null;
  if ((needsSerial && !ids.serial) || (needsImei && !ids.imei)) return null;
  return t
    .replaceAll("{serial}", encodeURIComponent(ids.serial ?? ""))
    .replaceAll("{imei}", encodeURIComponent(ids.imei ?? ""));
}

export const boxStates = ["NO_BOX", "OPEN_BOX", "SEALED"] as const;
export type BoxState = (typeof boxStates)[number];
export const BOX_NOT_TRACKED = "NOT_TRACKED";
const fold = (v: string) =>
  v
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
export function isBoxTracked(
  list: AppSettings["intake.boxTrackedModels"],
  brand: string,
  model: string,
) {
  return list.some(
    (e) => fold(e.brand) === fold(brand) && (!e.series || fold(model).startsWith(fold(e.series))),
  );
}
export function packagingFor(tracked: boolean, state: BoxState | "") {
  return tracked ? state : BOX_NOT_TRACKED;
}

export const lowStock = (quantity: number, threshold: number | null | undefined) =>
  threshold !== null && threshold !== undefined && Number.isFinite(threshold)
    ? quantity <= threshold
    : false;

/** Sealed-box IMEI batch: checksum, immediate duplicate refusal, operator may lower N. */
export interface ImeiBatch {
  target: number;
  imeis: string[];
}
export type ImeiBatchError = "INVALID_IMEI" | "DUPLICATE_IMEI" | "BATCH_FULL" | "IN_STOCK";
export function addBatchImei(
  b: ImeiBatch,
  raw: string,
  existing: ReadonlySet<string> = new Set(),
): { batch: ImeiBatch; error?: ImeiBatchError } {
  const v = raw.trim();
  if (!/^\d{15}$/.test(v) || !imeiChecksumValid(v)) return { batch: b, error: "INVALID_IMEI" };
  if (b.imeis.includes(v)) return { batch: b, error: "DUPLICATE_IMEI" };
  if (existing.has(v)) return { batch: b, error: "IN_STOCK" };
  if (b.imeis.length >= b.target) return { batch: b, error: "BATCH_FULL" };
  return { batch: { ...b, imeis: [...b.imeis, v] } };
}
export function lowerBatchTarget(b: ImeiBatch, n: number): ImeiBatch {
  if (!Number.isInteger(n) || n < 1 || n > b.target) return b;
  return { target: n, imeis: b.imeis.slice(0, n) };
}
export const batchComplete = (b: ImeiBatch) => b.imeis.length === b.target && b.target > 0;
export function batchReceiving(input: {
  key: string;
  store: "M01" | "M02";
  itemId: string;
  batch: ImeiBatch;
  condition: string;
  packaging: string;
  newId: () => string;
}) {
  if (!batchComplete(input.batch)) throw new Error("BATCH_INCOMPLETE");
  return {
    key: input.key,
    store: input.store,
    itemId: input.itemId,
    quantity: input.batch.imeis.length,
    reference: "",
    phones: input.batch.imeis.map((imei1) => {
      const id = input.newId();
      return {
        id,
        imei1,
        barcode: `PH-${id}`,
        attributes: { condition: input.condition, packaging: input.packaging },
      };
    }),
  };
}

/** Label content: code + model + store. Never price. */
export function labelContent(v: { code: string; model: string; store: string }) {
  return { code: v.code, model: v.model, store: v.store };
}
