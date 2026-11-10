import { DT } from "./shared";
import { useState } from "react";
import { Barcode, Printer, ShieldAlert, Search, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useErp } from "./context";
import { useTestWorkspace, addTestCatalog } from "@/data/test-workspace";
import { testCatalogSchema } from "@/domain/test-catalog";
import { OperationDialog, OperationDraftForm } from "./operation-ui";
import { TestSaleDocuments } from "./test-documents";
import { storeLabel, formatMoney } from "@/domain/erp";
import { BarcodePreview } from "./operation-ui";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useT } from "./context";
import { displayText } from "@/locales/display";

// Catalog & document templates. Synthetic reference data only; document
// templates are drafts with explicit approval blockers — nothing here issues
// official documents.

const templateBlockers = [
  "Fiscal information not approved",
  "Warranty terms not approved (OD-08)",
  "Legal wording not approved",
  "Numbering sequences not configured",
  "Printer hardware unverified",
];

const templates = [
  {
    id: "TPL-RECEIPT",
    name: "Sales receipt",
    purpose: "Customer proof of sale after POS checkout",
  },
  {
    id: "TPL-TRANSFER",
    name: "Transfer dispatch note",
    purpose: "Accompanies physical inter-store dispatch",
  },
  {
    id: "TPL-FACILITY",
    name: "Facility schedule",
    purpose: "M01 installment schedule with bank remittance evidence",
  },
  {
    id: "TPL-BLINDCOUNT",
    name: "Blind count sheet",
    purpose: "Drawer closing count without expected totals",
  },
];

