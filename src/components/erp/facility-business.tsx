import { displayText } from "@/locales/display";
import { useState } from "react";
import { ArrowUpRight, Landmark, LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  facilitySchema,
  facilitySchedule,
  facilityEventSchema,
  sumMoney,
  inScope,
  type FacilityEvent,
} from "@/domain/business";
import { formatMoney, minorUnits, storeLabel } from "@/domain/erp";
import { useSession } from "@/data/session-store";
import { saveFacilityDraft, addFacilityEvidence } from "@/data/test-workflows";
import { OperationDialog, OperationDraftForm, type DraftField } from "./operation-ui";
import { BusinessPage, useBusiness, BusinessTable, AddAction } from "./business-ui";
import { useErp } from "./context";

export function FacilitiesPage() {
  const { t, lang } = useErp();
  const __t = t;
  const c = useBusiness();
  const session = useSession();
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState("");
  const [kind, setKind] = useState<FacilityEvent["kind"] | null>(null);
  const [evidence, setEvidence] = useState("");
  const [notice, setNotice] = useState("");
  const rows = (c.data?.facilities ?? []).filter((r) => inScope(r.store, c.scope));
  const selected = rows.find((r) => r.id === selectedId);
  const events = session.facilityEvents;
  const customerName = (id: string) =>
    displayText(lang, c.data?.customers.find((r) => r.id === id)?.name ?? id);
  const fields: DraftField[] = [
    {
      name: "customerId",
      label: __t("facility.customer_ce26"),
      options: c.data?.customers.filter((r) => r.store === "M01").map((r) => r.id) ?? [],
      optionLabels: Object.fromEntries(
        (c.data?.customers ?? []).map((r) => [r.id, customerName(r.id)]),
      ),
    },
    { name: "employer", label: __t("facility.employer_reference_ae80") },
    { name: "store", label: __t("facility.store_fdb0"), readOnly: true },
    { name: "contractReference", label: __t("facility.contract_reference_b5dc") },
    { name: "contractPrice", label: __t("facility.explicit_contract_price_dzd_98ca") },
    { name: "months", label: __t("facility.contract_specific_months_e090") },
    { name: "firstMonth", label: __t("facility.first_schedule_month_921b"), type: "month" },
    { name: "installmentAmount", label: __t("facility.explicit_monthly_amount_dzd_a24e") },
    {
      name: "notes",
      label: __t("facility.contract_notes_cb75"),
      hint: __t("facility.no_universal_formula_7172"),
    },
  ];
  const kindLabel = (k: FacilityEvent["kind"]) =>
    k === "Bank remittance" ? t("fl.kindBank") : t("fl.kindDeduction");
  return (
    <BusinessPage
      title={__t("facility.facility_agreements_a3eb")}
      eyebrow={__t("facility.m01_salary_deductions_bank_remit_4be1")}
      context={c}
      notice={notice}
      actions={
        <AddAction disabled={c.scope === "M02"} onClick={() => setOpen(true)}>
          {__t("facility.agreement_draft_6bd2")}
        </AddAction>
      }
    >
      {c.scope === "M02" ? (
        <div className="permission-state">
          <Landmark />
          <h2>{t("fl.m01Only", { store: storeLabel("M01") })}</h2>
          <p>{t("fl.m02Unavailable", { store: storeLabel("M02") })}</p>
        </div>
      ) : (
        <>
          <div className="safety-notice">
            <Landmark />
            {t("fl.bankOnlyNotice")}
          </div>
          <BusinessTable
            headers={[
              __t("facility.contract_customer_eeb3"),
              __t("facility.employer_d5d4"),
              __t("facility.price_6da7"),
              __t("facility.schedule_ecb7"),
              __t("facility.bank_remittance_671f"),
              __t("facility.details_3120"),
            ]}
            empty={!rows.length}
          >
            {rows.map((f) => (
              <tr key={f.id}>
                <td>
                  <span className="ltr">{f.contractReference}</span>
                  <small>{customerName(f.customerId)}</small>
                </td>
                <td>{displayText(lang, f.employer)}</td>
                <td className="ltr">{formatMoney(f.contractPrice)}</td>
                <td>
                  {t("fl.monthsCount", { n: String(facilitySchedule(f).length) })}
                  <small className="ltr">{f.firstMonth}</small>
                </td>
                <td>
                  {events.some((e) => e.facilityId === f.id && e.kind === "Bank remittance")
                    ? t("fl.evidenceEntered")
                    : t("fl.missingRemittance")}
                  <small>{__t("facility.unreconciled_not_bank_confirmed_ac0d")}</small>
                </td>
                <td>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t("fl.facilityLabel", { id: f.id })}
                    onClick={() => {
                      setSelectedId(f.id);
                      setKind(null);
                    }}
                  >
                    <ArrowUpRight />
                  </Button>
                </td>
              </tr>
            ))}
          </BusinessTable>
        </>
      )}
      <OperationDialog
        open={open}
        onClose={() => setOpen(false)}
        title={__t("facility.facility_contract_draft_90eb")}
      >
        <OperationDraftForm
          title={__t("facility.facility_8647")}
          schema={facilitySchema}
          optionalFields={["notes"]}
          fields={fields}
          defaults={{ store: "M01" }}
          onCancel={() => setOpen(false)}
          onSave={(v) => {
            saveFacilityDraft(v);
            setOpen(false);
            setNotice(__t("facility.m01_contract_draft_recorded_no_s_6bca"));
          }}
        />
      </OperationDialog>
      <OperationDialog
        open={!!selected}
        onClose={() => {
          setSelectedId("");
          setKind(null);
        }}
        title={__t("facility.facility_schedule_reconciliation_63ed")}
      >
        {selected && (
          <>
            <dl className="detail-list">
              <dt>{__t("facility.customer_employer_0ee7")}</dt>
              <dd>
                {customerName(selected.customerId)} / {displayText(lang, selected.employer)}
              </dd>
              <dt>{__t("facility.contract_price_0789")}</dt>
              <dd className="ltr">{formatMoney(selected.contractPrice)}</dd>
              <dt>{__t("facility.settlement_channel_3d89")}</dt>
              <dd>{__t("facility.bank_only_cash_drawer_impact_non_514b")}</dd>
            </dl>
            <BusinessTable
              headers={[
                __t("facility.month_3833"),
                __t("facility.scheduled_1ebf"),
                __t("facility.deduction_draft_4d95"),
                __t("facility.bank_draft_8956"),
                __t("facility.state_2b84"),
              ]}
              empty={false}
            >
              {facilitySchedule(selected).map((r) => {
                const mine = events.filter(
                  (e) => e.facilityId === selected.id && e.month === r.month,
                );
                const deduction = sumMoney(
                  mine.filter((e) => e.kind === "Salary deduction").map((e) => e.amount),
                );
                const bank = sumMoney(
                  mine.filter((e) => e.kind === "Bank remittance").map((e) => e.amount),
                );
                return (
                  <tr key={r.month}>
                    <td className="ltr">{r.month}</td>
                    <td className="ltr">{formatMoney(r.amount)}</td>
                    <td className="ltr">{formatMoney(deduction)}</td>
                    <td className="ltr">{formatMoney(bank)}</td>
                    <td>
                      {minorUnits(bank) === 0n
                        ? t("fl.missingRemittance")
                        : minorUnits(bank) < minorUnits(r.amount)
                          ? t("fl.partialEvidence")
                          : t("fl.evidenceComplete")}
                    </td>
                  </tr>
                );
              })}
            </BusinessTable>
            <div className="form-actions">
              <Button
                variant="outline"
                onClick={() => {
                  setKind("Salary deduction");
                  setEvidence("");
                }}
              >
                {__t("facility.salary_deduction_draft_d6b2")}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setKind("Bank remittance");
                  setEvidence("");
                }}
              >
                {__t("facility.bank_remittance_draft_7480")}
              </Button>
            </div>
            {kind && (
              <>
                {kind === "Bank remittance" && (
                  <label className="form-label">
                    {t("fl.bankEvidence")}
                    <input
                      type="file"
                      aria-label={t("fl.bankEvidence")}
                      accept="image/*,.pdf"
                      onChange={(e) => setEvidence(e.target.files?.[0]?.name ?? "")}
                    />
                    <small className="field-hint">{t("fl.bankEvidenceHint")}</small>
                  </label>
                )}
                <OperationDraftForm
                  key={kind}
                  title={kindLabel(kind)}
                  schema={facilityEventSchema}
                  fields={[
                    { name: "month", label: __t("facility.schedule_month_23da"), type: "month" },
                    { name: "amount", label: __t("facility.evidence_amount_dzd_72e3") },
                    {
                      name: "reference",
                      label: kind === "Bank remittance" ? t("fl.bankRef") : t("fl.deductionRef"),
                    },
                  ]}
                  onCancel={() => setKind(null)}
                  onSave={(v) => {
                    addFacilityEvidence(
                      selected.id,
                      kind,
                      v,
                      kind === "Bank remittance" ? evidence : undefined,
                    );
                    setKind(null);
                    setNotice(__t("facility.evidence_draft_added_no_bank_con_2665"));
                  }}
                />
              </>
            )}
            <ul className="operation-history">
              {events
                .filter((e) => e.facilityId === selected.id)
                .map((e) => (
                  <li key={e.id}>
                    {kindLabel(e.kind)} · <bdi>{e.month}</bdi> · <bdi>{e.reference}</bdi>
                    <small>
                      <bdi>{formatMoney(e.amount)}</bdi> · {t("fl.unverified")}
                      {e.evidence ? (
                        <>
                          {" "}
                          · <bdi>{e.evidence}</bdi>
                        </>
                      ) : null}
                    </small>
                  </li>
                ))}
            </ul>
            <Button disabled>
              <LockKeyhole />
              {__t("facility.confirm_bank_reconciliation_unav_15c2")}
            </Button>
          </>
        )}
      </OperationDialog>
    </BusinessPage>
  );
}
