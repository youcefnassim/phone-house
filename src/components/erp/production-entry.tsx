import type { ReactNode } from "react";
import { NativeShell } from "./native-shell";
import { useErp } from "./ui-context";
/** Leaf demo exports are removed at build resolution, not merely hidden. */
export function Shell({ children: _children }: { children: ReactNode }) {
  return <NativeShell />;
}
export function Auth() {
  const { t } = useErp();
  return (
    <main className="min-h-screen bg-background text-foreground p-8">
      <h1>Phone House Maghnia</h1>
      <p role="alert">{t("native.notConnected")}</p>
    </main>
  );
}
export const Dashboard = () => null;
export const Pos = Dashboard;
export const AuditPage = Dashboard;
export const CashRegisters = Dashboard;
export const CatalogPage = Dashboard;
export const CustomersPage = Dashboard;
export const DebtsPage = Dashboard;
export const ExpensesPage = Dashboard;
export const FacilitiesPage = Dashboard;
export const PurchasesPage = Dashboard;
export const Reports = Dashboard;
export const SalesPage = Dashboard;
export const ServicePage = Dashboard;
export const SettingsPage = Dashboard;
export const AccessoriesInventory = Dashboard;
export const PhonesInventory = Dashboard;
export const SuppliersPage = Dashboard;
export const TransfersPage = Dashboard;
export const UsersPage = Dashboard;
