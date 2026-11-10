import { useState, useEffect, useCallback } from "react";
import {
  Plus,
  Search,
  Download,
  SlidersHorizontal,
  ChevronLeft,
  ChevronRight,
  Barcode,
  Printer,
  ShieldAlert,
  RefreshCw,
  ArrowRight,
  Check,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useErp } from "./context";
import { demoAdapter } from "@/data/demo";
import type { RecordRow } from "@/domain/erp";
import { DataTable, DetailDialog, DraftDialog, exportDemo } from "./shared";
import { BarcodePreview } from "./operation-ui";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useT } from "./context";
const configFor = (
  __t: (k: string) => string,
): Record<string, { title: string; description: string; action: string; labels?: string[] }> => ({
  phones: {
    title: __t("reports.phones_inventory_cb34"),
    description: __t("reports.individual_units_every_phone_has_2cc6"),
    action: __t("reports.add_phone_unit_983a"),
    labels: ["Model name", "IMEI / serial reference", "Remarks"],
  },
  accessories: {
    title: __t("reports.accessories_inventory_34d0"),
    description: __t("reports.sku_level_quantities_across_your_1410"),
    action: __t("reports.receive_accessories_882a"),
    labels: ["SKU name", "Barcode reference", "Quantity / remarks"],
  },
  catalog: {
    title: __t("reports.catalog_barcodes_1144"),
    description: __t("reports.brands_models_categories_and_pro_5e6f"),
    action: __t("reports.add_catalog_entry_6ced"),
    labels: ["Brand / category name", "Normalized reference", "Remarks"],
  },
  cash: {
    title: __t("reports.cash_registers_5854"),
    description: __t("reports.physical_drawers_sequential_shif_d242"),
    action: __t("reports.prepare_shift_draft_776a"),
  },
  customers: {
    title: __t("reports.customers_e6d0"),
    description: __t("reports.store_scoped_customer_records_an_c9d4"),
    action: __t("reports.add_customer_e3ec"),
    labels: ["Display name", "Contact reference", "Remarks"],
  },
  debts: {
    title: __t("reports.customer_debts_0640"),
    description: __t("reports.outstanding_accounts_repayment_s_eaf3"),
    action: __t("reports.prepare_repayment_draft_1d06"),
  },
  suppliers: {
    title: __t("reports.suppliers_1814"),
    description: __t("reports.operational_supplier_contacts_an_fc12"),
    action: __t("reports.add_supplier_4252"),
  },
  purchases: {
    title: __t("reports.purchases_receipts_a0d1"),
    description: __t("reports.purchase_requests_delivery_check_9669"),
    action: __t("reports.create_purchase_draft_31cd"),
  },
  expenses: {
    title: __t("reports.expenses_1349"),
    description: __t("reports.cash_and_bank_expense_records_pe_f9a4"),
    action: __t("reports.add_expense_draft_46dd"),
  },
  transfers: {
    title: __t("reports.inter_store_transfers_4d97"),
    description: __t("reports.dual_approvals_physical_dispatch_4e6c"),
    action: __t("reports.request_transfer_3a0f"),
  },
  facility: {
    title: __t("reports.facility_agreements_a3eb"),
    description: __t("reports.magasin_1_m01_salary_facilities__a9fa"),
    action: __t("reports.create_agreement_draft_f231"),
  },
  sav: {
    title: __t("reports.warranty_sav_eb74"),
    description: __t("reports.sold_unit_traceability_inspectio_947b"),
    action: __t("reports.open_case_draft_ffc1"),
  },
  users: {
    title: __t("reports.users_roles_5a61"),
    description: __t("reports.authorized_store_memberships_and_8097"),
    action: __t("reports.prepare_invitation_b5ab"),
  },
  audit: {
    title: __t("reports.audit_history_4174"),
    description: __t("reports.traceable_actions_operator_attri_b1c3"),
    action: "",
  },
});
export function ModulePage({ area }: { area: string }) {
  const __t = useT();
  const { scope } = useErp();
  const c = configFor(__t)[area];
  const [rows, setRows] = useState<RecordRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState(area === "phones" ? "Available" : "All statuses");
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<RecordRow | null>(null);
  const [barcodes, setBarcodes] = useState(false);
  const [notice, setNotice] = useState("");
  const [drafts, setDrafts] = useState<RecordRow[]>([]);
  const [tab, setTab] = useState("All records");
  const load = useCallback(() => {
    setLoading(true);
    setFailed(false);
    demoAdapter
      .list(area, scope)
      .then((data) => {
        setRows(data);
        setLoading(false);
      })
      .catch(() => {
        setFailed(true);
        setLoading(false);
      });
  }, [area, scope]);
  useEffect(() => {
    load();
  }, [load]);
  const blocked = area === "facility" && scope === "M02";
  const filtered = [...drafts.filter((r) => scope === "ALL" || r.store === scope), ...rows].filter(
    (r) =>
      (status === "All statuses" || r.status === status) &&
      (r.name + " " + r.detail + " " + r.id + " " + (r.code ?? ""))
        .toLowerCase()
        .includes(query.toLowerCase()) &&
      (tab !== "Demo drafts" || r.status === "Draft"),
  );
  if (!c) return null;
  return (
    <div className="page-enter module-page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            {["phones", "accessories", "catalog", "transfers"].includes(area)
              ? "INVENTORY OPERATIONS"
              : "BUSINESS WORKSPACE"}
          </div>
          <h1>
            {c.title}
            <span className="heading-dot">.</span>
          </h1>
          <p>{c.description}</p>
        </div>
        <div className="heading-actions">
          <Button variant="outline" disabled={blocked} onClick={() => exportDemo(filtered, area)}>
            <Download />
            {__t("reports.export_demo_4325")}
          </Button>
          {c.action && (
            <Button disabled={blocked} onClick={() => setOpen(true)}>
              <Plus />
              {c.action}
            </Button>
          )}
        </div>
      </div>
      {area === "transfers" && (
        <div className="process-strip">
          {[
            "Request",
            "Super Admin approval",
            "M02 Manager approval",
            "Dispatch",
            "Scanned receipt",
          ].map((step, i) => (
            <span key={step}>
              <b>{i + 1}</b>
              {step}
              {i < 4 && <ArrowRight size={14} />}
            </span>
          ))}
        </div>
      )}
      {area === "cash" && (
        <div className="safety-notice">
          <ShieldAlert size={17} />
          Demo shifts only. One physical drawer per store; opening, closing and cash posting are not
          connected.
        </div>
      )}
      {area === "facility" && (
        <div className="safety-notice">
          <ShieldAlert size={17} />
          {__t("reports.example_120_000_dzd_12_installme_7f0b")}
        </div>
      )}
      {["users", "debts", "expenses", "sav"].includes(area) && (
        <div className="safety-notice">
          <ShieldAlert size={17} />
          {__t("reports.approval_policies_remain_pending_8c73")}
        </div>
      )}
      {blocked ? (
        <div className="permission-state">
          <ShieldAlert size={38} />
          <h2>{__t("reports.magasin_1_m01_only_2bae")}</h2>
          <p>{__t("reports.facility_agreements_are_not_avai_5100")}</p>
        </div>
      ) : (
        <>
          <div className="module-stats">
            <div>
              <span>{__t("reports.sample_records_fbfa")}</span>
              <strong>{rows.length}</strong>
            </div>
            <div>
              <span>{area === "accessories" ? "Stock units" : "Available / open"}</span>
              <strong>
                {area === "accessories"
                  ? rows.reduce((s, r) => s + (r.quantity ?? 0), 0)
                  : rows.filter((r) => ["Available", "Open"].includes(r.status)).length}
              </strong>
            </div>
            <div>
              <span>{__t("reports.session_drafts_f288")}</span>
              <strong>{drafts.length}</strong>
            </div>
            <div>
              <span>{__t("reports.data_source_79f7")}</span>
              <strong className="stat-text">{__t("reports.synthetic_only_95ed")}</strong>
            </div>
          </div>
          <div className="module-tabs">
            {["All records", "Demo drafts"].map((t) => (
              <Button
                variant="ghost"
                className={tab === t ? "tab-active" : ""}
                key={t}
                onClick={() => setTab(t)}
              >
                {t}
              </Button>
            ))}
            <span>{__t("reports.demo_data_0ba5")}</span>
          </div>
          <div className="table-toolbar">
            <label className="search-field">
              <Search size={17} />
              <input
                aria-label={__t("a11y.search", { name: c.title })}
                placeholder={`Search ${area === "phones" ? "model, IMEI or barcode" : area === "accessories" ? "SKU, category or barcode" : "records"}…`}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            <div className="table-filters">
              <SlidersHorizontal size={15} />
              <select
                aria-label={__t("reports.status_filter_d6fa")}
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                {[
                  "All statuses",
                  "Available",
                  "Low stock",
                  "Sold",
                  "Open",
                  "Pending",
                  "Draft",
                  "In transit",
                  "Overdue",
                  "Paid",
                ].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
              {["phones", "accessories", "catalog"].includes(area) && (
                <Button variant="outline" onClick={() => setBarcodes(true)}>
                  <Barcode />
                  {__t("reports.labels_3ad6")}
                </Button>
              )}
            </div>
          </div>
          {loading ? (
            <div className="empty-state" role="status">
              <RefreshCw className="spin" />
              <h3>{__t("reports.loading_demo_records_e962")}</h3>
            </div>
          ) : failed ? (
            <div className="empty-state">
              <AlertTriangle />
              <h3>{__t("reports.records_could_not_load_9a7d")}</h3>
              <Button onClick={load}>{__t("reports.try_again_f915")}</Button>
            </div>
          ) : (
            <DataTable
              rows={filtered}
              columns={["phones", "accessories"].includes(area) ? "stock" : "standard"}
              onSelect={setDetail}
            />
          )}
          <div className="table-bottom">
            <span>Showing {filtered.length} demo records</span>
            <div>
              <Button
                variant="outline"
                size="icon"
                disabled
                aria-label={__t("reports.previous_page_16de")}
              >
                <ChevronLeft />
              </Button>
              <span>1</span>
              <Button
                variant="outline"
                size="icon"
                disabled
                aria-label={__t("reports.next_page_374b")}
              >
                <ChevronRight />
              </Button>
            </div>
          </div>
        </>
      )}
      {notice && (
        <div className="session-notice" role="status">
          <Check size={16} />
          {notice}
        </div>
      )}
      <DraftDialog
        title={c.action}
        open={open}
        onClose={() => setOpen(false)}
        fields={c.labels ?? ["Name", "Reference", "Remarks"]}
        onSave={(name, reference) => {
          setDrafts((prev) => [
            {
              id: `DRAFT-${prev.length + 1}`,
              name,
              detail: reference || "Session-only demo draft",
              store: scope === "M02" ? "M02" : "M01",
              status: "Draft",
            },
            ...prev,
          ]);
          setStatus("All statuses");
          setNotice(__t("reports.demo_draft_added_for_this_sessio_eabf"));
        }}
      />
      <DetailDialog row={detail} onClose={() => setDetail(null)} />
      <Dialog open={barcodes} onOpenChange={setBarcodes}>
        <DialogContent>
          <DialogTitle>{__t("reports.demo_barcode_labels_b406")}</DialogTitle>
          <DialogDescription>
            {__t("reports.preview_only_actual_scanner_and__e277")}
          </DialogDescription>
          <div className="barcode-labels">
            {filtered.slice(0, 4).map((r) => (
              <div key={r.id}>
                <strong>{r.name}</strong>
                <BarcodePreview value={r.code ?? r.id} />
                <small>{__t("reports.demo_data_not_operational_4fda")}</small>
              </div>
            ))}
          </div>
          <Button variant="outline" onClick={() => window.print()}>
            <Printer />
            {__t("reports.print_preview_d729")}
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
