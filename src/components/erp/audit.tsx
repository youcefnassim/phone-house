import { DT } from "./shared";
import { useState } from "react";
import { ShieldAlert, Search, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useErp } from "./context";
import { demoAreas, scopedRows } from "@/data/demo";
import { useSession } from "@/data/session-store";
import { useTestWorkspace } from "@/data/test-workspace";
import { storeLabel } from "@/domain/erp";
import { exportDemo } from "./shared";
import { useT } from "./context";
import { auditActionLabel, auditAreaLabel } from "@/locales/audit-actions";

// Audit history. Combines synthetic fixture events with this session's draft
// events (recorded by the shared session store). Nothing here is an immutable
// server-side log; the future audit_events table and transactional ledger are
// specified in docs/POSTGRES_INTEGRATION.md and remain UNDEPLOYED.

export function AuditPage() {
  const __t = useT();
  const { scope, lang, t } = useErp();
  const session = useSession();
  const [query, setQuery] = useState("");
  const [area, setArea] = useState("All areas");
  const ws = useTestWorkspace();
  const fixtures = scopedRows(
    ws.fixturePolicy === "empty" ? [] : (demoAreas["audit"] ?? []),
    scope,
  ).map((r) => ({
    id: r.id,
    at: r.detail,
    area: "Fixture",
    action: r.name,
    subject: r.id,
    store: r.store,
    actor: "Synthetic fixture",
  }));
  const sessionRows = session.audit
    .filter((e) => scope === "ALL" || e.store === scope || e.store === "ALL")
    .map((e) => ({
      id: e.id,
      at: e.at,
      area: e.area,
      action: e.action,
      subject: e.subjectId,
      store: e.store,
      actor: e.actor,
    }));
  const areas = ["All areas", ...new Set([...fixtures, ...sessionRows].map((r) => r.area))];
  const rows = [...sessionRows, ...fixtures].filter(
    (r) =>
      (area === "All areas" || r.area === area) &&
      [r.id, r.action, auditActionLabel(lang, r.action), r.subject, r.actor]
        .join(" ")
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  return (
    <div className="page-enter module-page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">{__t("audit.traceability_02e8")}</div>
          <h1>
            {__t("audit.audit_history_4174")}
            <span className="heading-dot">.</span>
          </h1>
          <p>{__t("audit.demo_data_session_events_are_vol_6437")}</p>
        </div>
        <div className="heading-actions">
          <Button
            variant="outline"
            onClick={() =>
              exportDemo(
                rows.map((r) => ({
                  id: r.id,
                  name: r.action,
                  detail: r.subject,
                  store: r.store === "ALL" ? "M01" : r.store,
                  status: "Draft" as const,
                  date: r.at,
                })),
                "audit",
              )
            }
          >
            <Download />
            {__t("audit.export_demo_4325")}
          </Button>
        </div>
      </div>
      <div className="safety-notice">
        <ShieldAlert size={17} />
        {__t("audit.session_events_disappear_on_relo_ddc1")}
      </div>
      <div className="module-stats">
        <div>
          <span>{__t("audit.session_events_5313")}</span>
          <strong>{sessionRows.length}</strong>
        </div>
        <div>
          <span>{__t("audit.fixture_events_08d7")}</span>
          <strong>{fixtures.length}</strong>
        </div>
        <div>
          <span>{__t("audit.actor_attribution_0d44")}</span>
          <strong className="stat-text">{__t("audit.unauthenticated_b403")}</strong>
        </div>
        <div>
          <span>{__t("audit.retention_7f6d")}</span>
          <strong className="stat-text">{__t("audit.session_only_eb12")}</strong>
        </div>
      </div>
      <div className="table-toolbar">
        <label className="search-field">
          <Search size={17} />
          <input
            aria-label={__t("audit.search_audit_events_eff6")}
            placeholder={__t("audit.search_events_524e")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <div className="table-filters">
          <select
            aria-label={__t("audit.area_filter_cb14")}
            value={area}
            onChange={(e) => setArea(e.target.value)}
          >
            {areas.map((a) => (
              <option key={a} value={a}>
                {auditAreaLabel(lang, a)}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="table-scroll">
        <table className="data-table business-table">
          <thead>
            <tr>
              <th>{__t("audit.event_030d")}</th>
              <th>{__t("fl.area")}</th>
              <th>{__t("audit.subject_171c")}</th>
              <th>{__t("audit.store_3cfb")}</th>
              <th>{__t("audit.actor_edef")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>
                  <strong>{auditActionLabel(lang, r.action)}</strong>
                  <small>
                    <bdi>{r.id}</bdi> · <DT text={r.at} />
                  </small>
                </td>
                <td>{auditAreaLabel(lang, r.area)}</td>
                <td>
                  <bdi>{r.subject}</bdi>
                </td>
                <td>
                  {r.store === "ALL" ? t("fl.allStores") : storeLabel(r.store as "M01" | "M02")}
                </td>
                <td>
                  <small>
                    <DT text={r.actor} />
                  </small>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && (
          <div className="empty-state">
            <Search />
            <h3>{__t("audit.no_matching_events_d7f1")}</h3>
          </div>
        )}
      </div>
    </div>
  );
}
