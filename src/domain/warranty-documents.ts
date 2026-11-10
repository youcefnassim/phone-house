import type { AppSettings } from "./intake";
import { algiersDate } from "./sales-review";

export type WarrantyProvider = "SHOP" | "MANUFACTURER";
const fold = (s: string) => s.trim().toLocaleLowerCase();
export function warrantyRule(
  settings: AppSettings,
  phone: { brand: string; model: string; condition: string },
) {
  if (phone.condition !== "NEW") return undefined;
  return settings["warranty.rules"]
    .filter(
      (r) =>
        fold(r.brand) === fold(phone.brand) &&
        (!r.series || fold(phone.model).startsWith(fold(r.series))),
    )
    .sort((a, b) => b.series.length - a.series.length)[0];
}

// Crockford's ambiguity-free data symbols (0 and 1 deliberately excluded).
// A prime-modulus check alphabet detects every single-symbol substitution.
export const publicAlphabet = "23456789ABCDEFGHJKMNPQRSTVWXYZ";
const checkAlphabet = `${publicAlphabet}*`;
function checkCharacter(data: string) {
  let n = 0;
  for (const char of data) n = (n * 30 + publicAlphabet.indexOf(char)) % 31;
  return checkAlphabet[n] ?? "*";
}
export function newPublicReference() {
  const chars: string[] = [];
  while (chars.length < 8) {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    for (const byte of bytes) {
      if (byte < 240 && chars.length < 8) chars.push(publicAlphabet[byte % 30] ?? "2");
    }
  }
  const data = chars.join("");
  return `PH-${data.slice(0, 4)}-${data.slice(4)}-${checkCharacter(data)}`;
}
export function validPublicReference(value: string) {
  const m =
    /^PH-([23456789ABCDEFGHJKMNPQRSTVWXYZ]{4})-([23456789ABCDEFGHJKMNPQRSTVWXYZ]{4})-([23456789ABCDEFGHJKMNPQRSTVWXYZ*])$/.exec(
      value,
    );
  return !!m && checkCharacter(`${m[1]}${m[2]}`) === m[3];
}
export const invoiceYear = (date: Date | string) => Number(algiersDate(date).slice(0, 4));
export const legalInvoiceNumber = (store: string, year: number, last: number) =>
  `FA-${store}-${year}-${String(last).padStart(6, "0")}`;

export function legalChecklist(settings: AppSettings, store: "M01" | "M02") {
  return [
    {
      key: "company.legalName",
      label: "Nom légal / الاسم القانوني",
      ready: !!settings["company.legalName"].trim(),
    },
    {
      key: "company.storeAddress",
      label: `Adresse ${store} / العنوان`,
      ready: !!settings["company.storeAddress"][store].trim(),
    },
    ...(["rc", "nif", "nis", "ai"] as const).map((k) => ({
      key: `company.${k}`,
      label: k.toUpperCase(),
      ready: !!settings[`company.${k}`].trim(),
    })),
    {
      key: "warranty.conditions",
      label: "Conditions FR + AR / شروط الضمان",
      ready:
        !!settings["warranty.conditions"].fr.trim() && !!settings["warranty.conditions"].ar.trim(),
    },
  ];
}
export function officialPrintGate(
  settings: AppSettings,
  store: "M01" | "M02",
  shopWarranty: boolean,
) {
  const missing = legalChecklist(settings, store).filter(
    (c, i) => !c.ready && (i < 6 || shopWarranty),
  );
  return { ready: missing.length === 0, missing };
}
