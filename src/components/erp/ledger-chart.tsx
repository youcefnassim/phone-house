import { useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useTestWorkspace } from "@/data/test-workspace";
import { ledgerView } from "@/data/ledger-view";
import { formatMoney, decimalValue, minorUnits } from "@/domain/erp";
import { algiersDate } from "@/domain/sales-review";
import { useErp } from "./context";

/** Chart values are read-only local ledger projections, never screenshot fixtures. */
export function LedgerChart() {
  const { scope, t } = useErp();
  const ws = useTestWorkspace();
  const v = ledgerView(ws, scope);
  const [period, setPeriod] = useState("week");
  const rows = period === "today" ? v.week.slice(-1) : v.week;
  const today = algiersDate(new Date());
  const first = new Date(`${today}T12:00:00+01:00`);
  first.setUTCDate(first.getUTCDate() - (period === "today" ? 0 : 6));
  const from = algiersDate(first);
  const total = decimalValue(
    ws.sales
      .filter(
        (s) =>
          (scope === "ALL" || s.store === scope) &&
          algiersDate(s.at) >= from &&
          algiersDate(s.at) <= today,
      )
      .reduce((a, s) => a + minorUnits(s.total), 0n),
  );
  return (
    <section className="sales-panel ledger-line-panel">
      <div className="section-header">
        <h2>{t("dash.salesActivity")}</h2>
        <label className="period-select">
          <select
            aria-label={t("dash.chartPeriod")}
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
          >
            <option value="week">{t("design.sevenDays")}</option>
            <option value="today">{t("dash.today")}</option>
          </select>
        </label>
      </div>
      <div className="chart-summary">
        <strong className="ltr">{formatMoney(total)}</strong>
        <span>{period === "week" ? t("design.weekTotal") : t("dash.salesToday")}</span>
      </div>
      <div className="ledger-line-chart" dir="ltr">
        <ResponsiveContainer
          width="100%"
          height="100%"
          minWidth={0}
          initialDimension={{ width: 600, height: 270 }}
        >
          <LineChart data={rows} margin={{ top: 12, right: 18, left: 0, bottom: 8 }}>
            <CartesianGrid stroke="var(--border)" vertical={false} />
            <XAxis
              dataKey="day"
              tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              width={54}
            />
            <Tooltip
              content={({ active, payload, label }) =>
                active && payload?.length ? (
                  <div className="chart-tooltip">
                    <strong>{label}</strong>
                    {payload.map((p) => (
                      <p key={String(p.dataKey)}>
                        {p.dataKey === "M01" ? t("shell.store1") : t("shell.store2")} ·{" "}
                        {formatMoney(String(p.value ?? 0))}
                      </p>
                    ))}
                  </div>
                ) : null
              }
            />
            {scope !== "M02" && (
              <Line
                type="linear"
                dataKey="M01"
                stroke="var(--primary)"
                strokeWidth={3}
                dot={{ r: 3 }}
                isAnimationActive={false}
              />
            )}{" "}
            {scope !== "M01" && (
              <Line
                type="linear"
                dataKey="M02"
                stroke="var(--teal)"
                strokeWidth={2}
                dot={{ r: 3 }}
                isAnimationActive={false}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="chart-legend">
        {scope !== "M02" && (
          <span>
            <i className="store-one" />
            {t("shell.store1")}
          </span>
        )}
        {scope !== "M01" && (
          <span>
            <i className="store-two" />
            {t("shell.store2")}
          </span>
        )}
      </div>
    </section>
  );
}