export function CatalogPage() {
  const __t = useT();
  const { scope, lang } = useErp();
  const [query, setQuery] = useState("");
  const [labels, setLabels] = useState(false);
  const [template, setTemplate] = useState<string | null>(null);
  const ws = useTestWorkspace();
  const stock = [...ws.phones, ...ws.accessories];
  const [create, setCreate] = useState(false);
  const items = stock.filter(
    (i) =>
      (scope === "ALL" || i.store === scope) &&
      [i.name, i.detail, i.code, i.category].join(" ").toLowerCase().includes(query.toLowerCase()),
  );
  const brands = [...new Set(stock.map((i) => i.category ?? __t("catalog.other_6311")))];
  return (
    <div className="page-enter module-page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">{__t("catalog.inventory_operations_c222")}</div>
          <h1>
            {__t("catalog.catalog_barcodes_1144")}
            <span className="heading-dot">.</span>
          </h1>
          <p>{__t("catalog.demo_data_reference_catalog_and__1e24")}</p>
        </div>
        <div className="heading-actions">
          <Button variant="outline" onClick={() => setLabels(true)}>
            <Barcode />
            {__t("catalog.barcode_labels_4322")}
          </Button>
        </div>
      </div>
      <div className="safety-notice">
        <ShieldAlert size={17} />
        {__t("catalog.synthetic_catalog_only_document__22a0")}
      </div>
      <div className="module-stats">
        <div>
          <span>{__t("catalog.catalog_entries_913c")}</span>
          <strong>{stock.length}</strong>
        </div>
        <div>
          <span>{__t("catalog.brands_categories_a403")}</span>
          <strong>{brands.length}</strong>
        </div>
        <div>
          <span>{__t("catalog.document_templates_fb6a")}</span>
          <strong>{templates.length}</strong>
        </div>
        <div>
          <span>{__t("catalog.template_approval_711e")}</span>
          <strong className="stat-text">{__t("catalog.blocked_4ecc")}</strong>
        </div>
      </div>
      <div className="table-toolbar">
        <label className="search-field">
          <Search size={17} />
          <input
            aria-label={__t("catalog.search_catalog_8dd6")}
            placeholder={__t("catalog.search_model_sku_or_barcode_1aac")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <span>{__t("fl.entriesScoped", { n: String(items.length) })}</span>
      </div>
      <div className="table-scroll">
        <table className="data-table business-table">
          <thead>
            <tr>
              <th>{__t("catalog.entry_5d5f")}</th>
              <th>{__t("catalog.category_e385")}</th>
              <th>{__t("catalog.store_3cfb")}</th>
              <th>{__t("catalog.identifier_6fcc")}</th>
              <th>{__t("catalog.price_6da7")}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.id}>
                <td>
                  <strong>{i.name}</strong>
                  <small>{i.detail}</small>
                </td>
                <td>{i.category}</td>
                <td>{storeLabel(i.store)}</td>
                <td>
                  {i.code}
                  {i.kind === "phone" && <small>IMEI {i.imei}</small>}
                </td>
                <td>{i.amount ? formatMoney(i.amount) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!items.length && (
          <div className="empty-state">
            <Search />
            <h3>{__t("catalog.no_matching_entries_46ec")}</h3>
          </div>
        )}
      </div>
      <h2 className="operation-section-title">
        <FileText size={16} />
        {__t("catalog.document_templates_drafts_only_4a25")}
      </h2>
      <div className="table-scroll">
        <table className="data-table business-table">
          <thead>
            <tr>
              <th>{__t("catalog.template_9208")}</th>
              <th>{__t("catalog.purpose_ace3")}</th>
              <th>{__t("catalog.state_2b84")}</th>
              <th>{__t("catalog.preview_1614")}</th>
            </tr>
          </thead>
          <tbody>
            {templates.map((t) => (
              <tr key={t.id}>
                <td>
                  <strong>
                    <DT text={t.name} />
                  </strong>
                  <small>{t.id}</small>
                </td>
                <td>
                  <DT text={t.purpose} />
                </td>
                <td>
                  <small>{__t("fl.draftBlockers", { n: String(templateBlockers.length) })}</small>
                </td>
                <td>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={__t("a11y.preview", { name: displayText(lang, t.name) })}
                    onClick={() => setTemplate(t.id)}
                  >
                    <Printer />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Dialog open={labels} onOpenChange={setLabels}>
        <DialogContent>
          <DialogTitle>{__t("catalog.demo_barcode_labels_b406")}</DialogTitle>
          <DialogDescription>
            {__t("catalog.preview_only_actual_scanner_and__e277")}
          </DialogDescription>
          <div className="barcode-labels">
            {items.slice(0, 4).map((r) => (
              <div key={r.id}>
                <strong>{r.name}</strong>
                <BarcodePreview value={r.code ?? r.id} />
                <small>{__t("catalog.demo_data_not_operational_4fda")}</small>
              </div>
            ))}
          </div>
          <Button variant="outline" onClick={() => window.print()}>
            <Printer />
            {__t("catalog.print_preview_d729")}
          </Button>
        </DialogContent>
      </Dialog>
      <Dialog open={!!template} onOpenChange={() => setTemplate(null)}>
        <DialogContent>
          <DialogTitle>
            {displayText(
              lang,
              templates.find((t) => t.id === template)?.name ?? __t("catalog.template_278c"),
            )}{" "}
            · {__t("doc.draft")}
          </DialogTitle>
          <DialogDescription>
            {__t("catalog.not_an_official_document_approva_c576")}
          </DialogDescription>
          <ul className="operation-history">
            {templateBlockers.map((b) => (
              <li key={b}>
                <DT text={b} />
                <small>{__t("catalog.approval_blocker_unresolved_e240")}</small>
              </li>
            ))}
          </ul>
          <Button disabled variant="outline">
            <ShieldAlert />
            {__t("catalog.issuance_unavailable_ceaa")}
          </Button>
        </DialogContent>
      </Dialog>
      <section className="test-sale-documents">
        <h2>{__t("catalog.brands_categories_a403")}</h2>
        <Button variant="outline" onClick={() => setCreate(true)}>
          {__t("inv.fBrand")} / {__t("inv.fModel")} / {__t("inv.fColor")} / {__t("inv.fVariant")} +
        </Button>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>{__t("inv.fBrand")}</th>
                <th>{__t("inv.fModel")}</th>
                <th>{__t("inv.fColor")}</th>
                <th>{__t("inv.fVariant")}</th>
              </tr>
            </thead>
            <tbody>
              {ws.catalog?.map((e) => (
                <tr key={e.id}>
                  <td>{e.brand}</td>
                  <td>{e.model}</td>
                  <td>{e.color}</td>
                  <td>{e.variant}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <OperationDialog
        open={create}
        onClose={() => setCreate(false)}
        title={__t("catalog.catalog_barcodes_1144")}
      >
        <OperationDraftForm
          title={__t("catalog.catalog_barcodes_1144")}
          schema={testCatalogSchema}
          fields={[
            { name: "brand", label: __t("inv.fBrand") },
            { name: "model", label: __t("inv.fModel") },
            { name: "color", label: __t("inv.fColor") },
            { name: "variant", label: __t("inv.fVariant") },
          ]}
          onCancel={() => setCreate(false)}
          onSave={(v) => {
            addTestCatalog(v);
            setCreate(false);
          }}
        />
      </OperationDialog>
      <TestSaleDocuments onClose={() => {}} />
    </div>
  );
}
