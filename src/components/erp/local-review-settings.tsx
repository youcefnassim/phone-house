import { useState } from "react";
import { Download, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useErp } from "./context";
import { useSession } from "@/data/session-store";
import { projectSnapshot } from "@/data/business-demo";
import {
  useTestWorkspace,
  getStorageMode,
  getStorageError,
  reviewDataSummary,
  exportLocalReview,
  prepareLocalCleanStart,
  LOCAL_REVIEW_TARGET,
  cleanStartPhrase,
  type CleanStart,
} from "@/data/test-workspace";

export function LocalReviewSettings() {
  const { t } = useErp();
  const ws = useTestWorkspace();
  useSession();
  const [kind, setKind] = useState<CleanStart | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const summary = reviewDataSummary();
  const records = projectSnapshot("ALL");
  summary.clients = records.customers.length;
  summary.drafts += [
    ...records.debts,
    ...records.repayments,
    ...records.suppliers,
    ...records.purchases,
    ...records.facilities,
    ...records.cases,
  ].filter((r) => r.source === "Fixture").length;
  const select = (value: CleanStart | null) => {
    setKind(value);
    setConfirmation("");
    setAck(false);
    setMessage("");
  };
  return (
    <div className="settings-sections">
      <section aria-label={t("review.title")}>
        <h2>{t("review.title")}</h2>
        <p>{t("review.warning")}</p>
        <p>{t("review.services")}</p>
        <dl className="detail-list">
          <dt>{t("tw.storage")}</dt>
          <dd>{getStorageMode() === "indexeddb" ? "IndexedDB" : "memory"}</dd>
          <dt>{t("tw.revision")}</dt>
          <dd className="ltr">{ws.revision}</dd>
        </dl>
        {getStorageError() && (
          <p role="alert">{t("tw.storageError", { error: getStorageError() })}</p>
        )}
        {ws.fixturePolicy === "empty" && <p role="status">{t("review.onboarding")}</p>}
      </section>
      <section>
        <h2>{t("review.clean")}</h2>
        <p>{t("review.cleanText")}</p>
        <h3>{t("review.summary")}</h3>
        <dl className="detail-list">
          {Object.entries(summary).map(([key, value]) => (
            <div className="policy-row" key={key}>
              <dt>{t(`review.${key}` as Parameters<typeof t>[0])}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
        <p>{t("review.privacy")}</p>
        <Button
          variant="outline"
          onClick={() => {
            const url = URL.createObjectURL(
              new Blob([JSON.stringify(exportLocalReview(), null, 2)], {
                type: "application/json",
              }),
            );
            const a = document.createElement("a");
            a.href = url;
            a.download = "phonehouse-local-review.json";
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
          }}
        >
          <Download />
          {t("review.export")}
        </Button>
        <div className="settings-sections">
          <section>
            <h3>{t("review.rehearsal")}</h3>
            <p>{t("review.rehearsalText")}</p>
            <Button variant="outline" disabled={busy} onClick={() => select("rehearsal")}>
              {t("review.rehearsal")}
            </Button>
          </section>
          <section>
            <h3>{t("review.empty")}</h3>
            <p>{t("review.emptyText")}</p>
            <Button variant="outline" disabled={busy} onClick={() => select("empty")}>
              {t("review.empty")}
            </Button>
          </section>
        </div>
        {kind && (
          <form
            className="draft-form"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setMessage("");
              try {
                await prepareLocalCleanStart({
                  kind,
                  confirmation,
                  acknowledged: ack,
                  target: LOCAL_REVIEW_TARGET,
                });
                select(null);
                setMessage(t("review.done"));
              } catch (error) {
                setMessage(error instanceof Error ? error.message : String(error));
              } finally {
                setBusy(false);
              }
            }}
          >
            <strong className="ltr">{cleanStartPhrase(kind)}</strong>
            <label>
              {t("review.confirm")}
              <input
                dir="ltr"
                aria-label={t("review.confirm")}
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
                autoComplete="off"
              />
            </label>
            <label>
              <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />
              {t("review.ack")}
            </label>
            <div className="heading-actions">
              <Button
                type="submit"
                variant="destructive"
                disabled={
                  busy ||
                  !ack ||
                  confirmation !== cleanStartPhrase(kind) ||
                  getStorageMode() !== "indexeddb"
                }
              >
                <Trash2 />
                {busy ? t("review.pending") : t("review.delete")}
              </Button>
              <Button type="button" variant="outline" disabled={busy} onClick={() => select(null)}>
                {t("review.cancel")}
              </Button>
            </div>
          </form>
        )}
        {message && <p role="status">{message}</p>}
      </section>
    </div>
  );
}
