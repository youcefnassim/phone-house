import { permits } from "./permissions";
export function creditIsLate(
  due: string | null | undefined,
  balance: number | bigint,
  now: Date = new Date(),
) {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Algiers",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  return !!due && due < today && BigInt(balance) > 0n;
}
export function canFollowCredit(role: string, membershipStore: string, store: string) {
  return permits(role, membershipStore, store, "credit.checkout");
}
