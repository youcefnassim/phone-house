import { useSession } from "@/data/session-store";
import { saveTestExpense, saveTestExpenseCategory } from "@/data/test-procurement";
import { DT } from "./shared";
import { useState } from "react";
import { ArrowUpRight, LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import { expenseSchema, expenseCategorySchema, inScope, type Expense } from "@/domain/business";
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
import { useT } from "./context";
export function ExpensesPage() {
  const __t = useT();
  const c = useBusiness();
  const session = useSession();
  const categories = session.expenseCategories.map((c) => c.name);
  const [query, setQuery] = useState("");
  const [form, setForm] = useState<"expense" | "category" | null>(null);
  const [selected, setSelected] = useState<Expense | null>(null);
  const [notice, setNotice] = useState("");
  const rows = (c.data?.expenses ?? []).filter(
    (r) =>
      inScope(r.store, c.scope) &&
      [r.description, r.category, r.documentReference]
        .join(" ")
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const allCategories = Array.from(
    new Set([...(c.data?.expenses.map((r) => r.category) ?? []), ...categories]),
  );
  const fields: DraftField[] = [
    { name: "category", label: __t("expenses.expense_category_0aac"), options: allCategories },
    { name: "description", label: __t("expenses.expense_description_5618") },
    { name: "store", label: __t("expenses.store_fdb0"), options: ["M01", "M02"] },
    { name: "amount", label: __t("expenses.expense_amount_dzd_6a73") },
    { name: "method", label: __t("expenses.payment_method_f0aa"), options: ["Cash", "Bank"] },
    { name: "date", label: __t("expenses.expense_date_8ea3"), type: "date" },
    { name: "documentReference", label: __t("expenses.document_reference_d4ab") },
    { name: "notes", label: __t("expenses.notes_f4c6"), hint: __t("expenses.optional_ebb0") },
  ];
  return (
    <BusinessPage
      title={__t("expenses.expenses_1349")}
      eyebrow={__t("expenses.operating_expenses_b534")}
      context={c}
      notice={notice}
      actions={
        <>
          <Button variant="outline" onClick={() => setForm("category")}>
            {__t("expenses.category_draft_9967")}
          </Button>
          <AddAction onClick={() => setForm("expense")}>
            {__t("expenses.expense_draft_f2d0")}
          </AddAction>
        </>
      }
    >
      <div className="module-stats">
        <div>
          <span>{__t("expenses.categories_af1b")}</span>
          <strong>{allCategories.length}</strong>
        </div>
        <div>
          <span>{__t("expenses.session_entries_1971")}</span>
          <strong>{session.expenses.length}</strong>
        </div>
        <div>
          <span>{__t("expenses.approval_thresholds_e76d")}</span>
          <strong className="stat-text">{__t("expenses.unconfigured_f5d4")}</strong>
        </div>
        <div>
          <span>{__t("expenses.accounting_treatment_b4ae")}</span>
          <strong className="stat-text">{__t("expenses.policy_required_4ac4")}</strong>
        </div>
      </div>
      <div className="table-toolbar">
        <SearchBox label={__t("expenses.search_expenses_7967")} value={query} onChange={setQuery} />
      </div>
      <BusinessTable
        headers={[
          __t("expenses.expense_category_e2a4"),
          __t("expenses.store_3cfb"),
          __t("expenses.date_document_d084"),
          __t("expenses.amount_method_5bf8"),
          __t("expenses.approval_c235"),
          __t("expenses.details_3120"),
        ]}
        empty={!rows.length}
      >
        {rows.map((r) => (
          <tr key={r.id}>
            <td>
              <DT text={r.description} />
              <small>
                <DT text={r.category} />
              </small>
            </td>
            <td>{storeLabel(r.store)}</td>
            <td>
              {r.date}
              <small>{r.documentReference}</small>
            </td>
            <td>
              {formatMoney(r.amount)}
              <small>{r.method}</small>
            </td>
            <td>
              {__t("expenses.configuration_required_6b45")}
              <small>{__t("expenses.no_approval_inferred_4f99")}</small>
            </td>
            <td>
              <Button
                variant="ghost"
                size="icon"
                aria-label={__t("a11y.expense", { id: r.id })}
                onClick={() => setSelected(r)}
              >
                <ArrowUpRight />
              </Button>
            </td>
          </tr>
        ))}
      </BusinessTable>
      <OperationDialog
        open={form !== null}
        onClose={() => setForm(null)}
        title={__t(
          form === "category" ? "expenses.category_draft_9967" : "expenses.expense_draft_f2d0",
        )}
      >
        {form === "category" ? (
          <OperationDraftForm
            title={__t("expenses.expense_category_0aac")}
            schema={expenseCategorySchema}
            fields={[
              { name: "name", label: __t("expenses.category_name_bb34") },
              { name: "reference", label: __t("expenses.category_reference_0248") },
            ]}
            onCancel={() => setForm(null)}
            onSave={(v) => {
              saveTestExpenseCategory(v);
              setForm(null);
              setNotice(__t("expenses.category_draft_added_no_accounti_df1f"));
            }}
          />
        ) : (
          <OperationDraftForm
            title={__t("expenses.expense_7bf4")}
            schema={expenseSchema}
            fields={fields}
            defaults={{ store: c.scope === "M02" ? "M02" : "M01" }}
            onCancel={() => setForm(null)}
            onSave={(v) => {
              saveTestExpense(v);
              setForm(null);
              setNotice(__t("expenses.expense_draft_recorded_no_cash_m_80e5"));
            }}
          />
        )}
      </OperationDialog>
      <OperationDialog
        open={!!selected}
        onClose={() => setSelected(null)}
        title={__t("expenses.expense_history_5400")}
      >
        {selected && (
          <>
            <dl className="detail-list">
              <dt>{__t("expenses.description_b5a7")}</dt>
              <dd>{selected.description}</dd>
              <dt>{__t("expenses.document_0945")}</dt>
              <dd>{selected.documentReference}</dd>
              <dt>{__t("expenses.store_tender_2aeb")}</dt>
              <dd>
                {storeLabel(selected.store)} / {selected.method}
              </dd>
              <dt>{__t("expenses.amount_b2f4")}</dt>
              <dd>{formatMoney(selected.amount)}</dd>
            </dl>
            <ul className="operation-history">
              <li>
                {selected.state} · {selected.date}
                <small>{__t("expenses.approval_policy_required_no_cash_c5ee")}</small>
              </li>
            </ul>
            <DraftState fixture={selected.state === "Policy required"} />
            <Button disabled>
              <LockKeyhole />
              {__t("expenses.approval_posting_unavailable_77ed")}
            </Button>
          </>
        )}
      </OperationDialog>
    </BusinessPage>
  );
}
