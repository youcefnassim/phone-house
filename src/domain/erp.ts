export type StoreId = "M01" | "M02";
export type Scope = StoreId | "ALL";
export type Role = "SUPER_ADMIN" | "MANAGER" | "SELLER";
export type Money = string;
export type DemoStatus =
  | "Available"
  | "Low stock"
  | "Sold"
  | "In transit"
  | "Pending"
  | "Paid"
  | "Open"
  | "Overdue"
  | "Inspection"
  | "Draft"
  | "Closed";
export interface RecordRow {
  id: string;
  name: string;
  detail: string;
  store: StoreId;
  status: DemoStatus;
  amount?: Money;
  quantity?: number;
  code?: string;
  date?: string;
  category?: string;
}
export interface PhoneUnit extends RecordRow {
  kind: "phone";
  imei2?: string;
  condition: "NEW" | "USED";
  packaging: "SEALED" | "OPEN_BOX" | "NO_BOX" | "UNKNOWN";
  imei: string;
}
export interface AccessorySku extends RecordRow {
  kind: "accessory";
  quantity: number;
}
export type StockItem = PhoneUnit | AccessorySku;
export interface CartLine {
  item: StockItem;
  quantity: number;
}
export interface DataContract {
  mode: "demo" | "production";
  list(area: string, scope: Scope): Promise<RecordRow[]>;
}
export const storeLabel = (store: StoreId) =>
  store === "M01" ? "Magasin 1 (M01)" : "Magasin 2 (M02)";
export function minorUnits(value: Money): bigint {
  if (!/^\d+(\.\d{1,2})?$/.test(value))
    throw new Error("Amount must be a non-negative decimal with up to two decimal places.");
  const [whole = "0", fraction = ""] = value.split(".");
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
}
export function decimalValue(value: bigint): Money {
  return `${value / 100n}.${(value % 100n).toString().padStart(2, "0")}`;
}
export function cartTotal(cart: CartLine[]): Money {
  return decimalValue(
    cart.reduce(
      (sum, line) => sum + minorUnits(line.item.amount ?? "0") * BigInt(line.quantity),
      0n,
    ),
  );
}
export function addToCart(cart: CartLine[], item: StockItem): CartLine[] {
  if (item.status === "Sold" || item.status === "In transit" || item.status === "Draft")
    throw new Error("This demo unit is not available.");
  if (cart.some((line) => line.item.store !== item.store))
    throw new Error("A basket must belong to one store.");
  const existing = cart.find((line) => line.item.id === item.id);
  if (item.kind === "phone" && existing) return cart;
  if (item.kind === "accessory" && (existing?.quantity ?? 0) >= item.quantity)
    throw new Error("Demo stock quantity reached.");
  return existing
    ? cart.map((line) =>
        line.item.id === item.id ? { ...line, quantity: line.quantity + 1 } : line,
      )
    : [...cart, { item, quantity: 1 }];
}
export function formatMoney(value: Money) {
  const [whole = "0", fraction = "00"] = decimalValue(minorUnits(value)).split(".");
  return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, " ")}${fraction === "00" ? "" : `.${fraction}`} DZD`;
}
export function canViewFinance(role: Role) {
  return role === "SUPER_ADMIN";
}
export const operationPolicy = {
  productionWrites: false,
  authentication: false,
  offlineSales: false,
  discounts: "UNCONFIGURED",
  facilityStore: "M01",
} as const;
