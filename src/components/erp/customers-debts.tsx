import { LocalCreditList } from "./credit-list";
import { DT } from "./shared";
import { displayText } from "@/locales/display";
import { useState } from "react";
import { ArrowUpRight, Pencil, LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  customerSchema,
  debtSchema,
  repaymentSchema,
  outstanding,
  sumMoney,
  validateRepayment,
  inScope,
  type Customer,
  type Debt,
} from "@/domain/business";
import { formatMoney, storeLabel } from "@/domain/erp";
import { OperationDialog, OperationDraftForm, type DraftField } from "./operation-ui";
import {
  BusinessPage,
  useBusiness,
  SearchBox,
  BusinessTable,
  DraftState,
  AddAction,
} from "./business-ui";
import { useSession, addDraft } from "@/data/session-store";
import { useErp } from "./context";
import {
  saveDebtDraftChecked,
  saveRepaymentDraftChecked,
  debtFigures,
} from "@/data/test-workflows";
export function CustomersPage() {
  const c = useBusiness();
  const { t, lang } = useErp();
  const session = useSession();
  const [edits, setEdits] = useState<Record<string, Customer>>({});
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<Customer | null>(null);
  const [selected, setSelected] = useState<Customer | null>(null);
  const [notice, setNotice] = useState("");
  const rows = [...(c.data?.customers ?? []).map((r) => edits[r.id] ?? r)].filter(
    (r) =>
      inScope(r.store, c.scope) &&
      [r.name, r.contact, r.reference].join(" ").toLowerCase().includes(query.toLowerCase()),
  );
  const customerFields: DraftField[] = [
    { name: "name", label: t("cust.fName") },
    { name: "contact", label: t("cust.fContact") },
    { name: "store", label: t("cash.store"), options: ["M01", "M02"] },
    { name: "reference", label: t("cust.fReference") },
    { name: "address", label: t("cust.fAddress"), hint: t("cash.remarksHint") },
    { name: "notes", label: t("cust.fNotes"), hint: t("cash.remarksHint") },
  ];
  return (
    <BusinessPage
      title={t("cust.title")}
      eyebrow={t("cust.eyebrow")}
      context={c}
      notice={notice}
      actions={
        <AddAction
          onClick={() => {
            setEdit(null);
            setOpen(true);
          }}
        >
          {t("cust.addCustomer")}
        </AddAction>
      }
    >
      <div className="table-toolbar">
        <SearchBox value={query} onChange={setQuery} label={t("cust.search")} />
        <span>
          {rows.length} {t("cust.count")}
        </span>
      </div>
      <BusinessTable
        headers={[
          t("cust.colCustomer"),
          t("cust.colReference"),
          t("shared.store"),
          t("cust.colState"),
          t("cust.colProfile"),
        ]}
        empty={!rows.length}
      >
        {rows.map((r) => (
          <tr key={r.id}>
            <td>
              <strong>
                <DT text={r.name} />
              </strong>
              <small>{r.contact}</small>
            </td>
            <td className="ltr">{r.reference}</td>
            <td>{storeLabel(r.store)}</td>
            <td>
              <DraftState fixture={r.source === "Fixture"} />
            </td>
            <td>
              <Button
                variant="ghost"
                size="icon"
                aria-label={t("cust.profile", { id: r.id })}
                onClick={() => setSelected(r)}
              >
                <ArrowUpRight />
              </Button>
            </td>
          </tr>
        ))}
      </BusinessTable>
      <OperationDialog
        open={open}
        onClose={() => setOpen(false)}
        title={edit ? t("cust.editDraft") : t("cust.draft")}
      >
        <OperationDraftForm
          key={edit?.id ?? "new"}
          title={t("cust.formTitle")}
          schema={customerSchema}
          optionalFields={["address", "notes"]}
          submitLabel={t("retail.save")}
          fields={customerFields}
          defaults={edit ? { ...edit } : { store: c.scope === "M02" ? "M02" : "M01" }}
          onCancel={() => setOpen(false)}
          extraValidate={(value) =>
            rows.some((r) => r.id !== edit?.id && r.reference === value.reference)
              ? t("cust.referenceExists")
              : undefined
          }
          onSave={(value) => {
            const row: Customer = {
              ...value,
              id: edit?.id ?? `DRAFT-C-${session.customers.length + 1}`,
              source: "Session draft",
            };
            if (edit) setEdits((prev) => ({ ...prev, [row.id]: row }));
            else
              addDraft("customers", row, {
                area: "customers",
                action: "Customer draft saved",
                detail: `${row.name} · ${row.store}`,
                store: row.store,
              });
            setOpen(false);
            setSelected(null);
            setNotice(t("cust.draftSaved"));
          }}
        />
      </OperationDialog>
      <OperationDialog
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected ? displayText(lang, selected.name) : t("cust.profileTitle")}
      >
        {selected && (
          <>
            <dl className="detail-list">
              <dt>{t("cust.contact")}</dt>
              <dd>{selected.contact}</dd>
              <dt>{t("shared.store")}</dt>
              <dd>{storeLabel(selected.store)}</dd>
              <dt>{t("cust.address")}</dt>
              <dd>{selected.address || t("shared.notRecorded")}</dd>
              <dt>{t("shared.reference")}</dt>
              <dd className="ltr">{selected.reference}</dd>
            </dl>
            <Button
              variant="outline"
              onClick={() => {
                setEdit(selected);
                setSelected(null);
                setOpen(true);
              }}
            >
              <Pencil />
              {t("cust.editProfile")}
            </Button>
            <h3 className="operation-section-title">{t("cust.purchaseHistory")}</h3>
            <BusinessTable
              headers={[
                t("cust.colSale"),
                t("cust.colItem"),
                t("cust.colDate"),
                t("shared.amount"),
              ]}
              empty={!c.data?.sales.some((s) => s.customerId === selected.id)}
            >
              {c.data?.sales
                .filter((s) => s.customerId === selected.id)
                .map((s) => (
                  <tr key={s.id}>
                    <td className="ltr">{s.id}</td>
                    <td>
                      {s.item}
                      <small className="ltr">{s.imei}</small>
                    </td>
                    <td>{s.date}</td>
                    <td className="ltr">{formatMoney(s.amount)}</td>
                  </tr>
                ))}
            </BusinessTable>
            <h3 className="operation-section-title">{t("cust.storeReceivables")}</h3>
            {c.data?.debts
              .filter((d) => d.customerId === selected.id && d.store === selected.store)
              .map((d) => (
                <p key={d.id}>
                  <span className="ltr">{d.id}</span> · {t("fl.confirmedOutstanding")}:{" "}
                  <bdi className="ltr">
                    {formatMoney(
                      debtFigures(
                        d,
                        (c.data?.repayments ?? []).filter((p) => p.subjectId === d.id),
                      ).confirmedOutstanding,
                    )}
                  </bdi>
                  {d.source === "Session draft" && <> · {t("fl.obligationDraft")}</>}
                </p>
              ))}
          </>
        )}
      </OperationDialog>
    </BusinessPage>
  );
}
export function DebtsPage() {
  const c = useBusiness();
  const { t, lang } = useErp();
  const session = useSession();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Debt | null>(null);
  const [repay, setRepay] = useState(false);
  const [notice, setNotice] = useState("");
  const allPayments = c.data?.repayments ?? [];
  const rows = (c.data?.debts ?? []).filter(
    (r) =>
      inScope(r.store, c.scope) &&
      [r.id, r.customerId, r.saleReference].join(" ").toLowerCase().includes(query.toLowerCase()),
  );
  const figures = (d: Debt) =>
    debtFigures(
      d,
      allPayments.filter((p) => p.subjectId === d.id),
    );
  const balance = (d: Debt) => figures(d).projectedRemaining;
  const fields: DraftField[] = [
    {
      name: "customerId",
      label: t("debt.fCustomer"),
      options: c.data?.customers.map((r) => r.id) ?? [],
      optionLabels: Object.fromEntries(
        (c.data?.customers ?? []).map((r) => [r.id, displayText(lang, r.name)]),
      ),
    },
    { name: "store", label: t("cash.store"), options: ["M01", "M02"] },
    { name: "saleReference", label: t("debt.fSaleReference") },
    { name: "amount", label: t("debt.fAmount") },
    { name: "dueDate", label: t("debt.fDueDate"), type: "date" },
    { name: "authorizationReference", label: t("debt.fAuthReference") },
    { name: "notes", label: t("cust.fNotes"), hint: t("debt.fNotesHint") },
  ];
  const repaymentFields: DraftField[] = [
    { name: "amount", label: t("debt.fRepayAmount") },
    { name: "date", label: t("debt.fPayDate"), type: "date" },
    { name: "method", label: t("debt.fPayMethod"), options: ["Cash", "Bank"] },
    { name: "reference", label: t("debt.fPayReference") },
    { name: "authorizationReference", label: t("debt.fAuthReference") },
  ];
  return (
    <BusinessPage title={t("debt.title")} eyebrow={t("debt.eyebrow")} context={c} notice={notice}>
      <div className="module-stats">
        <div>
          <span>{t("fl.confirmedOutstanding")}</span>
          <strong className="ltr">
            {formatMoney(
              sumMoney(
                (c.data?.debts ?? [])
                  .filter((d) => d.source !== "Session draft")
                  .map((d) => figures(d).confirmedOutstanding),
              ),
            )}
          </strong>
        </div>
        <div>
          <span>{t("fl.draftRepayments")}</span>
          <strong className="ltr">
            {formatMoney(sumMoney((c.data?.debts ?? []).map((d) => figures(d).draftRepayments)))}
          </strong>
          <small>
            {session.repayments.length} {t("debt.repaymentDrafts")}
          </small>
        </div>
      </div>
      <LocalCreditList />
      <div className="table-toolbar">
        <SearchBox value={query} onChange={setQuery} label={t("debt.search")} />
      </div>
      <BusinessTable
        headers={[
          t("debt.colDebt"),
          t("debt.colCustomer"),
          t("debt.colDueDate"),
          t("debt.colOutstanding"),
          t("cust.colState"),
          t("debt.colDetails"),
        ]}
        empty={!rows.length}
      >
        {rows.map((d) => (
          <tr key={d.id}>
            <td className="ltr">
              {d.id}
              <small>{d.saleReference}</small>
            </td>
            <td>
              <DT
                text={c.data?.customers.find((x) => x.id === d.customerId)?.name ?? d.customerId}
              />
              <small>{storeLabel(d.store)}</small>
            </td>
            <td>{d.dueDate}</td>
            <td>
              <span className="ltr">{formatMoney(figures(d).confirmedOutstanding)}</span>
              <small>
                {d.source === "Session draft"
                  ? t("fl.obligationDraft")
                  : t("fl.confirmedOutstanding")}
              </small>
              {figures(d).draftRepayments !== "0.00" && (
                <small>
                  {t("fl.projectedShort")}:{" "}
                  <bdi className="ltr">{formatMoney(figures(d).projectedRemaining)}</bdi>
                </small>
              )}
            </td>
            <td>
              <DraftState fixture={d.source === "Fixture"} />
            </td>
            <td>
              <Button
                variant="ghost"
                size="icon"
                aria-label={t("debt.detailLabel", { id: d.id })}
                onClick={() => setSelected(d)}
              >
                <ArrowUpRight />
              </Button>
            </td>
          </tr>
        ))}
      </BusinessTable>
      <OperationDialog open={open} onClose={() => setOpen(false)} title={t("debt.creationDraft")}>
        <OperationDraftForm
          title={t("debt.formTitle")}
          schema={debtSchema}
          optionalFields={["notes"]}
          fields={fields}
          defaults={{ store: c.scope === "M02" ? "M02" : "M01" }}
          extraValidate={(v) =>
            !c.data?.customers.some((r) => r.id === v.customerId && r.store === v.store)
              ? t("debt.customerStore")
              : !c.data.sales.some(
                    (s) =>
                      s.id === v.saleReference &&
                      s.customerId === v.customerId &&
                      s.store === v.store,
                  )
                ? t("debt.matchingSale")
                : undefined
          }
          onCancel={() => setOpen(false)}
          onSave={(v) => {
            saveDebtDraftChecked(v);
            setOpen(false);
            setNotice(t("debt.draftSaved"));
          }}
        />
      </OperationDialog>
      <OperationDialog
        open={!!selected}
        onClose={() => {
          setSelected(null);
          setRepay(false);
        }}
        title={t("debt.profileTitle")}
      >
        {selected && (
          <>
            <dl className="detail-list">
              <dt>{t("debt.customerSale")}</dt>
              <dd className="ltr">
                {selected.customerId} / {selected.saleReference}
              </dd>
              <dt>{t("fl.obligation")}</dt>
              <dd>
                <bdi className="ltr" data-testid="debt-obligation">
                  {formatMoney(selected.amount)}
                </bdi>
                <small>
                  {figures(selected).obligationRecorded
                    ? t("fl.obligationRecorded")
                    : t("fl.obligationDraft")}
                </small>
              </dd>
              <dt>{t("fl.recordedPaid")}</dt>
              <dd>
                <bdi className="ltr" data-testid="debt-recorded-paid">
                  {formatMoney(figures(selected).recordedPaid)}
                </bdi>
              </dd>
              <dt>{t("fl.draftRepayments")}</dt>
              <dd>
                <bdi className="ltr" data-testid="debt-draft-repayments">
                  {formatMoney(figures(selected).draftRepayments)}
                </bdi>
              </dd>
              <dt>{t("fl.confirmedOutstanding")}</dt>
              <dd>
                <bdi className="ltr" data-testid="debt-confirmed-outstanding">
                  {formatMoney(figures(selected).confirmedOutstanding)}
                </bdi>
              </dd>
              <dt>{t("fl.projectedRemaining")}</dt>
              <dd>
                <bdi className="ltr" data-testid="debt-projected">
                  {formatMoney(figures(selected).projectedRemaining)}
                </bdi>
              </dd>
              <dt>{t("debt.authorization")}</dt>
              <dd>
                {selected.authorizationReference} · {t("debt.notVerified")}
              </dd>
            </dl>
            <BusinessTable
              headers={[
                t("cust.colDate"),
                t("debt.colMethod"),
                t("shared.reference"),
                t("shared.amount"),
                t("cust.colState"),
              ]}
              empty={!allPayments.some((p) => p.subjectId === selected.id)}
            >
              {allPayments
                .filter((p) => p.subjectId === selected.id)
                .map((p) => (
                  <tr key={p.id}>
                    <td>{p.date}</td>
                    <td>{p.method}</td>
                    <td className="ltr">{p.reference}</td>
                    <td className="ltr">{formatMoney(p.amount)}</td>
                    <td>
                      <DraftState fixture={p.source === "Fixture"} />
                    </td>
                  </tr>
                ))}
            </BusinessTable>
            {repay ? (
              <OperationDraftForm
                title={t("debt.repayment")}
                schema={repaymentSchema}
                fields={repaymentFields}
                extraValidate={(v) => validateRepayment(v.amount, balance(selected))}
                onCancel={() => setRepay(false)}
                onSave={(v) => {
                  saveRepaymentDraftChecked(selected.id, v);
                  setRepay(false);
                  setNotice(t("debt.repaymentSaved"));
                }}
              />
            ) : (
              <AddAction onClick={() => setRepay(true)}>{t("debt.repaymentDraft")}</AddAction>
            )}
            <Button disabled variant="outline">
              <LockKeyhole />
              {t("debt.confirmUnavailable")}
            </Button>
          </>
        )}
      </OperationDialog>
    </BusinessPage>
  );
}
