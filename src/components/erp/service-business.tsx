import { LocalSav } from "./local-sav";
import { useTestWorkspace } from "@/data/test-workspace";
import { documentText } from "@/locales/warranty-documents";
import { displayText } from "@/locales/display";
import { useState } from "react";
import { ArrowUpRight, LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  serviceSchema,
  serviceEventSchema,
  refundSchema,
  sumMoney,
  inScope,
  type ServiceCase,
} from "@/domain/business";
import { formatMoney } from "@/domain/erp";
import { useSession } from "@/data/session-store";
import {
  saveServiceCase,
  addServiceEvent,
  addRefundReview,
  addTestAttachment,
} from "@/data/test-workflows";
import { localizeMessage } from "@/locales/messages";
import { OperationDialog, OperationDraftForm, type DraftField } from "./operation-ui";
import { BusinessPage, useBusiness, BusinessTable, AddAction, Attachments } from "./business-ui";
import { useErp } from "./context";
import { TestSaleDocuments } from "./test-documents";

export function ServicePage() {
  const { t, lang } = useErp();
  const __t = t;
  const c = useBusiness();
  const session = useSession();
  const workspace = useTestWorkspace();
  const [open, setOpen] = useState(false);
  const [prefill, setPrefill] = useState<Record<string, string>>({});
  const [selectedId, setSelectedId] = useState("");
  const [form, setForm] = useState<"history" | "refund" | null>(null);
  const [notice, setNotice] = useState("");
  const rows = (c.data?.cases ?? []).filter((r) => inScope(r.store, c.scope));
  const selected = rows.find((r) => r.id === selectedId);
  const refundsFor = (id: string) => session.refunds.filter((f) => f.caseId === id);
  const sold = (c.data?.sales ?? []).filter((s) => s.imei && inScope(s.store, c.scope));
  const customerName = (id: string) =>
    displayText(lang, c.data?.customers.find((r) => r.id === id)?.name ?? id);
  const stageLabel = (s: ServiceCase["stage"]) => localizeMessage(lang, s);
  const fields: DraftField[] = [
    {
      name: "customerId",
      label: __t("service.customer_ce26"),
      options: c.data?.customers.map((r) => r.id) ?? [],
    },
    { name: "store", label: __t("service.store_fdb0"), options: ["M01", "M02"] },
    { name: "saleReference", label: __t("service.original_sale_reference_b1a9") },
    { name: "imei", label: __t("service.sold_phone_imei_eeee") },
    { name: "issue", label: __t("service.reported_issue_b7bf") },
    {
      name: "requestedAction",
      label: __t("service.requested_action_8487"),
      options: ["Inspection", "Repair", "Return", "Exchange", "Refund review"],
    },
    { name: "documentReference", label: __t("service.case_document_reference_8403") },
    {
      name: "notes",
      label: __t("service.case_notes_a7a7"),
      hint: __t("service.no_eligibility_assumed_7d70"),
    },
  ];
  return (
    <BusinessPage
      title={__t("service.warranty_sav_eb74")}
      eyebrow={__t("service.sold_unit_traceability_service_e172")}
      context={c}
      notice={notice}
      actions={
        <AddAction
          onClick={() => {
            setPrefill({ store: c.scope === "M02" ? "M02" : "M01" });
            setOpen(true);
          }}
        >
          {__t("service.service_case_draft_525c")}
        </AddAction>
      }
    >
      <LocalSav />
      <div className="safety-notice">{__t("service.warranty_periods_returns_exchang_98dc")}</div>
      <BusinessTable
        headers={[
          __t("service.case_sale_e974"),
          __t("service.customer_imei_44c1"),
          __t("service.issue_request_94c6"),
          __t("service.service_state_0449"),
          __t("service.cumulative_refund_draft_c109"),
          __t("service.details_3120"),
        ]}
        empty={!rows.length}
      >
        {rows.map((r) => (
          <tr key={r.id}>
            <td>
              <span className="ltr">{r.id}</span>
              <small className="ltr">{r.saleReference}</small>
            </td>
            <td>
              {customerName(r.customerId)}
              <small className="ltr">{r.imei}</small>
            </td>
            <td>
              {displayText(lang, r.issue)}
              <small>{localizeMessage(lang, r.requestedAction)}</small>
            </td>
            <td>
              {stageLabel(r.stage)}
              <small>{__t("service.draft_status_only_46bb")}</small>
            </td>
            <td className="ltr">{formatMoney(sumMoney(refundsFor(r.id).map((f) => f.amount)))}</td>
            <td>
              <Button
                variant="ghost"
                size="icon"
                aria-label={t("fl.serviceLabel", { id: r.id })}
                onClick={() => {
                  setSelectedId(r.id);
                  setForm(null);
                }}
              >
                <ArrowUpRight />
              </Button>
            </td>
          </tr>
        ))}
      </BusinessTable>
      <h3 className="operation-section-title">{t("fl.soldUnits")}</h3>
      <BusinessTable
        headers={[
          t("cust.colSale"),
          t("cust.colItem"),
          __t("service.customer_ce26"),
          t("shared.amount"),
          t("fl.action"),
        ]}
        empty={!sold.length}
      >
        {sold.map((s) => (
          <tr key={`${s.id}-${s.imei}`}>
            <td>
              <span className="ltr">{s.id}</span>
              <small className="ltr">{s.date}</small>
            </td>
            <td>
              {displayText(lang, s.item)}
              <small className="ltr">{s.imei}</small>
            </td>
            <td>{customerName(s.customerId)}</td>
            <td className="ltr">{formatMoney(s.amount)}</td>
            <td>
              <Button
                variant="outline"
                onClick={() => {
                  setPrefill({
                    customerId: s.customerId,
                    store: s.store,
                    saleReference:
                      workspace.sales.find((sale) => sale.id === s.id)?.publicRef ?? s.id,
                    imei: s.imei ?? "",
                  });
                  setOpen(true);
                }}
              >
                {t("fl.openCase")}
              </Button>
            </td>
          </tr>
        ))}
      </BusinessTable>
      <OperationDialog
        open={open}
        onClose={() => setOpen(false)}
        title={__t("service.service_return_exchange_case_dra_5be9")}
      >
        <OperationDraftForm
          key={JSON.stringify(prefill)}
          title={__t("service.service_case_7328")}
          schema={serviceSchema}
          fields={fields}
          defaults={prefill}
          onCancel={() => setOpen(false)}
          onSave={(v) => {
            const row = saveServiceCase(v);
            setOpen(false);
            setSelectedId(row.id);
            setNotice(__t("service.service_request_draft_recorded_w_d5a4"));
          }}
        />
      </OperationDialog>
      <OperationDialog
        open={!!selected}
        onClose={() => {
          setSelectedId("");
          setForm(null);
        }}
        title={__t("service.service_case_workspace_9f92")}
      >
        {selected && (
          <>
            <dl className="detail-list">
              <dt>{__t("service.original_sale_imei_454f")}</dt>
              <dd className="ltr">
                {selected.saleReference} / {selected.imei}
              </dd>
              <dt>{__t("service.requested_action_8487")}</dt>
              <dd>
                {localizeMessage(lang, selected.requestedAction)} ·{" "}
                {t("fl.eligibilityUnconfigured")}
              </dd>
              {workspace.sales.some(
                (s) =>
                  (s.id === selected.saleReference || s.publicRef === selected.saleReference) &&
                  s.lines.some(
                    (l) =>
                      l.imei === selected.imei &&
                      s.warranties?.some(
                        (w) => w.itemId === l.id && w.requested && w.provider === "MANUFACTURER",
                      ),
                  ),
              ) && <dd>{documentText[lang].send}</dd>}
              <dt>{__t("service.service_state_db62")}</dt>
              <dd>{stageLabel(selected.stage)}</dd>
              <dt>{__t("service.cumulative_refund_draft_78ce")}</dt>
              <dd className="ltr">
                {formatMoney(sumMoney(refundsFor(selected.id).map((r) => r.amount)))}
              </dd>
            </dl>
            {selected.source === "Fixture" ? (
              <p className="field-hint">{t("fl.fixtureReadOnly")}</p>
            ) : (
              <div className="form-actions">
                <Button
                  variant="outline"
                  disabled={selected.stage === "Closed draft"}
                  onClick={() => setForm("history")}
                >
                  {__t("service.service_exchange_history_draft_89ba")}
                </Button>
                <Button variant="outline" onClick={() => setForm("refund")}>
                  {__t("service.refund_review_draft_9cb5")}
                </Button>
              </div>
            )}
            {form === "history" && (
              <OperationDraftForm
                title={__t("service.service_history_3192")}
                schema={serviceEventSchema}
                fields={[
                  {
                    name: "stage",
                    label: __t("service.service_status_095b"),
                    options: ["Inspection", "In service", "Ready", "Closed draft"],
                  },
                  { name: "note", label: __t("service.service_return_exchange_note_d01c") },
                  {
                    name: "documentReference",
                    label: __t("service.evidence_document_reference_6d32"),
                  },
                ]}
                onCancel={() => setForm(null)}
                onSave={(v) => {
                  addServiceEvent(selected.id, v);
                  setForm(null);
                }}
              />
            )}
            {form === "refund" && (
              <OperationDraftForm
                title={__t("service.refund_review_3369")}
                schema={refundSchema}
                fields={[
                  { name: "amount", label: __t("service.refund_review_amount_dzd_0607") },
                  { name: "reference", label: __t("service.refund_document_reference_ca79") },
                  {
                    name: "authorizationReference",
                    label: __t("service.authorization_reference_7deb"),
                  },
                  { name: "reason", label: __t("service.refund_reason_0345") },
                ]}
                onCancel={() => setForm(null)}
                onSave={(v) => {
                  addRefundReview(selected.id, v);
                  setForm(null);
                  setNotice(__t("service.refund_review_draft_added_no_ref_c02e"));
                }}
              />
            )}
            <ul className="operation-history">
              {selected.history.map((h, i) => (
                <li key={i}>
                  <bdi>
                    {h
                      .split(" · ")
                      .map((p) => localizeMessage(lang, p))
                      .join(" · ")}
                  </bdi>
                </li>
              ))}
              {refundsFor(selected.id).map((r) => (
                <li key={r.id}>
                  {t("fl.refundReview")} · <bdi>{formatMoney(r.amount)}</bdi> ·{" "}
                  <bdi>{r.reference}</bdi>
                  <small>{__t("service.authorization_not_verified_unpos_5aec")}</small>
                </li>
              ))}
            </ul>
            <Attachments
              subjectId={selected.id}
              rows={session.attachments}
              onAdd={(r) => addTestAttachment(r)}
            />
            <Button disabled>
              <LockKeyhole />
              {__t("service.refund_return_exchange_execution_7328")}
            </Button>
          </>
        )}
      </OperationDialog>
      <TestSaleDocuments onClose={() => {}} />
    </BusinessPage>
  );
}
