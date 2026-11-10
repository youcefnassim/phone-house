import { LocalCashMovement } from "./cash-movement";
import { visibleCashMovements } from "@/domain/blind-count";
import { permits } from "@/domain/permissions";
import { useState } from "react";
import { Wallet, Plus, ArrowDownUp, LockKeyhole, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useErp } from "./context";
import { formatMoney, storeLabel, type StoreId, minorUnits, decimalValue } from "@/domain/erp";
import { Status } from "./shared";
import { OperationDialog } from "./operation-ui";
import { localizeMessage } from "@/locales/messages";
import {
  useTestWorkspace,
  openShiftFor,
  openTestShift,
  addTestCashMovement,
  blindCloseTestShift,
  expectedCash,
  sellersFor,
  reviewActor,
  reviewTestClose,
  type TestShift,
} from "@/data/test-workspace";
import { displayName } from "@/locales/display";

type Mode = { kind: "open" | "move" | "close"; store: StoreId; shiftId?: string } | null;

// Cash registers backed by the browser-local TEST workspace: exactly one
// physical drawer per store, sequential shifts, blind close. Expected cash is
// never shown while a shift is open or during the count.
export function CashRegisters() {
  const { scope, t, lang } = useErp();
  const ws = useTestWorkspace();
  const stores: StoreId[] = (["M01", "M02"] as StoreId[]).filter(
    (s) => scope === "ALL" || scope === s,
  );
  const actor = reviewActor(ws);
  const [reviewId, setReviewId] = useState("");
  const [flagged, setFlagged] = useState(false);
  const [reviewNote, setReviewNote] = useState("");
  const [mode, setMode] = useState<Mode>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [amount, setAmount] = useState("");
  const [seller, setSeller] = useState("");
  const [reference, setReference] = useState("");
  const [direction, setDirection] = useState<"CASH_IN" | "CASH_OUT">("CASH_IN");
  const begin = (m: Mode) => {
    setMode(m);
    setError("");
    setAmount("");
    setReference("");
    setSeller(m ? ws.sellers[m.store] : "");
  };
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!mode) return;
    try {
      if (mode.kind === "open") {
        const s = openTestShift(mode.store, seller, amount);
        setNotice(t("tw.cash.opened", { id: s.id }));
      } else if (mode.kind === "move") {
        const m = addTestCashMovement(mode.store, direction, amount, reference, {
          shiftId: mode.shiftId,
        });
        setNotice(t("tw.cash.moved", { id: m.id }));
      } else {
        const s = blindCloseTestShift(mode.store, amount, {
          shiftId: mode.shiftId,
          operator: ws.sellers[mode.store],
        });
        setNotice(t("tw.cash.closed", { id: s.id, discrepancy: s.discrepancy ?? "0.00" }));
      }
      setMode(null);
    } catch (err) {
      setError(localizeMessage(lang, err instanceof Error ? err.message : String(err)));
    }
  };
  const shifts = ws.shifts.filter((s) => stores.includes(s.store));
  const movements = visibleCashMovements(
    ws.cash.filter((c) => stores.includes(c.store)),
    ws.shifts,
    actor?.role,
  );
  const kindLabel = (k: string) =>
    k === "OPENING"
      ? t("cash.openingFloat")
      : k === "SALE"
        ? t("tw.cash.saleIn")
        : k === "CASH_IN"
          ? t("cash.cashIn")
          : t("cash.cashOut");
  return (
    <div className="page-enter module-page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">{t("cash.eyebrow")}</div>
          <h1>
            {t("cash.title")}
            <span className="heading-dot">.</span>
          </h1>
          <details className="retail-details heading-details">
            <summary>{t("retail.details")}</summary>
            <p>{t("tw.cash.subtitle")}</p>
          </details>
        </div>
      </div>
      <div className="drawer-grid">
        {stores.map((store) => {
          const open = openShiftFor(store, ws);
          const last = ws.shifts.find((s) => s.store === store && s.status === "CLOSED");
          return (
            <section key={store} className="drawer-item" data-testid={`drawer-${store}`}>
              <div className="section-header">
                <h2>
                  <Wallet size={17} />
                  {storeLabel(store)}
                </h2>
                <Status status={open ? "Open" : "Closed"} />
              </div>
              <dl className="detail-list">
                {open ? (
                  <>
                    <dt>{t("cash.seller")}</dt>
                    <dd>
                      {displayName(lang, open.seller)} · {t("pos.notAuthenticated")}
                    </dd>
                    <dt>{t("cash.openingCash")}</dt>
                    <dd className="ltr">{formatMoney(open.opening)}</dd>
                    <dt>{t("tw.cash.salesCount")}</dt>
                    <dd>{ws.sales.filter((s) => s.shiftId === open.id).length}</dd>
                    <dt>{t("tw.cash.expected")}</dt>
                    <dd>{t("cash.hiddenDuringCount")}</dd>
                  </>
                ) : (
                  <>
                    <dt>{t("tw.cash.shift")}</dt>
                    <dd>{t("tw.cash.noShift")}</dd>
                    {last && (
                      <>
                        <dt>{t("tw.cash.lastClose")}</dt>
                        <dd className="ltr">{formatMoney(last.counted ?? "0")}</dd>
                        <dt>{t("tw.cash.discrepancyLabel")}</dt>
                        <dd className="ltr" data-testid={`discrepancy-${store}`}>
                          {last.discrepancy} DZD
                        </dd>
                      </>
                    )}
                  </>
                )}
              </dl>
              <details className="retail-details">
                <summary>{t("retail.technical")}</summary>
                <dl className="detail-list">
                  <dt>{t("cash.physicalDrawer")}</dt>
                  <dd>
                    <bdi>DRAWER-{store}</bdi>
                  </dd>
                  {open && (
                    <>
                      <dt>{t("tw.cash.shift")}</dt>
                      <dd>
                        <bdi>{open.id}</bdi>
                      </dd>
                    </>
                  )}
                </dl>
              </details>
              <div className="form-actions">
                {open ? (
                  <>
                    <Button
                      variant="outline"
                      disabled={
                        !actor ||
                        !permits(
                          actor.role,
                          actor.role === "SUPER_ADMIN" ? "GLOBAL" : store,
                          store,
                          "cash.evidence",
                        )
                      }
                      className="hidden"
                      onClick={() => begin({ kind: "move", store, shiftId: open.id })}
                    >
                      <ArrowDownUp />
                      {t("tw.cash.movement")}
                    </Button>
                    <Button onClick={() => begin({ kind: "close", store, shiftId: open.id })}>
                      <LockKeyhole />
                      {t("tw.cash.blindClose")}
                    </Button>
                  </>
                ) : (
                  <Button onClick={() => begin({ kind: "open", store })}>
                    <Plus />
                    {t("tw.cash.open")}
                  </Button>
                )}
              </div>
              {open && <LocalCashMovement store={store} />}
            </section>
          );
        })}
      </div>
      {notice && (
        <p role="status" className="session-notice">
          {notice}
        </p>
      )}
      <details className="retail-details">
        <summary>{t("tw.cash.history")}</summary>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t("cash.colReference")}</th>
                <th>{t("cash.colDrawer")}</th>
                <th>{t("cash.colSeller")}</th>
                <th>{t("cash.colAmount")}</th>
                <th>{t("cash.colState")}</th>
              </tr>
            </thead>
            <tbody>
              {shifts.map((s: TestShift) => (
                <tr key={s.id}>
                  <td className="ltr">{s.id}</td>
                  <td className="ltr">
                    {s.drawer}
                    <small>{storeLabel(s.store)}</small>
                  </td>
                  <td>{displayName(lang, s.seller)}</td>
                  <td className="ltr">
                    {formatMoney(s.opening)}
                    <small>
                      {t("pos.cash")}:{" "}
                      {formatMoney(
                        decimalValue(
                          ws.sales
                            .filter((x) => x.shiftId === s.id && x.tender === "Cash")
                            .reduce((n, x) => n + minorUnits(x.total), 0n),
                        ),
                      )}{" "}
                      · {t("pos.bank")}:{" "}
                      {formatMoney(
                        decimalValue(
                          ws.sales
                            .filter((x) => x.shiftId === s.id && x.tender === "Bank")
                            .reduce((n, x) => n + minorUnits(x.total), 0n),
                        ),
                      )}
                    </small>
                    {s.status === "CLOSED" && (
                      <small>
                        {t("tw.cash.countedExpected", {
                          counted: formatMoney(s.counted ?? "0"),
                          expected: formatMoney(s.expectedAtClose ?? "0"),
                          discrepancy: s.discrepancy ?? "",
                        })}
                      </small>
                    )}
                  </td>
                  <td>
                    <Status status={s.status === "OPEN" ? "Open" : "Closed"} />
                    {s.status === "CLOSED" && (
                      <>
                        <small>
                          {displayName(lang, s.closedBy ?? s.seller)} ·{" "}
                          {s.closedAt && new Date(s.closedAt).toLocaleString(lang)}
                        </small>
                        <small>
                          {s.reviewStatus === "OWNER_REVIEWED_FLAGGED"
                            ? t("cash.reviewFlagged")
                            : s.reviewStatus === "OWNER_REVIEWED_NO_ISSUE"
                              ? t("cash.reviewOk")
                              : s.store === "M01"
                                ? t("cash.reviewPending")
                                : ""}
                        </small>
                        {actor?.role === "SUPER_ADMIN" && s.ownerReview && (
                          <details>
                            <summary>{t("cash.ownerReview")}</summary>
                            <p>
                              {displayName(lang, s.ownerReview.actorId)} ·{" "}
                              {new Date(s.ownerReview.at).toLocaleString(lang)}
                            </p>
                            <p>{s.ownerReview.note}</p>
                          </details>
                        )}
                        {actor?.role === "SUPER_ADMIN" && !s.ownerReview && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setReviewId(s.id);
                              setFlagged(false);
                              setReviewNote("");
                              setError("");
                            }}
                          >
                            {t("cash.ownerReview")}
                          </Button>
                        )}
                      </>
                    )}
                  </td>
                </tr>
              ))}
              {movements.map((m) => (
                <tr key={m.id}>
                  <td className="ltr">
                    {m.reference}
                    <small>
                      {new Intl.DateTimeFormat(lang, {
                        timeZone: "Africa/Algiers",
                        dateStyle: "short",
                        timeStyle: "short",
                      }).format(new Date(m.at))}
                    </small>
                  </td>
                  <td className="ltr">DRAWER-{m.store}</td>
                  <td>
                    {kindLabel(m.kind)}
                    <small>{displayName(lang, m.seller)}</small>
                  </td>
                  <td className="ltr">
                    {m.kind === "CASH_OUT" ? "-" : ""}
                    {formatMoney(m.amount)}
                  </td>
                  <td>
                    <small>{t("tw.localOnly")}</small>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!shifts.length && (
            <div className="empty-state">
              <History />
              <h3>{t("cash.noDrafts")}</h3>
            </div>
          )}
        </div>
      </details>
      <OperationDialog
        open={!!reviewId}
        onClose={() => setReviewId("")}
        title={t("cash.ownerReview")}
      >
        <form
          className="draft-form"
          onSubmit={(e) => {
            e.preventDefault();
            try {
              if (!actor) return;
              reviewTestClose(reviewId, flagged, reviewNote, actor.id);
              setReviewId("");
            } catch (err) {
              setError(localizeMessage(lang, err instanceof Error ? err.message : String(err)));
            }
          }}
        >
          <label>
            <input
              type="checkbox"
              checked={flagged}
              onChange={(e) => setFlagged(e.target.checked)}
            />
            {t("cash.flag")}
          </label>
          <label>
            {t("cash.reviewNote")}
            <textarea
              aria-label={t("cash.reviewNote")}
              value={reviewNote}
              onChange={(e) => setReviewNote(e.target.value)}
            />
          </label>
          {error && (
            <p role="alert" className="error-text">
              {error}
            </p>
          )}
          <Button type="submit">{t("cash.reviewSave")}</Button>
        </form>
      </OperationDialog>
      <OperationDialog
        open={mode !== null}
        onClose={() => setMode(null)}
        title={
          mode?.kind === "open"
            ? t("tw.cash.open")
            : mode?.kind === "move"
              ? t("tw.cash.movement")
              : t("tw.cash.blindClose")
        }
      >
        {mode && (
          <form className="draft-form" onSubmit={submit} noValidate>
            <p className="field-hint">
              {storeLabel(mode.store)} · DRAWER-{mode.store}
            </p>
            {mode.kind === "close" && <p className="field-hint">{t("tw.cash.blindHint")}</p>}
            {mode.kind === "open" && (
              <label className="form-label">
                {t("cash.operator")}
                <select
                  aria-label={t("cash.operator")}
                  value={seller}
                  onChange={(e) => setSeller(e.target.value)}
                >
                  {sellersFor(mode.store)
                    .filter((u) => actor?.role === "SUPER_ADMIN" || u.id === actor?.id)
                    .map((u) => (
                      <option key={u.id} value={u.name}>
                        {displayName(lang, u.name)}
                      </option>
                    ))}
                </select>
              </label>
            )}
            {mode.kind === "move" && (
              <label className="form-label">
                {t("tw.cash.direction")}
                <select
                  aria-label={t("tw.cash.direction")}
                  value={direction}
                  onChange={(e) => setDirection(e.target.value as "CASH_IN" | "CASH_OUT")}
                >
                  <option value="CASH_IN">{t("cash.cashIn")}</option>
                  <option value="CASH_OUT">{t("cash.cashOut")}</option>
                </select>
              </label>
            )}
            <label className="form-label">
              {mode.kind === "close"
                ? t("cash.blindTotal")
                : mode.kind === "move"
                  ? t("cash.movementAmount")
                  : t("cash.openingAmount")}
              <input
                name="amount"
                dir="ltr"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </label>
            {mode.kind === "move" && (
              <label className="form-label">
                {t("cash.shiftReference")}
                <input
                  name="reference"
                  aria-label={t("a11y.reference")}
                  dir="ltr"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                />
              </label>
            )}
            {error && (
              <p role="alert" className="error-text">
                {error}
              </p>
            )}
            <div className="form-actions">
              <Button type="button" variant="outline" onClick={() => setMode(null)}>
                {t("shared.cancel")}
              </Button>
              <Button type="submit">{t("tw.confirm")}</Button>
            </div>
          </form>
        )}
      </OperationDialog>
    </div>
  );
}
