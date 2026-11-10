/** Exact DZD settlement; cash received may exceed its allocation, bank never makes change. */
export type BankMethod = "VIREMENT" | "CCP_BARIDIMOB";
export type PaymentMode = "Cash" | "Bank" | "Split";
export const cents = (value: string) => {
  if (!/^\d+(\.\d{1,2})?$/.test(value)) throw new Error("VALIDATION");
  const [whole = "0", fraction = ""] = value.split(".");
  const n = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  if (n > 99999999999999n) throw new Error("VALIDATION");
  return n;
};
export function settleSale(input: {
  credit?: string | undefined;
  subtotal: string;
  discount?: string | undefined;
  limit: string;
  owner: boolean;
  mode: PaymentMode;
  cash?: string | undefined;
  bank?: string | undefined;
  received: string;
  bankMethod?: BankMethod | undefined;
}) {
  const subtotal = cents(input.subtotal),
    discount = cents(input.discount || "0");
  if (discount > 0n && (!input.limit || (!input.owner && discount > cents(input.limit))))
    throw new Error("DISCOUNT_REFUSED");
  const total = subtotal - discount;
  if (total <= 0n) throw new Error("VALIDATION");
  const credit = cents(input.credit || "0");
  if (credit > total) throw new Error("PAYMENT_MISMATCH");
  const deposit = total - credit;
  const bank =
    input.mode === "Cash" ? 0n : input.mode === "Bank" ? deposit : cents(input.bank || "0");
  const cash =
    input.mode === "Bank" ? 0n : input.mode === "Cash" ? deposit : cents(input.cash || "0");
  const received = input.mode === "Bank" ? 0n : cents(input.received);
  if (cash + bank !== deposit || received < cash || (bank > 0n && !input.bankMethod))
    throw new Error("PAYMENT_MISMATCH");
  if (input.mode === "Bank" && cents(input.received) !== deposit)
    throw new Error("PAYMENT_MISMATCH");
  return { total, discount, cash, bank, received, change: received - cash };
}
