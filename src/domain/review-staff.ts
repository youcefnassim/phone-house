import { permits } from "./permissions";
import type { StoreId } from "./erp";
export type ReviewRole = "SELLER" | "MANAGER" | "SUPER_ADMIN";
export interface ReviewIdentity {
  id: string;
  name: string;
  role: ReviewRole;
  stores: StoreId[];
  active: boolean;
}
/** Synthetic identities, never credentials. Retired IDs remain resolvable for history. */
export const reviewIdentities: ReviewIdentity[] = [
  { id: "U-S01", name: "Test seller 001", role: "SELLER", stores: ["M01"], active: true },
  { id: "U-S03", name: "Test seller 003", role: "SELLER", stores: ["M01"], active: true },
  { id: "U-S02", name: "Test seller 002", role: "SELLER", stores: ["M02"], active: false },
  { id: "U-M01", name: "Test manager M01", role: "MANAGER", stores: ["M01"], active: false },
  { id: "U-M02", name: "Test manager M02", role: "MANAGER", stores: ["M02"], active: true },
  {
    id: "U-OWN",
    name: "Test owner (Super Admin)",
    role: "SUPER_ADMIN",
    stores: ["M01", "M02"],
    active: true,
  },
];
export const activeReviewIdentities = () => reviewIdentities.filter((u) => u.active);
export const canOperateStore = (identity: ReviewIdentity, store: StoreId) =>
  identity.active &&
  permits(
    identity.role,
    identity.role === "SUPER_ADMIN" ? "GLOBAL" : identity.stores.includes(store) ? store : "",
    store,
    "operational.read",
  );
