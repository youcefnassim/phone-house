import { LocalCreditList } from "./credit-list";
import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Smartphone,
  Headphones,
  Wallet,
  ReceiptText,
  ScanLine,
  Landmark,
  AlertTriangle,
  History,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useErp } from "./context";
import { useTestWorkspace } from "@/data/test-workspace";
import { ledgerView } from "@/data/ledger-view";
import { formatMoney } from "@/domain/erp";
import { DataTable } from "./shared";
import { LedgerChart } from "./ledger-chart";
export function Dashboard() {
  const { scope, t } = useErp();
  const ws = useTestWorkspace();
  const v = ledgerView(ws, scope);
  return (
    <div className="dashboard page-enter">
      <div className="page-heading">
        <div>
          <h1>{t("dash.title")}</h1>
          <p>
            {t("dash.today")} ·{" "}
            {scope === "ALL"
              ? t("shell.allStores")
              : t(scope === "M01" ? "shell.store1" : "shell.store2")}
          </p>
        </div>
        <Button asChild>
          <Link to="/pos">
            <ScanLine />
            {t("dash.openPos")}
          </Link>
        </Button>
      </div>
      <div className="metrics-grid">
        {[
          {
            label: t("dash.salesToday"),
            value: formatMoney(v.todayTotal),
            foot: `${v.todayCount} ${t("dash.salesTodayFoot")}`,
            icon: ReceiptText,
            color: "blue",
          },
          {
            label: t("dash.availablePhones"),
            value: String(v.availablePhones),
            foot: t("nav.phones"),
            icon: Smartphone,
            color: "teal",
          },
          {
            label: t("dash.accessoryStock"),
            value: String(v.accessoryUnits),
            foot: t("nav.accessories"),
            icon: Headphones,
            color: "violet",
          },
          {
            label: t("dash.cashDrawers"),
            value: formatMoney(v.expectedDrawers),
            foot: `${v.openShifts} ${t("dash.cashDrawersFoot")}`,
            icon: Wallet,
            color: "amber",
          },
        ].map((m) => (
          <section className="metric" key={m.label}>
            <div className="metric-top">
              <span>{m.label}</span>
              <span className={`metric-icon ${m.color}`}>
                <m.icon size={18} />
              </span>
            </div>
            <strong className="ltr">{m.value}</strong>
            <div className="metric-foot">{m.foot}</div>
          </section>
        ))}
      </div>
      <div className="overview-grid">
        <LedgerChart />
        <section className="store-performance">
          <div className="section-header">
            <h2>{t("design.performance")}</h2>
          </div>
          {v.stores.map((s) => (
            <div className="store-performance-row" key={s.store}>
              <span className="performance-store">
                <Landmark size={18} />
                {t(s.store === "M01" ? "shell.store1" : "shell.store2")}
              </span>
              <strong className="ltr">{formatMoney(s.total)}</strong>
              <small>
                {s.count} {t("dash.salesTodayFoot")}
              </small>
              <Button asChild variant="link">
                <Link to="/sales">
                  {t("sale.title")}
                  <ArrowRight size={14} />
                </Link>
              </Button>
            </div>
          ))}
          <div className="performance-action">
            <Button asChild variant="outline">
              <Link to="/reports">
                {t("dash.viewReports")}
                <ArrowRight size={15} />
              </Link>
            </Button>
          </div>
        </section>
      </div>
      <div className="bottom-grid">
        <section className="recent-panel">
          <div className="section-header">
            <h2>{t("retail.activity")}</h2>
            <Button variant="link" asChild>
              <Link to="/sales">
                {t("sale.title")}
                <ArrowRight />
              </Link>
            </Button>
          </div>
          <DataTable rows={v.rows} columns="sales" />
        </section>
        <div className="dashboard-followup">
          <LocalCreditList alertsOnly />
          <section className="dashboard-alerts">
            <h2>{t("design.alerts")}</h2>
            <Button variant="ghost" asChild>
              <Link to="/stock/accessories">
                <AlertTriangle size={18} />
                {t("inv.accTitle")}
                <strong>{v.lowStock}</strong>
              </Link>
            </Button>
            <Button variant="ghost" asChild>
              <Link to="/cash">
                <History size={18} />
                {t("cash.reviewPending")}
                <strong>{v.pendingReviews}</strong>
              </Link>
            </Button>
          </section>
          {scope !== "M02" && (
            <section className="facility-summary">
              <Landmark size={22} />
              <h2>{t("design.facility")}</h2>
              <p>{t("design.bankOnly")}</p>
              <Button asChild variant="outline">
                <Link to="/facility">
                  {t("nav.facility")}
                  <ArrowRight size={14} />
                </Link>
              </Button>
            </section>
          )}
        </div>
      </div>
      <div className="retail-shortcuts">
        {[
          { name: t("dash.addPhone"), path: "/stock/phones" as const, icon: Smartphone },
          {
            name: t("dash.receiveAccessories"),
            path: "/stock/accessories" as const,
            icon: Headphones,
          },
          { name: t("dash.viewCash"), path: "/cash" as const, icon: Wallet },
        ].map((a) => (
          <Button asChild variant="outline" key={a.path}>
            <Link to={a.path}>
              <a.icon />
              {a.name}
              <ArrowRight size={15} />
            </Link>
          </Button>
        ))}
      </div>
      {ws.fixturePolicy === "empty" && <p className="session-notice">{t("review.onboarding")}</p>}
    </div>
  );
}
