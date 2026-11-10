import { lazy, Suspense } from "react";
import { reviewActor } from "@/data/test-workspace";
const LocalSupplierPayables = lazy(() =>
  import("./local-supplier-payables").then((m) => ({ default: m.LocalSupplierPayables })),
);
import { useSession } from "@/data/session-store";
import {
  saveTestSupplier,
  saveTestPurchase,
  saveTestPurchaseReceipt,
} from "@/data/test-procurement";
import { useEffect, useState } from "react";
import { ArrowUpRight, LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  supplierSchema,
  purchaseSchema,
  purchaseReceiptSchema,
  validatePurchaseReceipt,
  ownerCostSchema,
  repaymentSchema,
  validateRepayment,
  outstanding,
  sumMoney,
  inScope,
  canPreviewOwnerFinance,
  type Supplier,
  type Purchase,
  type PurchaseReceipt,
  type OwnerPurchaseFinance,
} from "@/domain/business";
import { formatMoney, storeLabel } from "@/domain/erp";
import { stock } from "@/data/demo";
import { OperationDialog, OperationDraftForm, type DraftField } from "./operation-ui";
import {
  BusinessPage,
  useBusiness,
  SearchBox,
  BusinessTable,
  DraftState,
  AddAction,
} from "./business-ui";
import { useT, useErp } from "./context";
import { displayName } from "@/locales/display";

