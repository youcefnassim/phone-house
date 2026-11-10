import { z } from "zod";
const validDate = (v: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
};
export const warrantyChoiceSchema = z
  .object({
    itemId: z.string().min(1),
    requested: z.boolean(),
    provider: z.enum(["SHOP", "MANUFACTURER"]).optional(),
    months: z.number().int().min(1).max(120).optional(),
    duration: z.string().trim().max(160).default(""),
    start: z.string().default(""),
    end: z.string().default(""),
  })
  .strict()
  .superRefine((v, c) => {
    if (
      v.requested &&
      v.months === undefined &&
      (!v.duration || !validDate(v.start) || !validDate(v.end) || v.end < v.start)
    )
      c.addIssue({ code: "custom", message: "Enter explicit warranty duration and valid dates." });
  });
export type WarrantyChoice = z.infer<typeof warrantyChoiceSchema>;
/** Accent/whitespace-insensitive key for buyer and supplier dedup (Latin + Arabic). */
export const normalizedBuyer = (value: string) =>
  value
    .normalize("NFKC")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/ـ/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase();
export function algiersDate(value: string | Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Algiers",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value));
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}
/** Calendar month anniversary, clamped to the last day of the target month. */
export function warrantyDates(at: string | Date, months: number) {
  if (!Number.isSafeInteger(months) || months < 1 || months > 120)
    throw new Error("Enter explicit warranty duration and valid dates.");
  const start = algiersDate(at);
  const [year = 0, month = 1, day = 1] = start.split("-").map(Number);
  const target = new Date(Date.UTC(year, month - 1 + months, 1));
  const last = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(day, last));
  return { start, end: target.toISOString().slice(0, 10) };
}
export function salesDateRange(period: string, now = new Date()): { from: string; to: string } {
  if (period === "all") return { from: "", to: "" };
  const today = algiersDate(now);
  const day = new Date(`${today}T12:00:00+01:00`);
  if (period === "yesterday") day.setUTCDate(day.getUTCDate() - 1);
  if (period === "week") day.setUTCDate(day.getUTCDate() - day.getUTCDay()); // owner: week starts Sunday
  return { from: algiersDate(day), to: period === "yesterday" ? algiersDate(day) : today };
}
