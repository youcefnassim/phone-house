import type { Role } from "./erp";

const seller = [
  "count.open",
  "count.entry",
  "count.submit",
  "stock.adjust",
  "pos.checkout",
  "stock.standalone",
  "stock.receive",
  "customer.save",
  "catalog.save",
  "price.set",
  "repayment.record",
  "cash.open",
  "cash.close",
  "transfer.scan",
  // Destination-store staff receive; the dispatcher must still be a different person.
  "transfer.receive",
  "sav.open",
  "sav.event",
  "sav.track",
  "operational.read",
  "history.read",
  "inventory.read",
  "catalog.read",
  "customers.read",
  "sales.read",
  "cash.read",
  "settings.read",
] as const;
const manager = [
  ...seller,
  "sale.void",
  "sav.outcome",
  "sav.exchange",
  "used.purchase",
  "identity.read",
  "cash.movement",
  "credit.checkout",
  "cash.evidence",
  "debt.draft",
  "repayment.draft",
  "purchase.save",
  "supplier.save",
  "purchases.read",
  "suppliers.read",
  "expenses.read",
  "audit.read",
  "transfer.approve",
  // Source-store manager creates. transfer.dispatch stays SUPER_ADMIN-only (owner confirms, staff scan).
  "transfer.create",
  "transfers.read",
  "sav.read",
  "debts.read",
] as const;
/** Owner decision 2026-11-09: operations depend on role, never a fixed store topology. */
export const roleOperations: Record<Role, readonly string[]> = {
  SELLER: seller,
  MANAGER: manager,
  SUPER_ADMIN: ["*"],
};
export const rolesForOperation = (operation: string): Role[] =>
  (["SUPER_ADMIN", "MANAGER", "SELLER"] as Role[]).filter(
    (role) => roleOperations[role].includes("*") || roleOperations[role].includes(operation),
  );
export function permits(role: string, membershipStore: string, store: string, operation: string) {
  if (operation === "used.purchase" && role !== "SUPER_ADMIN" && store !== "M02") return false;
  return (
    rolesForOperation(operation).includes(role as Role) &&
    (role === "SUPER_ADMIN" ? membershipStore === "GLOBAL" : membershipStore === store)
  );
}
/** SQL literals originate exclusively in this matrix, not user input. Store remains a bound parameter. */
export function membershipSql(operation: string, alias = "") {
  const p = alias ? `${alias}.` : "";
  const staff = rolesForOperation(operation).filter((role) => role !== "SUPER_ADMIN");
  const restriction = operation === "used.purchase" ? ` AND ${p}store_id='M02'` : "";
  return `((${p}role='SUPER_ADMIN' AND ${p}store_id='GLOBAL') OR (${p}store_id=? AND ${staff.length ? `${p}role IN(${staff.map((role) => `'${role}'`).join(",")})${restriction}` : "0=1"}))`;
}
export const readOperation = (module: string) =>
  [
    "inventory",
    "catalog",
    "customers",
    "sales",
    "cash",
    "settings",
    "transfers",
    "sav",
    "debts",
    "reports",
    "facility",
    "purchases",
    "suppliers",
    "expenses",
    "audit",
    "users",
  ].includes(module)
    ? `${module}.read`
    : "operational.read";

/** Navigation and direct route gate share operations with authenticated SQL reads. */
export const routeOperations = {
  "/": "owner.read",
  "/waiting": "owner.read",
  "/pos": "pos.checkout",
  "/stock/phones": "stock.standalone",
  "/stock/accessories": "stock.standalone",
  "/cash": "cash.read",
  "/sales": "sales.read",
  "/catalog": "catalog.read",
  "/customers": "customers.read",
  "/debts": "debts.read",
  "/transfers": "transfers.read",
  "/sav": "sav.read",
  "/suppliers": "suppliers.read",
  "/purchases": "purchases.read",
  "/expenses": "expenses.read",
  "/audit": "audit.read",
  "/users": "users.read",
  "/reports": "reports.read",
  "/facility": "facility.read",
  "/settings": "settings.read",
} as const;
export const routeOperation = (path: string): string =>
  routeOperations[path as keyof typeof routeOperations] ?? "route.denied";
export function routeAllowed(
  memberships: readonly { role: string; store: string }[],
  store: string,
  path: string,
) {
  return (
    path in routeOperations &&
    memberships.some((m) => permits(m.role, m.store, store, routeOperation(path)))
  );
}

/** SINGLE POLICY CHANGE POINT: keep owner + M02 manager and two distinct actors until separately approved. */
export const transferApprovalPolicy = {
  SUPER_ADMIN: { role: "SUPER_ADMIN", store: "GLOBAL" },
  M02_MANAGER: { role: "MANAGER", store: "M02" },
} as const;
export function canApproveTransfer(
  approval: keyof typeof transferApprovalPolicy,
  role: string,
  store: string,
) {
  const required = transferApprovalPolicy[approval];
  return role === required.role && store === required.store;
}
export function transferApprovalSql(approval: string, alias = "") {
  const p = alias ? `${alias}.` : "";
  return `(${Object.entries(transferApprovalPolicy)
    .map(
      ([key, value]) =>
        `(${approval}='${key}' AND ${p}role='${value.role}' AND ${p}store_id='${value.store}')`,
    )
    .join(" OR ")})`;
}