export function SuppliersPage() {
  const __t = useT();
  const __lang = useErp().lang;
  const c = useBusiness();
  useSession();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Supplier | null>(null);
  const [edit, setEdit] = useState<Supplier | null>(null);
  const [notice, setNotice] = useState("");
  const rows = [...new Map((c.data?.suppliers ?? []).map((r) => [r.id, r])).values()].filter(
    (r) =>
      inScope(r.store, c.scope) &&
      [r.name, r.contact, r.documentReference]
        .join(" ")
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const fields: DraftField[] = [
    { name: "name", label: __t("suppliers.supplier_name_6848") },
    { name: "contact", label: __t("shared.contact") },
    { name: "store", label: __t("suppliers.store_fdb0"), options: ["M01", "M02"] },
    { name: "documentReference", label: __t("suppliers.supplier_document_reference_4bad") },
    { name: "notes", label: __t("suppliers.notes_f4c6"), hint: __t("suppliers.optional_ebb0") },
  ];
  return (
    <BusinessPage
      title={__t("suppliers.suppliers_1814")}
      eyebrow={__t("suppliers.supplier_directory_17a8")}
      context={c}
      notice={notice}
      actions={
        <AddAction
          onClick={() => {
            setEdit(null);
            setOpen(true);
          }}
        >
          {__t("suppliers.add_supplier_4252")}
        </AddAction>
      }
    >
      {reviewActor()?.role === "SUPER_ADMIN" && (
        <Suspense>
          <LocalSupplierPayables />
        </Suspense>
      )}
      <div className="table-toolbar">
        <SearchBox
          label={__t("suppliers.search_suppliers_6a97")}
          value={query}
          onChange={setQuery}
        />
      </div>
      <BusinessTable
        headers={[
          __t("suppliers.supplier_contact_3b9f"),
          __t("suppliers.document_c231"),
          __t("suppliers.store_3cfb"),
          __t("suppliers.state_2b84"),
          __t("suppliers.profile_4835"),
        ]}
        empty={!rows.length}
      >
        {rows.map((r) => (
          <tr key={r.id}>
            <td>
              <strong>{displayName(__lang, String(r.name))}</strong>
              <small>{r.contact}</small>
            </td>
            <td>{r.documentReference}</td>
            <td>{storeLabel(r.store)}</td>
            <td>
              <DraftState fixture={r.source === "Fixture"} />
            </td>
            <td>
              <Button
                variant="ghost"
                size="icon"
                aria-label={__t("a11y.supplier", { id: r.id })}
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
        title={__t("suppliers.supplier_draft_df27")}
      >
        <OperationDraftForm
          key={edit?.id ?? __t("suppliers.new_22af")}
          title={__t("suppliers.supplier_ec13")}
          fields={fields}
          optionalFields={["notes", "documentReference"]}
          schema={supplierSchema}
          defaults={edit ? { ...edit } : { store: c.scope === "M02" ? "M02" : "M01" }}
          onCancel={() => setOpen(false)}
          onSave={(v) => {
            saveTestSupplier(v, edit?.id);
            setOpen(false);
            setNotice(__t("suppliers.supplier_session_draft_saved_no__0eb4"));
          }}
        />
      </OperationDialog>
      <OperationDialog
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected?.name ?? __t("suppliers.supplier_ec13")}
      >
        {selected && (
          <>
            <dl className="detail-list">
              <dt>{__t("suppliers.contact_bbaf")}</dt>
              <dd>{selected.contact}</dd>
              <dt>{__t("suppliers.document_0945")}</dt>
              <dd>{selected.documentReference}</dd>
              <dt>{__t("suppliers.store_fdb0")}</dt>
              <dd>{storeLabel(selected.store)}</dd>
            </dl>
            <Button
              variant="outline"
              onClick={() => {
                setEdit(selected);
                setSelected(null);
                setOpen(true);
              }}
            >
              {__t("suppliers.edit_supplier_draft_f33b")}
            </Button>
            <h3 className="operation-section-title">
              {__t("suppliers.purchase_document_history_c1ec")}
            </h3>
            <BusinessTable
              headers={[
                __t("suppliers.order_6575"),
                __t("suppliers.product_2544"),
                __t("suppliers.quantity_b973"),
                __t("suppliers.document_c231"),
              ]}
              empty={!c.data?.purchases.some((p) => p.supplierId === selected.id)}
            >
              {c.data?.purchases
                .filter((p) => p.supplierId === selected.id)
                .map((p) => (
                  <tr key={p.id}>
                    <td>{p.id}</td>
                    <td>{displayName(__lang, String(p.product))}</td>
                    <td>{p.quantity}</td>
                    <td>{p.documentReference}</td>
                  </tr>
                ))}
            </BusinessTable>
            <div className="safety-notice">
              <LockKeyhole />
              {__t("suppliers.supplier_obligations_and_payment_ff1e")}
            </div>
          </>
        )}
      </OperationDialog>
    </BusinessPage>
  );
}
function OwnerPurchasePanel({ purchaseId }: { purchaseId: string }) {
  const __t = useT();
  const __lang = useErp().lang;
  const [rows, setRows] = useState<OwnerPurchaseFinance[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<"cost" | "payment" | null>(null);
  useEffect(() => {
    let active = true;
    import("@/data/business-owner-demo")
      .then((m) => m.ownerFinanceDemo.listPurchases())
      .then((r) => {
        if (active) {
          setRows(r);
          setLoading(false);
        }
      })
      .catch(() => {
        if (active) {
          setError("suppliers.owner_finance_preview_unavailabl_8b70");
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, []);
  const row = rows.find((r) => r.purchaseId === purchaseId);
  const balance = row
    ? outstanding(
        row.obligation,
        row.payments.map((p) => p.amount),
      )
    : "0";
  if (loading) return <p role="status">{__t("suppliers.loading_owner_finance_preview_6203")}</p>;
  if (error) return <p role="alert">{__t(error)}</p>;
  return (
    <section className="owner-finance">
      <h3 className="operation-section-title">
        {__t("suppliers.super_admin_confidential_preview_5d0e")}
      </h3>
      <p className="field-hint">{__t("suppliers.synthetic_data_role_preview_is_n_9fdb")}</p>
      <dl className="detail-list">
        <dt>{__t("suppliers.unit_cost_67cf")}</dt>
        <dd>{row ? formatMoney(row.unitCost) : "Not configured"}</dd>
        <dt>{__t("suppliers.obligation_dd91")}</dt>
        <dd>{row ? formatMoney(row.obligation) : "Not configured"}</dd>
        <dt>{__t("suppliers.outstanding_draft_2aae")}</dt>
        <dd>{formatMoney(balance)}</dd>
      </dl>
      <BusinessTable
        headers={[
          "DATE",
          __t("suppliers.reference_dcd3"),
          __t("suppliers.amount_d011"),
          __t("suppliers.state_2b84"),
        ]}
        empty={!row?.payments.length}
      >
        {row?.payments.map((p) => (
          <tr key={p.id}>
            <td>{p.date}</td>
            <td>{p.reference}</td>
            <td>{formatMoney(p.amount)}</td>
            <td>
              <DraftState />
            </td>
          </tr>
        ))}
      </BusinessTable>
      <div className="form-actions">
        <Button variant="outline" onClick={() => setForm("cost")}>
          {__t("suppliers.cost_obligation_draft_de56")}
        </Button>
        <Button variant="outline" disabled={!row} onClick={() => setForm("payment")}>
          {__t("suppliers.supplier_payment_draft_fcee")}
        </Button>
      </div>
      {form === "cost" && (
        <OperationDraftForm
          title={__t("suppliers.owner_finance_76cc")}
          schema={ownerCostSchema}
          fields={[
            { name: "unitCost", label: __t("suppliers.unit_cost_dzd_deba") },
            { name: "obligation", label: __t("suppliers.explicit_obligation_dzd_c12c") },
            { name: "documentReference", label: __t("suppliers.finance_document_reference_1de9") },
          ]}
          onCancel={() => setForm(null)}
          extraValidate={(v) =>
            row
              ? validateRepayment(sumMoney(row.payments.map((p) => p.amount)), v.obligation)
              : undefined
          }
          onSave={(v) => {
            setRows((prev) => [
              ...prev.filter((r) => r.purchaseId !== purchaseId),
              {
                purchaseId,
                unitCost: v.unitCost,
                obligation: v.obligation,
                payments: row?.payments ?? [],
              },
            ]);
            setForm(null);
          }}
        />
      )}
      {form === "payment" && row && (
        <OperationDraftForm
          title={__t("suppliers.supplier_payment_915c")}
          schema={repaymentSchema}
          fields={[
            { name: "amount", label: __t("suppliers.supplier_payment_dzd_e786") },
            { name: "date", label: __t("suppliers.payment_date_7133"), type: "date" },
            {
              name: "method",
              label: __t("suppliers.payment_method_f0aa"),
              options: ["Cash", "Bank"],
            },
            { name: "reference", label: __t("suppliers.payment_reference_f17c") },
            {
              name: "authorizationReference",
              label: __t("suppliers.authorization_reference_7deb"),
            },
          ]}
          extraValidate={(v) => validateRepayment(v.amount, balance)}
          onCancel={() => setForm(null)}
          onSave={(v) => {
            setRows((prev) =>
              prev.map((r) =>
                r.purchaseId === purchaseId
                  ? {
                      ...r,
                      payments: [
                        ...r.payments,
                        {
                          ...v,
                          id: `DRAFT-SP-${r.payments.length + 1}`,
                          subjectId: purchaseId,
                          source: "Session draft",
                        },
                      ],
                    }
                  : r,
              ),
            );
            setForm(null);
          }}
        />
      )}
    </section>
  );
}
export function PurchasesPage() {
  const __t = useT();
  const __lang = useErp().lang;
  const c = useBusiness();
  const session = useSession();
  const receipts = session.purchaseReceipts;
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Purchase | null>(null);
  const [receive, setReceive] = useState(false);
  const [notice, setNotice] = useState("");
  const rows = (c.data?.purchases ?? []).filter(
    (r) =>
      inScope(r.store, c.scope) &&
      [r.id, r.product, r.documentReference].join(" ").toLowerCase().includes(query.toLowerCase()),
  );
  const purchaseFields: DraftField[] = [
    {
      name: "supplierId",
      label: __t("suppliers.supplier_ec13"),
      options: c.data?.suppliers.map((r) => r.id) ?? [],
      optionLabels: Object.fromEntries(
        (c.data?.suppliers ?? []).map((r) => [r.id, displayName(__lang, r.name)]),
      ),
    },
    { name: "store", label: __t("suppliers.store_fdb0"), options: ["M01", "M02"] },
    { name: "kind", label: __t("suppliers.receiving_type_8e55"), options: ["Phone", "Accessory"] },
    { name: "product", label: __t("suppliers.product_sku_reference_deb7") },
    { name: "quantity", label: __t("suppliers.ordered_quantity_98ed") },
    { name: "documentReference", label: __t("suppliers.purchase_document_reference_4ad5") },
    { name: "expectedDate", label: __t("suppliers.expected_receipt_date_5628"), type: "date" },
    { name: "notes", label: __t("suppliers.notes_f4c6"), hint: __t("suppliers.optional_ebb0") },
  ];
  const receiptFields: DraftField[] = [
    { name: "quantity", label: __t("suppliers.receiving_quantity_95c2") },
    { name: "imei1", label: "IMEI1", hint: __t("suppliers.required_for_phone_15_digits_2605") },
    { name: "imei2", label: "IMEI2", hint: __t("suppliers.optional_ebb0") },
    {
      name: "serial",
      label: __t("suppliers.serial_number_3460"),
      hint: __t("suppliers.optional_ebb0"),
    },
    { name: "barcode", label: __t("suppliers.barcode_sku_reference_a1d9") },
    { name: "documentReference", label: __t("suppliers.receipt_document_reference_46ca") },
    {
      name: "notes",
      label: __t("suppliers.receiving_notes_843d"),
      hint: __t("suppliers.optional_ebb0"),
    },
  ];
  return (
    <BusinessPage
      title={__t("suppliers.purchases_receipts_a0d1")}
      eyebrow={__t("suppliers.procurement_receiving_dccd")}
      context={c}
      notice={notice}
      actions={
        <AddAction onClick={() => setOpen(true)}>
          {__t("suppliers.purchase_order_draft_8fd6")}
        </AddAction>
      }
    >
      <div className="process-strip">
        <span>{__t("suppliers.order_draft_ca90")}</span>
        <span>{__t("suppliers.serialized_phone_intake_sku_batc_3583")}</span>
        <span>{__t("suppliers.unposted_receiving_history_37b4")}</span>
      </div>
      <div className="table-toolbar">
        <SearchBox
          label={__t("suppliers.search_purchases_f62b")}
          value={query}
          onChange={setQuery}
        />
      </div>
      <BusinessTable
        headers={[
          __t("suppliers.order_document_a570"),
          __t("suppliers.supplier_d687"),
          __t("suppliers.product_type_4011"),
          __t("suppliers.ordered_draft_received_17d9"),
          __t("suppliers.store_3cfb"),
          __t("suppliers.details_3120"),
        ]}
        empty={!rows.length}
      >
        {rows.map((r) => (
          <tr key={r.id}>
            <td>
              <bdi>{r.documentReference}</bdi>
              <details className="retail-details table-details">
                <summary>{__t("retail.technical")}</summary>
                <bdi>{r.id}</bdi>
              </details>
            </td>
            <td>
              {displayName(
                __lang,
                c.data?.suppliers.find((s) => s.id === r.supplierId)?.name ?? r.supplierId,
              )}
            </td>
            <td>
              {displayName(__lang, String(r.product))}
              <small>{displayName(__lang, String(r.kind))}</small>
            </td>
            <td>
              {r.quantity} /{" "}
              {receipts
                .filter((x) => x.purchaseId === r.id)
                .reduce((n, x) => n + Number(x.quantity), 0)}
              <small>{__t("suppliers.receipt_drafts_do_not_increase_s_b206")}</small>
            </td>
            <td>{storeLabel(r.store)}</td>
            <td>
              <Button
                variant="ghost"
                size="icon"
                aria-label={__t("a11y.purchase", { id: r.id })}
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
        title={__t("suppliers.purchase_order_draft_8fd6")}
      >
        <OperationDraftForm
          title={__t("suppliers.purchase_order_d87d")}
          schema={purchaseSchema}
          optionalFields={["notes"]}
          fields={purchaseFields}
          defaults={{ store: c.scope === "M02" ? "M02" : "M01" }}
          extraValidate={(v) =>
            !c.data?.suppliers.some((s) => s.id === v.supplierId)
              ? "Supplier reference unavailable."
              : undefined
          }
          onCancel={() => setOpen(false)}
          onSave={(v) => {
            saveTestPurchase(v);
            setOpen(false);
            setNotice(__t("suppliers.purchase_order_session_draft_add_5597"));
          }}
        />
      </OperationDialog>
      <OperationDialog
        open={!!selected}
        onClose={() => {
          setSelected(null);
          setReceive(false);
        }}
        title={__t("suppliers.purchase_receiving_workspace_9009")}
      >
        {selected && (
          <>
            <dl className="detail-list">
              <dt>{__t("suppliers.order_supplier_aa8e")}</dt>
              <dd>
                {selected.id} / {selected.supplierId}
              </dd>
              <dt>{__t("suppliers.product_deb1")}</dt>
              <dd>
                {displayName(__lang, String(selected.product))} ·{" "}
                {displayName(__lang, String(selected.kind))}
              </dd>
              <dt>{__t("suppliers.document_0945")}</dt>
              <dd>{selected.documentReference}</dd>
              <dt>{__t("suppliers.expected_receipt_1baa")}</dt>
              <dd>{selected.expectedDate}</dd>
            </dl>
            <BusinessTable
              headers={[
                __t("suppliers.receipt_52c9"),
                __t("suppliers.quantity_b973"),
                __t("suppliers.identity_barcode_563a"),
                __t("suppliers.document_c231"),
              ]}
              empty={!receipts.some((r) => r.purchaseId === selected.id)}
            >
              {receipts
                .filter((r) => r.purchaseId === selected.id)
                .map((r) => (
                  <tr key={r.id}>
                    <td>{r.id}</td>
                    <td>{r.quantity}</td>
                    <td>{r.imei1 || r.barcode}</td>
                    <td>
                      {r.documentReference}
                      <small>{__t("suppliers.unposted_5873")}</small>
                    </td>
                  </tr>
                ))}
            </BusinessTable>
            {receive ? (
              <OperationDraftForm
                title={__t("suppliers.purchase_receipt_b4a9")}
                schema={purchaseReceiptSchema}
                optionalFields={["imei2", "serial", "notes"]}
                fields={receiptFields}
                defaults={{ quantity: selected.kind === "Phone" ? "1" : "" }}
                extraValidate={(v) =>
                  validatePurchaseReceipt(selected, v, receipts, [
                    ...stock.flatMap((i) => (i.kind === "phone" ? [i.imei] : [])),
                    ...receipts.flatMap((r) => [r.imei1, r.imei2, r.serial]).filter(Boolean),
                  ])
                }
                onCancel={() => setReceive(false)}
                onSave={(v) => {
                  saveTestPurchaseReceipt(selected.id, v);
                  setReceive(false);
                  setNotice(__t("suppliers.receiving_draft_retained_no_phon_2403"));
                }}
              />
            ) : (
              <AddAction onClick={() => setReceive(true)}>
                {__t("suppliers.purchase_receipt_b4a9")}
              </AddAction>
            )}
            {canPreviewOwnerFinance(c.role) ? (
              <OwnerPurchasePanel key={selected.id} purchaseId={selected.id} />
            ) : (
              <div className="safety-notice">
                <LockKeyhole />
                {__t("suppliers.confidential_cost_obligation_and_c7b4")}
              </div>
            )}
          </>
        )}
      </OperationDialog>
    </BusinessPage>
  );
}
