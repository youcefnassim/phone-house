import { stock } from "./demo";
import type { StoreId, Scope, PhoneUnit, AccessorySku } from "@/domain/erp";
import { drawerFor, type DemoEvent, type DrawerFixture } from "@/domain/operations";

export interface OperationsDemoContract {
  readonly mode: "demo";
  phones(scope: Scope): PhoneUnit[];
  accessories(scope: Scope): AccessorySku[];
  drawers(scope: Scope): DrawerFixture[];
  history(store: StoreId, subject: string): DemoEvent[];
}
export const operationsDemo: OperationsDemoContract = {
  mode: "demo",
  phones: (scope) =>
    stock.filter(
      (item): item is PhoneUnit =>
        item.kind === "phone" && (scope === "ALL" || scope === item.store),
    ),
  accessories: (scope) =>
    stock.filter(
      (item): item is AccessorySku =>
        item.kind === "accessory" && (scope === "ALL" || scope === item.store),
    ),
  drawers: (scope) =>
    (["M01", "M02"] as StoreId[])
      .filter((store) => scope === "ALL" || scope === store)
      .map((store) => ({
        store,
        drawer: drawerFor(store),
        shift: `DEMO-SH-${store}`,
        operator: store === "M01" ? "Demo seller 001" : "Demo seller 002",
        opening: store === "M01" ? "10000.00" : "5000.00",
        expected: store === "M01" ? "42000.00" : "18500.00",
      })),
  history: (store, subject) => [
    {
      id: `DEMO-${subject}-1`,
      store,
      subject,
      action: "Synthetic intake fixture · 05 Nov 2026",
      operator: "Demo operator 001",
      status: "Synthetic fixture",
    },
  ],
};
