import { useSession } from "@/data/session-store";
import { useTestWorkspace, reviewActor, setReviewActor } from "@/data/test-workspace";
import { useEffect, useState, type ReactNode } from "react";
import { Plus, Search, LockKeyhole, RefreshCw, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useErp } from "./context";
import type { BusinessSnapshot, DemoReadState, Attachment } from "@/domain/business";
import type { Role } from "@/domain/erp";
import { businessDemo } from "@/data/business-demo";
import { Status } from "./shared";

export function useBusiness() {
  const { scope } = useErp();
  const sessionTick = useSession();
  const testTick = useTestWorkspace().version;
  const role: Role = reviewActor()?.role ?? "SELLER";
  const setRole = (value: Role) => {
    const id = value === "SUPER_ADMIN" ? "U-OWN" : value === "MANAGER" ? "U-M02" : "U-S01";
    setReviewActor(id);
  };
  const [state, setState] = useState<DemoReadState>("Live demo");
  const [data, setData] = useState<BusinessSnapshot | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading((l) => l || state === "Loading");
    setError("");
    businessDemo
      .read(scope, role, state)
      .then((value) => {
        if (active) {
          setData(value);
          setLoading(false);
        }
      })
      .catch((e) => {
        if (active) {
          setError(e instanceof Error ? e.message : "Demo read failed");
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [scope, role, state, version, sessionTick, testTick]);
  return {
    scope,
    role,
    setRole,
    state,
    setState,
    data,
    error,
    loading,
    retry: () => {
      setState("Live demo");
      setVersion((v) => v + 1);
    },
  };
}
export type BusinessContext = ReturnType<typeof useBusiness>;
export function BusinessPage({
  title,
  eyebrow,
  context,
  actions,
  children,
  notice,
}: {
  title: string;
  eyebrow: string;
  context: BusinessContext;
  actions?: ReactNode;
  children: ReactNode;
  notice?: string;
}) {
  const { t } = useErp();
  return (
    <div className="page-enter module-page business-page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">{eyebrow}</div>
          <h1>
            {title}
            <span className="heading-dot">.</span>
          </h1>
          <details className="retail-details heading-details">
            <summary>{t("retail.details")}</summary>
            <p>{t("biz.subtitle")}</p>
          </details>
        </div>
        <div className="heading-actions">{actions}</div>
      </div>
      <details className="retail-details" open={context.state !== "Live demo" || undefined}>
        <summary>{t("retail.more")}</summary>
        <div className="business-context">
          <label>
            {t("biz.rolePreview")}
            <select
              aria-label={t("biz.rolePreview")}
              value={context.role}
              onChange={(e) => context.setRole(e.target.value as Role)}
            >
              <option value="SELLER">{t("biz.roleSeller")}</option>
              <option value="MANAGER">{t("biz.roleManager")}</option>
              <option value="SUPER_ADMIN">{t("biz.roleSuperAdmin")}</option>
            </select>
          </label>
          <label>
            {t("biz.dataState")}
            <select
              aria-label={t("biz.dataState")}
              value={context.state}
              onChange={(e) => context.setState(e.target.value as DemoReadState)}
            >
              <option value="Live demo">{t("biz.stateLive")}</option>
              <option value="Loading">{t("biz.stateLoading")}</option>
              <option value="Empty">{t("biz.stateEmpty")}</option>
              <option value="Error">{t("biz.stateError")}</option>
              <option value="Forbidden">{t("biz.stateForbidden")}</option>
            </select>
          </label>
        </div>
      </details>
      {notice && (
        <p role="status" className="session-notice">
          {notice}
        </p>
      )}
      {context.state === "Forbidden" ? (
        <div className="permission-state">
          <LockKeyhole />
          <h2>{t("biz.accessUnavailable")}</h2>
          <Button variant="outline" onClick={context.retry}>
            {t("biz.returnToDemo")}
          </Button>
        </div>
      ) : context.loading ? (
        <div className="empty-state" role="status">
          <RefreshCw className="spin" />
          <h3>{t("biz.loadingRecords")}</h3>
        </div>
      ) : context.error ? (
        <div className="empty-state" role="alert">
          <h3>{t("biz.recordsUnavailable")}</h3>
          <p>{context.error}</p>
          <Button onClick={context.retry}>{t("biz.tryAgain")}</Button>
        </div>
      ) : (
        children
      )}
    </div>
  );
}
export function SearchBox({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
}) {
  return (
    <label className="search-field">
      <Search size={17} />
      <input
        aria-label={label}
        placeholder={label + "…"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
export function BusinessTable({
  headers,
  children,
  empty,
}: {
  headers: string[];
  children: ReactNode;
  empty: boolean;
}) {
  const { t } = useErp();
  return (
    <div className="table-scroll">
      <table className="data-table business-table">
        <thead>
          <tr>
            {headers.map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
      {empty && (
        <div className="empty-state">
          <Search />
          <h3>{t("biz.noRecords")}</h3>
        </div>
      )}
    </div>
  );
}
export function DraftState({ fixture = false }: { fixture?: boolean }) {
  const { t } = useErp();
  return (
    <>
      <Status status={fixture ? t("biz.syntheticFixture") : "Draft"} />
    </>
  );
}
export function AddAction({
  children,
  onClick,
  disabled = false,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <Button onClick={onClick} disabled={disabled}>
      <Plus />
      {children}
    </Button>
  );
}
export function Attachments({
  subjectId,
  rows,
  onAdd,
}: {
  subjectId: string;
  rows: Attachment[];
  onAdd: (row: Attachment) => void;
}) {
  const { t } = useErp();
  const [error, setError] = useState("");
  return (
    <section className="attachment-section">
      <h3 className="operation-section-title">
        <Paperclip size={16} />
        {t("biz.attachmentsTitle")}
      </h3>
      <label className="form-label">
        {t("biz.attachEvidence")}
        <input
          type="file"
          aria-label={t("biz.attachEvidence")}
          accept="image/*,.pdf,.txt"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            if (file.size > 10 * 1024 * 1024) {
              setError(t("biz.fileTooLarge"));
              return;
            }
            onAdd({
              id: `ATT-${Date.now()}`,
              subjectId,
              name: file.name,
              size: file.size,
              type: file.type,
            });
            setError("");
            e.target.value = "";
          }}
        />
      </label>
      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}
      <ul className="operation-history">
        {rows
          .filter((r) => r.subjectId === subjectId)
          .map((r) => (
            <li key={r.id}>
              {r.name}
              <small>
                {r.size} {t("biz.notUploaded")}
              </small>
            </li>
          ))}
      </ul>
    </section>
  );
}
