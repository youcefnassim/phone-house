import { displayText } from "@/locales/display";
import { localizeMessage } from "@/locales/messages";
import { useState } from "react";
import { Search, ArrowUpRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import type { RecordRow } from "@/domain/erp";
import { formatMoney, storeLabel } from "@/domain/erp";
import { useErp } from "./context";
export function Status({ status }: { status: string }) {
  const { lang } = useErp();
  return (
    <span className={`status status-${status.toLowerCase().replaceAll(" ", "-")}`}>
      <i />
      {localizeMessage(lang, status)}
    </span>
  );
}
export function DataTable({
  rows,
  columns = "standard",
  onSelect,
}: {
  rows: RecordRow[];
  columns?: string;
  onSelect?: (row: RecordRow) => void;
}) {
  const { t } = useErp();
  return (
    <div className="table-scroll">
      <table className="data-table">
        <thead>
          <tr>
            <th>{columns === "sales" ? t("shared.transaction") : t("shared.reference")}</th>
            <th>{columns === "sales" ? t("shared.itemCustomer") : t("shared.nameDetails")}</th>
            <th>{t("shared.store")}</th>
            {columns === "stock" && <th>{t("shared.qtyType")}</th>}
            <th>{columns === "sales" ? t("shared.total") : t("shared.amount")}</th>
            <th>{t("shared.status")}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>
                <span className="record-id ltr">{row.id}</span>
                <small>{row.date ?? t("shared.demoRecord")}</small>
              </td>
              <td>
                <strong>
                  <DT text={row.name} />
                </strong>
                <small>
                  <DT text={row.detail} />
                </small>
              </td>
              <td>
                <span className="store-code">{row.store}</span>
              </td>
              {columns === "stock" && (
                <td>
                  {row.quantity ?? t("shared.unit")}
                  <small>{row.code ?? t("shared.serializedPhone")}</small>
                </td>
              )}
              <td className="amount-cell ltr">{row.amount ? formatMoney(row.amount) : "—"}</td>
              <td>
                <Status status={row.status} />
              </td>
              <td>
                {onSelect && (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t("shared.openRecord", { id: row.id })}
                    onClick={() => onSelect(row)}
                  >
                    <ArrowUpRight size={15} />
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && (
        <div className="empty-state">
          <Search />
          <h3>{t("shared.noRecords")}</h3>
          <p>{t("shared.noRecordsSub")}</p>
        </div>
      )}
    </div>
  );
}
export function DetailDialog({ row, onClose }: { row: RecordRow | null; onClose: () => void }) {
  const { t } = useErp();
  return (
    <Dialog
      open={!!row}
      onOpenChange={(value) => {
        if (!value) onClose();
      }}
    >
      <DialogContent>
        <DialogTitle>{row?.name ?? t("shared.record")}</DialogTitle>
        <DialogDescription>{t("shared.demoNoChanges")}</DialogDescription>
        {row && (
          <>
            <dl className="detail-list">
              <dt>{t("shared.reference")}</dt>
              <dd className="ltr">{row.id}</dd>
              <dt>{t("shared.details")}</dt>
              <dd>
                <DT text={row.detail} />
              </dd>
              <dt>{t("shared.store")}</dt>
              <dd>{storeLabel(row.store)}</dd>
              <dt>{t("shared.status")}</dt>
              <dd>
                <Status status={row.status} />
              </dd>
              <dt>{t("shared.amount")}</dt>
              <dd className="ltr">
                {row.amount ? formatMoney(row.amount) : t("shared.notRecorded")}
              </dd>
            </dl>
            <div className="safety-notice">{t("shared.productionNotice")}</div>
            <Button variant="outline" onClick={onClose}>
              {t("shared.closeRecord")}
            </Button>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
export function DraftDialog({
  title,
  open,
  onClose,
  onSave,
  fields,
}: {
  title: string;
  open: boolean;
  onClose: () => void;
  onSave: (name: string, reference: string) => void;
  fields?: string[];
}) {
  const { t } = useErp();
  const [error, setError] = useState("");
  const labels = fields ?? [
    t("shared.fieldName"),
    t("shared.fieldReference"),
    t("shared.fieldRemarks"),
  ];
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!value) {
          onClose();
          setError("");
        }
      }}
    >
      <DialogContent>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{t("shared.draftDescription")}</DialogDescription>
        <form
          className="draft-form"
          onSubmit={(e) => {
            e.preventDefault();
            const data = new FormData(e.currentTarget);
            const name = String(data.get("name") ?? "").trim();
            const reference = String(data.get("reference") ?? "").trim();
            if (name.length < 2) {
              setError(t("shared.draftNameError"));
              return;
            }
            onSave(name, reference);
            setError("");
            onClose();
          }}
        >
          {labels.map((field, index) => (
            <label key={field}>
              {field}
              <input
                name={index === 0 ? "name" : index === 1 ? "reference" : "remarks"}
                placeholder={field}
                required={index === 0}
                minLength={index === 0 ? 2 : undefined}
              />
            </label>
          ))}
          {error && (
            <p role="alert" className="error-text">
              {error}
            </p>
          )}
          <div className="safety-notice">{t("shared.draftSafety")}</div>
          <div className="form-actions">
            <Button type="button" variant="outline" onClick={onClose}>
              {t("shared.cancel")}
            </Button>
            <Button type="submit">
              <Plus />
              {t("shared.addDraft")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
export function exportDemo(rows: RecordRow[], area: string) {
  const clean = (v: string) => `"${v.replaceAll('"', '""')}"`;
  const csv =
    "DEMO DATA - NOT OPERATIONAL\nReference,Name,Details,Store,Status,Amount\n" +
    rows
      .map((r) =>
        [r.id, r.name, r.detail, storeLabel(r.store), r.status, r.amount ?? ""]
          .map(clean)
          .join(","),
      )
      .join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `demo-${area}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function DT({ text }: { text: string }) {
  const { lang } = useErp();
  return <>{displayText(lang, text)}</>;
}
