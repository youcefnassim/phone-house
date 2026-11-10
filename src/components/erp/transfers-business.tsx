import { resolveLocalTransfer, cancelLocalTransfer } from "@/data/local-transfer-resolution";
import { stockCountText } from "@/locales/stock-count";
import { useState } from "react";
import { ArrowUpRight, ScanLine, LockKeyhole, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { transferStages, inScope, type TransferStage } from "@/domain/business";
import { storeLabel, type StoreId } from "@/domain/erp";
import { useTestWorkspace, workspaceIdentities } from "@/data/test-workspace";
import { canApproveTransfer } from "@/domain/permissions";
import {
  createTestTransfer,
  approveTestTransfer,
  advanceTestTransfer,
  scanTestTransfer,
  transferConflicts,
  revalidateTestTransfer,
} from "@/data/test-workflows";
import { localizeMessage } from "@/locales/messages";
import { displayName } from "@/locales/display";
import { OperationDialog } from "./operation-ui";
import { BusinessPage, useBusiness, BusinessTable, AddAction } from "./business-ui";
import { useErp } from "./context";
import type { MessageKey } from "@/i18n";

const stageKey = (s: TransferStage) => `fl.stage.${s}` as MessageKey;

export function TransfersPage() {
  const c = useBusiness();
  const { t, lang } = useErp();
  const ws = useTestWorkspace();
  const x = stockCountText(lang);
  const [carrier, setCarrier] = useState("");
  const [reason, setReason] = useState("");
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState<StoreId>("M01");
  const [reference, setReference] = useState("");
  const [lines, setLines] = useState<{ id: string; quantity: number }[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [scan, setScan] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [saId, setSaId] = useState("");
  const [mgrId, setMgrId] = useState("");
  const to: StoreId = from === "M01" ? "M02" : "M01";
  const visible = ws.transfers.filter((r) => inScope(r.from, c.scope) || inScope(r.to, c.scope));
  const selected = ws.transfers.find((r) => r.id === selectedId);
  const conflicts = selected ? transferConflicts(selected, ws) : [];
  const run = (fn: () => void, ok?: string) => {
    try {
      fn();
      setError("");
      if (ok) setNotice(ok);
    } catch (e) {
      setError(localizeMessage(lang, e instanceof Error ? e.message : String(e)));
    }
  };
  const phones = ws.phones.filter((p) => p.store === from && p.status === "Available");
  const accessories = ws.accessories.filter((a) => a.store === from && a.quantity > 0);
  const nameOf = (id: string) =>
    ws.phones.find((p) => p.id === id) ?? ws.accessories.find((a) => a.id === id);
  const add = (id: string, max: number) =>
    setLines((prev) => {
      const ex = prev.find((l) => l.id === id);
      if (ex)
        return ex.quantity >= max
          ? prev
          : prev.map((l) => (l.id === id ? { ...l, quantity: l.quantity + 1 } : l));
      return [...prev, { id, quantity: 1 }];
    });
  const historyLabel = (h: string) => {
    if ((transferStages as string[]).includes(h)) return t(stageKey(h as TransferStage));
    const a = /^APPROVAL (SUPER_ADMIN|M02_MANAGER) · (.+)$/.exec(h);
    if (a)
      return `${a[1] === "SUPER_ADMIN" ? t("tr.superAdminApproval") : t("tr.m02Approval")} · ${displayName(lang, a[2] ?? "")}`;
    const rv = /^REVALIDATED · (.+)$/.exec(h);
    if (rv) return `${t("fl.historyRevalidated")} · ${rv[1]}`;
    const sc = /^SCAN (.+)$/.exec(h);
    if (sc) return `${t("tr.scan")} · ${sc[1]}`;
    return h;
  };
  const identities = workspaceIdentities(ws);
  const approvers = (kind: "SUPER_ADMIN" | "M02_MANAGER") =>
    identities.filter(
      (u) =>
        u.active &&
        u.stores.some((store) =>
          canApproveTransfer(kind, u.role, u.role === "SUPER_ADMIN" ? "GLOBAL" : store),
        ),
    );
  const superAdmins = approvers("SUPER_ADMIN");
  const managers = approvers("M02_MANAGER");
  return (
    <BusinessPage
      title={t("tr.title")}
      eyebrow={t("tr.eyebrow")}
      context={c}
      notice={notice}
      actions={
        <AddAction
          onClick={() => {
            setFrom(c.scope === "ALL" ? "M01" : c.scope);
            setLines([]);
            setReference("");
            setError("");
            setOpen(true);
          }}
        >
          {t("tr.draft")}
        </AddAction>
      }
    >
      <details className="retail-details">
        <summary>{t("retail.details")}</summary>
        <ol className="process-strip">
          {transferStages.map((s, i) => (
            <li key={s}>
              <b>{i + 1}</b>
              {t(stageKey(s))}
            </li>
          ))}
        </ol>
      </details>
      <BusinessTable
        headers={[
          t("tr.colTransfer"),
          t("tr.colDirection"),
          t("tr.colContents"),
          t("tr.colStage"),
          t("tr.colApprovals"),
          t("tr.colDetails"),
        ]}
        empty={!visible.length}
      >
        {visible.map((r) => (
          <tr key={r.id}>
            <td>
              <bdi>{r.reference}</bdi>
              <details className="retail-details table-details">
                <summary>{t("retail.technical")}</summary>
                <bdi>{r.id}</bdi>
              </details>
            </td>
            <td>
              <span className="ltr">
                {r.from} → {r.to}
              </span>
            </td>
            <td>
              {r.lines.reduce((n, l) => n + l.quantity, 0)} {t("tr.units")}
            </td>
            <td>
              {t(stageKey(r.stage))}
              {transferConflicts(r, ws).length > 0 && (
                <span className="conflict-badge" role="status">
                  <TriangleAlert size={13} />
                  {t("fl.conflictBadge")}
                </span>
              )}
            </td>
            <td>
              {t("biz.roleSuperAdmin")}:{" "}
              {r.superAdminBy ? displayName(lang, r.superAdminBy) : t("tr.pending")}
              <small>
                {t("biz.roleManager")} M02:{" "}
                {r.m02ManagerBy ? displayName(lang, r.m02ManagerBy) : t("tr.pending")}
              </small>
            </td>
            <td>
              <Button
                variant="ghost"
                size="icon"
                aria-label={t("tr.detailLabel", { id: r.id })}
                onClick={() => {
                  setSelectedId(r.id);
                  setError("");
                }}
              >
                <ArrowUpRight />
              </Button>
            </td>
          </tr>
        ))}
      </BusinessTable>
      <OperationDialog open={open} onClose={() => setOpen(false)} title={t("tr.contentsDraft")}>
        <div className="operation-form-grid">
          <label className="form-label">
            {t("tr.sourceStore")}
            <select
              aria-label={t("tr.sourceStore")}
              value={from}
              onChange={(e) => {
                setFrom(e.target.value as StoreId);
                setLines([]);
              }}
            >
              {(["M01", "M02"] as StoreId[])
                .filter((s) => c.scope === "ALL" || c.scope === s)
                .map((s) => (
                  <option key={s} value={s}>
                    {storeLabel(s)}
                  </option>
                ))}
            </select>
          </label>
          <label className="form-label">
            {t("tr.fDestination")}
            <input aria-label={t("tr.fDestination")} readOnly value={storeLabel(to)} />
          </label>
          <label className="form-label">
            {t("tr.fReference")}
            <input
              aria-label={t("tr.fReference")}
              dir="ltr"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            />
          </label>
        </div>
        <p className="field-hint">{t("fl.pickCurrent")}</p>
        <div className="transfer-picker">
          {phones.map((p) => (
            <Button key={p.id} variant="outline" onClick={() => add(p.id, 1)}>
              {p.name}
              <small className="ltr">{p.imei}</small>
            </Button>
          ))}
          {accessories.map((a) => (
            <Button key={a.id} variant="outline" onClick={() => add(a.id, a.quantity)}>
              {a.name}
              <small>
                <bdi>{a.quantity}</bdi> {t("tr.units")}
              </small>
            </Button>
          ))}
        </div>
        <BusinessTable
          headers={[t("tr.colItem"), t("tr.colQuantity"), t("tr.colRemove")]}
          empty={!lines.length}
        >
          {lines.map((l) => {
            const it = nameOf(l.id);
            return (
              <tr key={l.id}>
                <td>
                  {it?.name}
                  <small className="ltr">{it && "imei" in it ? it.imei : it?.code}</small>
                </td>
                <td>
                  <bdi>{l.quantity}</bdi>
                </td>
                <td>
                  <Button
                    variant="outline"
                    onClick={() => setLines((prev) => prev.filter((r) => r.id !== l.id))}
                  >
                    {t("tr.remove")}
                  </Button>
                </td>
              </tr>
            );
          })}
        </BusinessTable>
        {error && (
          <p role="alert" className="error-text">
            {error}
          </p>
        )}
        <div className="form-actions">
          <Button variant="outline" onClick={() => setOpen(false)}>
            {t("fl.cancel")}
          </Button>
          <Button
            onClick={() =>
              run(() => {
                const tr = createTestTransfer({ from, to, reference, lines });
                setOpen(false);
                setSelectedId(tr.id);
              }, t("tr.draftCreated"))
            }
          >
            {t("fl.saveTransfer")}
          </Button>
        </div>
      </OperationDialog>
      <OperationDialog
        open={!!selected}
        onClose={() => setSelectedId("")}
        title={selected ? `${t("tr.workflow")} · ${selected.id}` : t("tr.workflow")}
      >
        {selected && (
          <>
            <ol className="process-strip">
              {transferStages.map((s) => (
                <li key={s} aria-current={s === selected.stage ? "step" : undefined}>
                  {s === selected.stage ? "● " : ""}
                  {t(stageKey(s))}
                </li>
              ))}
            </ol>
            {conflicts.length > 0 && (
              <div className="conflict-notice" role="alert">
                <TriangleAlert />
                <div>
                  <strong>{t("fl.conflictTitle")}</strong>
                  <p>{t("fl.conflictBody", { items: conflicts.join(", ") })}</p>
                  <Button
                    variant="outline"
                    onClick={() =>
                      run(() => revalidateTestTransfer(selected.id), t("fl.revalidated"))
                    }
                  >
                    {t("fl.revalidate")}
                  </Button>
                </div>
              </div>
            )}
            <BusinessTable
              headers={[t("tr.colItem"), t("tr.colExpected"), t("tr.colScanned")]}
              empty={false}
            >
              {selected.lines.map((l) => (
                <tr key={l.id} className={conflicts.includes(l.id) ? "row-conflict" : undefined}>
                  <td>
                    {l.name}
                    <small className="ltr">{l.imei ?? l.code}</small>
                  </td>
                  <td>
                    <bdi>{l.quantity}</bdi>
                  </td>
                  <td>
                    <bdi>{selected.scanned[l.id] ?? 0}</bdi>
                  </td>
                </tr>
              ))}
            </BusinessTable>
            {selected.stage === "APPROVALS" && c.role !== "SELLER" && (
              <div className="operation-form-grid">
                <div className="form-label">
                  {t("tr.superAdminApproval")}
                  <select
                    aria-label={t("tr.superAdminApproval")}
                    value={saId}
                    disabled={selected.superAdmin}
                    onChange={(e) => setSaId(e.target.value)}
                  >
                    <option value="">{t("op.select")}</option>
                    {superAdmins.map((u) => (
                      <option key={u.id} value={u.id}>
                        {displayName(lang, u.name)}
                      </option>
                    ))}
                  </select>
                  <Button
                    variant="outline"
                    disabled={selected.superAdmin || !saId}
                    onClick={() => run(() => approveTestTransfer(selected.id, "SUPER_ADMIN", saId))}
                  >
                    {selected.superAdmin ? t("tr.draftRecorded") : t("fl.recordApproval")}
                  </Button>
                </div>
                <div className="form-label">
                  {t("tr.m02Approval")}
                  <select
                    aria-label={t("tr.m02Approval")}
                    value={mgrId}
                    disabled={selected.m02Manager}
                    onChange={(e) => setMgrId(e.target.value)}
                  >
                    <option value="">{t("op.select")}</option>
                    {managers.map((u) => (
                      <option key={u.id} value={u.id}>
                        {displayName(lang, u.name)}
                      </option>
                    ))}
                  </select>
                  <Button
                    variant="outline"
                    disabled={selected.m02Manager || !mgrId}
                    onClick={() =>
                      run(() => approveTestTransfer(selected.id, "M02_MANAGER", mgrId))
                    }
                  >
                    {selected.m02Manager ? t("tr.draftRecorded") : t("fl.recordApproval")}
                  </Button>
                </div>
                <p className="field-hint">{t("fl.approvalNotAuth")}</p>
              </div>
            )}
            {selected.stage === "RECEIPT" && (
              <>
                <form
                  className="scanner-field"
                  onSubmit={(e) => {
                    e.preventDefault();
                    run(() => scanTestTransfer(selected.id, scan));
                    setScan("");
                  }}
                >
                  <ScanLine />
                  <input
                    aria-label={t("tr.scanLabel")}
                    dir="ltr"
                    value={scan}
                    onChange={(e) => setScan(e.target.value)}
                    placeholder={t("tr.scanPlaceholder")}
                  />
                  <Button type="submit">{t("tr.scan")}</Button>
                </form>
              </>
            )}
            {error && (
              <p role="alert" className="error-text">
                {error}
              </p>
            )}
            {selected.stage === "DISPATCH" && (
              <label className="form-label">
                {x.carrier}
                <input value={carrier} onChange={(e) => setCarrier(e.target.value)} />
              </label>
            )}
            {c.role === "SUPER_ADMIN" && (
              <>
                <label className="form-label">
                  {x.reason}
                  <input value={reason} onChange={(e) => setReason(e.target.value)} />
                </label>
                {["IN_TRANSIT", "RECEIPT"].includes(selected.stage) && (
                  <Button
                    size="lg"
                    variant="outline"
                    disabled={!reason.trim()}
                    onClick={() => run(() => cancelLocalTransfer(selected.id, reason))}
                  >
                    {x.cancel}
                  </Button>
                )}
                {selected.discrepancyLines?.map((d) => (
                  <div className="flex flex-wrap gap-3 py-3" key={d.id}>
                    <bdi>
                      {d.id} · {d.quantity} · {d.outcome ?? x.pending}
                    </bdi>
                    {!d.outcome && (
                      <>
                        {(["RETURN", "WRITE_OFF"] as const).map((outcome) => (
                          <Button
                            size="lg"
                            key={outcome}
                            disabled={!reason.trim()}
                            onClick={() =>
                              run(() => resolveLocalTransfer(selected.id, d.id, outcome, reason))
                            }
                          >
                            {outcome === "RETURN" ? x.returned : x.writeoff}
                          </Button>
                        ))}
                      </>
                    )}
                  </div>
                ))}
              </>
            )}
            {selected.stage !== "COMPLETED" && (
              <Button
                size="lg"
                disabled={
                  conflicts.length > 0 || (selected.stage === "DISPATCH" && !carrier.trim())
                }
                onClick={() =>
                  run(() => advanceTestTransfer(selected.id, carrier), t("tr.stageAdvanced"))
                }
              >
                {t("fl.advanceTo", {
                  stage: t(
                    stageKey(
                      transferStages[transferStages.indexOf(selected.stage) + 1] ?? selected.stage,
                    ),
                  ),
                })}
              </Button>
            )}
            <ul className="operation-history">
              {selected.history.map((h, i) => (
                <li key={i}>
                  <bdi>{historyLabel(h)}</bdi>
                </li>
              ))}
            </ul>
            <div className="safety-notice">
              <LockKeyhole />
              {t("fl.destinationNotice")}
            </div>
          </>
        )}
      </OperationDialog>
    </BusinessPage>
  );
}
