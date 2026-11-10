import { UsedPurchase } from "./used-purchase";
import { StockCount } from "./stock-count";
import { localizeMessage } from "@/locales/messages";
import { useState } from "react";
import { Plus, Search, ArrowUpRight, Download, History, LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { VerifyButton } from "./fast-intake";
import { useErp } from "./context";
import { operationsDemo } from "@/data/operations-demo";
import {
  useTestWorkspace,
  getTestState,
  addTestPhone,
  receiveTestAccessory,
  testSettings,
  testAccessoryAlert,
  saveTestAccessoryMeta,
  phoneIdentities,
  searchPhones,
  setTestAccessoryPrice,
  adjustTestAccessory,
} from "@/data/test-workspace";
import {
  phoneDraftSchema,
  accessoryDraftSchema,
  validatePhoneIdentity,
  validateAccessoryIdentity,
  type PhoneDraft,
  type AccessoryDraft,
} from "@/domain/operations";
import { storeLabel, formatMoney, type PhoneUnit, type AccessorySku } from "@/domain/erp";
import { Status, exportDemo } from "./shared";
import { IntakeSupplier, OwnerProvenance } from "./supplier-provenance";
import { reviewActor } from "@/data/test-workspace";
import { ownerReceiptHistory, ownerSupplierName } from "@/data/supplier-provenance";
import { BarcodeLabel } from "./barcode-label";
import { intakeText } from "@/locales/intake";
import { OperationDialog, OperationDraftForm, type DraftField } from "./operation-ui";

type PhoneView = import("@/data/test-workspace").TestPhone;
type AccessoryView = AccessorySku & { draft?: AccessoryDraft };

export function PhonesInventory() {
  const { scope, t, lang } = useErp();
  const ws = useTestWorkspace();
  const drafts: PhoneView[] = ws.phones.filter((p) => p.draft);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("Available");
  const [condition, setCondition] = useState("All");
  const [brandFilter, setBrandFilter] = useState("All");
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<PhoneView | null>(null);
  const [notice, setNotice] = useState("");
  const [intakeKey, setIntakeKey] = useState(() => crypto.randomUUID());
  const catalog = ws.catalog ?? [];
  const knownBrands = [
    ...new Set([
      ...catalog.map((c) => c.brand),
      ...ws.phones.map((p) => p.category ?? "").filter(Boolean),
    ]),
  ];
  const modelsFor = (brand: string) => {
    const b = brand.trim().toLowerCase();
    const rows = [
      ...catalog.map((c) => ({ brand: c.brand, model: c.model })),
      ...ws.phones.map((p) => ({ brand: p.category ?? "", model: p.name })),
    ];
    return [...new Set(rows.filter((r) => !b || r.brand.toLowerCase() === b).map((r) => r.model))];
  };
  // Scoped users keep their store; ALL scope must choose explicitly (no silent M01 default).
  const storeOptions = scope === "ALL" ? ["M01", "M02"] : [scope];
  const phoneFields: DraftField[] = [
    {
      name: "store",
      label: t("cash.store"),
      options: storeOptions,
      ...(scope === "ALL" ? { hint: t("intake.storeHint") } : {}),
    },
    {
      name: "brand",
      label: t("inv.fBrand"),
      suggestions: knownBrands,
      hint: t("intake.brandHint"),
    },
    {
      name: "name",
      label: t("inv.fModel"),
      suggestions: modelsFor(""),
      suggestionsFor: (v) => modelsFor(v["brand"] ?? ""),
      hint: t("intake.modelHint"),
    },
    { name: "condition", label: t("inv.fCondition"), options: ["NEW", "USED"] },
    { name: "salePrice", label: t("inv.fSalePrice"), hint: t("inv.fSalePriceHint") },
    {
      name: "color",
      label: t("inv.fColor"),
      suggestions: [...new Set(catalog.map((c) => c.color))],
      hint: t("intake.optional"),
    },
    { name: "imei1", scan: "imei1", label: "IMEI 1", hint: t("intake.imeiHint") },
    { name: "imei2", scan: "imei2", label: "IMEI 2", hint: t("inv.fImei2Hint") },
    { name: "serial", scan: "serial", label: t("inv.fSerial"), hint: t("intake.serialHint") },
    {
      name: "storage",
      label: t("inv.fStorage"),
      suggestions: [...new Set(catalog.map((c) => c.variant))],
    },
    {
      name: "packaging",
      label: t("inv.fPackaging"),
      options: ["UNKNOWN", "SEALED", "OPEN_BOX", "NO_BOX"],
    },
    { name: "battery", label: t("inv.fBattery"), hint: t("intake.batteryHint") },
    { name: "remarks", label: t("cash.remarks") },
    { name: "barcode", label: t("inv.fBarcode"), hint: t("intake.barcodeHint") },
    { name: "incomingReference", label: t("prov.reference") },
  ];
  const rows: PhoneView[] = ws.phones.filter((row) => scope === "ALL" || scope === row.store);
  const filtered = rows
    .filter(
      (row) =>
        (status === "All" || row.status === status) &&
        (condition === "All" || row.condition === condition) &&
        (brandFilter === "All" ||
          row.name.toLowerCase().includes(brandFilter.toLowerCase()) ||
          row.draft?.brand.toLowerCase() === brandFilter.toLowerCase()) &&
        (searchPhones([row], query).length > 0 ||
          (reviewActor()?.role === "SUPER_ADMIN" &&
            (ownerSupplierName(row.supplierId) ?? "").toLowerCase().includes(query.toLowerCase()))),
    )
    .sort((a, b) => Number(b.status === "Available") - Number(a.status === "Available"));
  const identities = phoneIdentities(ws);
  return (
    <div className="page-enter module-page">
      <UsedPurchase store={scope === "M02" ? "M02" : "M01"} />
      <div className="page-heading">
        <div>
          <div className="eyebrow">{t("inv.phonesEyebrow")}</div>
          <h1>
            {t("inv.phonesTitle")}
            <span className="heading-dot">.</span>
          </h1>
          <details className="retail-details heading-details">
            <summary>{t("retail.details")}</summary>
            <p>{t("inv.phonesSubtitle")}</p>
          </details>
        </div>
        <div className="heading-actions">
          <Button variant="outline" onClick={() => exportDemo(filtered, "phones")}>
            <Download />
            {t("inv.exportDemo")}
          </Button>
          <Button onClick={() => setOpen(true)}>
            <Plus />
            {t("inv.addPhone")}
          </Button>
        </div>
      </div>
      {scope !== "ALL" && <StockCount key={scope} store={scope} />}
      <details className="retail-details">
        <summary>{t("retail.details")}</summary>
        <div className="module-stats">
          <div>
            <span>{t("inv.availableUnits")}</span>
            <strong>{rows.filter((row) => row.status === "Available").length}</strong>
          </div>
          <div>
            <span>{t("inv.usedPhones")}</span>
            <strong>{rows.filter((row) => row.condition === "USED").length}</strong>
          </div>
          <div>
            <span>{t("inv.intakeDrafts")}</span>
            <strong>{drafts.length}</strong>
          </div>
        </div>
      </details>
      <div className="retail-filters">
        {["All", "iPhone", "Samsung", "Used"].map((value) => (
          <Button
            key={value}
            size="sm"
            variant={
              (
                value === "Used"
                  ? condition === "USED"
                  : brandFilter === value && condition === "All"
              )
                ? "secondary"
                : "ghost"
            }
            aria-pressed={
              value === "Used" ? condition === "USED" : brandFilter === value && condition === "All"
            }
            onClick={() => {
              setBrandFilter(value === "Used" ? "All" : value);
              setCondition(value === "Used" ? "USED" : "All");
            }}
          >
            {value === "All" ? t("retail.all") : value === "Used" ? t("retail.used") : value}
          </Button>
        ))}
      </div>
      <div className="table-toolbar">
        <label className="search-field">
          <Search size={17} />
          <input
            aria-label={t("inv.searchPhones")}
            placeholder={t("inv.searchPhonesPlaceholder")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <div className="table-filters">
          <select
            aria-label={t("inv.phoneStatus")}
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="Available">{localizeMessage(lang, "Available")}</option>
            <option value="All">{t("inv.allStatuses")}</option>
            <option value="Sold">{localizeMessage(lang, "Sold")}</option>
            <option value="Draft">{localizeMessage(lang, "Draft")}</option>
          </select>
          <select
            aria-label={t("inv.conditionFilter")}
            value={condition}
            onChange={(e) => setCondition(e.target.value)}
          >
            <option value="All">{t("inv.allConditions")}</option>
            <option value="NEW">{localizeMessage(lang, "NEW")}</option>
            <option value="USED">{localizeMessage(lang, "USED")}</option>
          </select>
        </div>
      </div>
      <div className="table-scroll">
        <table className="data-table inventory-table">
          <thead>
            <tr>
              <th>{t("inv.colUnit")}</th>
              <th>{t("inv.colIdentity")}</th>
              <th>{t("inv.colCondition")}</th>
              <th>{t("shared.store")}</th>
              <th>{t("shared.status")}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => (
              <tr key={row.id}>
                <td>
                  <strong>{row.name}</strong>
                  <small>{row.detail}</small>
                </td>
                <td className="ltr">
                  {row.imei}
                  <small>{row.code}</small>
                </td>
                <td>
                  {localizeMessage(lang, row.condition)}
                  <small>{localizeMessage(lang, row.packaging || "UNKNOWN")}</small>
                </td>
                <td>{storeLabel(row.store)}</td>
                <td>
                  <Status status={row.status} />
                </td>
                <td>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t("shared.openRecord", { id: row.id })}
                    onClick={() => setSelected(row)}
                  >
                    <ArrowUpRight />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!filtered.length && (
          <div className="empty-state">
            <Search />
            <h3>{t("inv.noPhones")}</h3>
          </div>
        )}
      </div>
      <div className="table-bottom">
        <span>
          {filtered.length} {t("inv.syntheticUnits")}
        </span>
      </div>
      {notice && (
        <p className="session-notice" role="status">
          {notice}
        </p>
      )}
      <OperationDialog open={open} onClose={() => setOpen(false)} title={t("inv.phoneIntakeDraft")}>
        <OperationDraftForm
          title={t("inv.phoneIntake")}
          optionalFields={[
            "imei2",
            "serial",
            "storage",
            "packaging",
            "battery",
            "remarks",
            "barcode",
            "incomingReference",
          ]}
          submitLabel={t("retail.addPhone")}
          children={<IntakeSupplier />}
          fields={phoneFields}
          schema={phoneDraftSchema}
          onScan={(assigned) => {
            const code = assigned.imei1 ?? assigned.imei2 ?? assigned.serial;
            const match = ws.phones.find((p) => p.code === code);
            if (match) {
              setOpen(false);
              setSelected(match);
            }
          }}
          key={intakeKey}
          defaults={{ store: scope === "ALL" ? "" : scope }}
          extraValidate={(value) =>
            validatePhoneIdentity(value, identities) ??
            (ws.phones.some((row) => row.code === value.barcode) ||
            ws.accessories.some((row) => row.code === value.barcode)
              ? t("inv.barcodeExists")
              : undefined)
          }
          onCancel={() => setOpen(false)}
          onSave={(value) => {
            const added = addTestPhone(value, { intakeKey });
            setStatus("All");
            setQuery("");
            setCondition("All");
            setBrandFilter("All");
            setOpen(false);
            setIntakeKey(crypto.randomUUID());
            setSelected(added);
            setNotice(t("intake.added", { name: added.name, code: added.code ?? "" }));
          }}
        />
      </OperationDialog>
      <OperationDialog
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected?.name ?? t("inv.phoneUnit")}
      >
        {selected && (
          <>
            <dl className="detail-list">
              <dt>{t("shared.store")}</dt>
              <dd>{storeLabel(selected.store)}</dd>
              <dt>{t("inv.phoneBox")}</dt>
              <dd>
                {localizeMessage(lang, selected.condition)} /{" "}
                {localizeMessage(lang, selected.packaging || "UNKNOWN")}
              </dd>
              <dt>IMEI1</dt>
              <dd className="ltr">{selected.imei}</dd>
              <dt>IMEI2</dt>
              <dd className="ltr">
                {selected.imei2 || selected.draft?.imei2 || t("inv.notInFixture")}
              </dd>
              <dt>{t("inv.fSerial")}</dt>
              <dd className="ltr">{selected.draft?.serial || t("inv.notInFixture")}</dd>
              <dt>{t("inv.batteryHealth")}</dt>
              <dd>
                {selected.draft?.battery
                  ? `${selected.draft.battery}%`
                  : selected.id === "PH-003"
                    ? "89% · Synthetic fixture"
                    : t("shared.notRecorded")}
              </dd>
              <dt>{t("inv.colorStorage")}</dt>
              <dd>{selected.detail}</dd>
              <dt>{t("inv.salePrice")}</dt>
              <dd className="ltr">{formatMoney(selected.amount ?? "0")}</dd>
              <dt>{t("shared.status")}</dt>
              <dd>
                <Status status={selected.status} />
              </dd>
            </dl>
            <details className="retail-details">
              <summary>{t("retail.technical")}</summary>
              <dl className="detail-list">
                <dt>{t("shared.reference")}</dt>
                <dd>
                  <bdi>{selected.id}</bdi>
                </dd>
              </dl>
            </details>
            <OwnerProvenance
              kind="phone"
              id={selected.id}
              supplierId={selected.supplierId}
              reference={selected.incomingReference}
              at={selected.receivedAt}
              operator={selected.receivedBy}
            />
            <VerifyButton
              template={testSettings(ws)["intake.checkUrlTemplate"]}
              serial={selected.draft?.serial ?? ""}
              imei={selected.imei}
            />
            <BarcodeLabel
              value={selected.code ?? selected.id}
              name={selected.name}
              store={selected.store}
              sizeMm={testSettings()["labels.sizeMm"]}
            />
            <h3 className="operation-section-title">
              <History size={16} />
              {t("inv.unitHistory")}
            </h3>
            <ul className="operation-history">
              {selected.draft ? (
                <li>
                  {t("pos.sessionDraft")} · {selected.draft.serial || selected.imei}
                </li>
              ) : (
                operationsDemo.history(selected.store, selected.id).map((event) => (
                  <li key={event.id}>
                    {event.action}
                    <small>
                      {event.operator} · {event.status}
                    </small>
                  </li>
                ))
              )}
            </ul>
            <Button disabled variant="outline">
              <LockKeyhole />
              {t("inv.adjustmentUnavailable")}
            </Button>
          </>
        )}
      </OperationDialog>
    </div>
  );
}

export function AccessoriesInventory() {
  const { scope, t, lang } = useErp();
  const ws = useTestWorkspace();
  const drafts: AccessoryView[] = ws.movements.flatMap((m) =>
    m.reason === "RECEIVING" && m.draft
      ? [
          {
            id: m.id,
            kind: "accessory" as const,
            name: m.name,
            detail: [m.draft.variant, m.draft.compatibility].filter(Boolean).join(" · "),
            store: m.store,
            status: "Draft" as const,
            category: m.draft.category,
            code: m.draft.barcode,
            quantity: m.quantity,
            draft: m.draft,
          },
        ]
      : [],
  );
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [view, setView] = useState("inventory");
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<AccessoryView | null>(null);
  const [notice, setNotice] = useState("");
  const [receivingSku, setReceivingSku] = useState("");
  const [receivingKey, setReceivingKey] = useState(() => crypto.randomUUID());
  const receiving = ws.accessories.find((row) => row.id === receivingSku);
  const accessoryFields: DraftField[] = [
    { name: "name", label: t("inv.fProductName") },
    { name: "sku", label: t("inv.fSku") },
    { name: "category", label: t("inv.fCategory") },
    { name: "variant", label: t("inv.fVariant") },
    { name: "compatibility", label: t("inv.fCompatibility") },
    { name: "barcode", scan: "barcode", label: t("inv.fBarcode"), hint: t("intake.barcodeHint") },
    { name: "salePrice", label: t("inv.fSalePrice") },
    { name: "store", label: t("cash.store"), options: scope === "ALL" ? ["M01", "M02"] : [scope] },
    { name: "quantity", label: t("inv.fQuantity") },
    { name: "reference", label: t("inv.fReference") },
    { name: "remarks", label: t("cash.remarks"), hint: t("cash.remarksHint") },
  ];
  const receivingFields = accessoryFields.map((field) =>
    receiving &&
    ["name", "sku", "category", "variant", "compatibility", "barcode", "salePrice"].includes(
      field.name,
    )
      ? { ...field, readOnly: true }
      : field,
  );
  const receivingDefaults: Record<string, string> = receiving
    ? {
        name: receiving.name,
        sku: receiving.id,
        category: receiving.category ?? t("inv.uncategorized"),
        variant: receiving.detail,
        compatibility: receiving.detail,
        barcode: receiving.code ?? receiving.id,
        salePrice: receiving.amount ?? "",
        store: scope === "ALL" ? receiving.store : scope,
      }
    : { store: scope === "ALL" ? "" : scope };
  const rows: AccessoryView[] = ws.accessories.filter(
    (row) => scope === "ALL" || scope === row.store,
  );
  const categories = Array.from(new Set(rows.map((row) => row.category ?? t("inv.uncategorized"))));
  const filtered = rows.filter(
    (row) =>
      (category === "All" || category === row.category) &&
      [
        row.name,
        row.detail,
        row.id,
        row.code,
        row.category,
        row.draft?.sku,
        ...(reviewActor()?.role === "SUPER_ADMIN"
          ? ownerReceiptHistory(row.id).map((m) => ownerSupplierName(m.supplierId) ?? "")
          : []),
      ]
        .join(" ")
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  return (
    <div className="page-enter module-page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">{t("inv.accEyebrow")}</div>
          <h1>
            {t("inv.accTitle")}
            <span className="heading-dot">.</span>
          </h1>
          <details className="retail-details heading-details">
            <summary>{t("retail.details")}</summary>
            <p>{t("inv.accSubtitle")}</p>
          </details>
        </div>
        <div className="heading-actions">
          <Button variant="outline" onClick={() => exportDemo(filtered, "accessories")}>
            <Download />
            {t("inv.exportDemo")}
          </Button>
          <Button onClick={() => setOpen(true)}>
            <Plus />
            {t("inv.receiveAccessories")}
          </Button>
        </div>
      </div>
      {scope !== "ALL" && <StockCount key={scope} store={scope} />}
      <details className="retail-details">
        <summary>{t("retail.details")}</summary>
        <div className="module-stats">
          <div>
            <span>{t("inv.fixtureUnits")}</span>
            <strong>{rows.reduce((sum, row) => sum + row.quantity, 0)}</strong>
          </div>
          <div>
            <span>{t("inv.categories")}</span>
            <strong>{categories.length}</strong>
          </div>
          <div>
            <span>{t("inv.receivingDrafts")}</span>
            <strong>{drafts.length}</strong>
          </div>
        </div>
      </details>
      <div className="module-tabs">
        {(
          [
            ["inventory", t("inv.tabInventory")],
            ["categories", t("inv.tabCategories")],
            ["movements", t("inv.tabMovements")],
          ] as const
        ).map(([value, label]) => (
          <Button
            variant="ghost"
            key={value}
            className={view === value ? "tab-active" : ""}
            onClick={() => setView(value)}
          >
            {label}
          </Button>
        ))}
      </div>
      <div className="table-toolbar">
        <label className="search-field">
          <Search size={17} />
          <input
            aria-label={t("inv.searchAccessories")}
            placeholder={t("inv.searchAccessoriesPlaceholder")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <div className="table-filters">
          <select
            aria-label={t("inv.accessoryCategory")}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="All">{t("inv.allCategories")}</option>
            {categories.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
          <Button variant="outline" onClick={() => setOpen(true)}>
            <Plus />
            {t("inv.newSkuDraft")}
          </Button>
        </div>
      </div>
      {view === "movements" ? (
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t("shared.reference")}</th>
                <th>{t("inv.fSku")}</th>
                <th>{t("inv.colMovement")}</th>
                <th>{t("shared.store")}</th>
              </tr>
            </thead>
            <tbody>
              {ws.movements
                .filter(
                  (m) =>
                    (scope === "ALL" || m.store === scope) &&
                    [
                      m.name,
                      m.sku,
                      m.reference,
                      ...(reviewActor()?.role === "SUPER_ADMIN"
                        ? [ownerSupplierName(m.supplierId) ?? ""]
                        : []),
                    ]
                      .join(" ")
                      .toLowerCase()
                      .includes(query.toLowerCase()),
                )
                .map((m) => (
                  <tr key={m.id}>
                    <td>
                      <bdi>{m.reference}</bdi>
                      <small>{m.at}</small>
                    </td>
                    <td>
                      {m.name}
                      <small>{m.sku}</small>
                    </td>
                    <td>
                      <bdi>
                        {m.quantity > 0 ? "+" : ""}
                        {m.quantity}
                      </bdi>
                      <small>{localizeMessage(lang, m.reason)}</small>
                    </td>
                    <td>{storeLabel(m.store)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
          {!ws.movements.length && (
            <div className="empty-state">
              <History />
              <h3>{t("doc.historyEmpty")}</h3>
            </div>
          )}
        </div>
      ) : (
        <div className="table-scroll">
          <table className="data-table inventory-table">
            <thead>
              <tr>
                <th>{t("inv.colSku")}</th>
                <th>{t("inv.colVariant")}</th>
                <th>{t("inv.colBarcode")}</th>
                <th>{t("shared.store")}</th>
                <th>{view === "inventory" ? t("inv.colQuantity") : t("inv.colState")}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={row.id}>
                  <td>
                    <strong>{row.name}</strong>
                    <small>{row.category}</small>
                  </td>
                  <td>{row.draft?.variant ?? row.detail}</td>
                  <td className="ltr">{row.code}</td>
                  <td>{storeLabel(row.store)}</td>
                  <td>
                    {view === "inventory" ? (
                      <>
                        {row.quantity}
                        {testAccessoryAlert(row.id, ws) && (
                          <strong role="status" className="block text-destructive">
                            {intakeText(lang, "lowStock")}
                          </strong>
                        )}
                      </>
                    ) : (
                      <Status status={row.status} />
                    )}
                  </td>
                  <td>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={t("shared.openRecord", { id: row.id })}
                      onClick={() => setSelected(row)}
                    >
                      <ArrowUpRight />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!filtered.length && (
            <div className="empty-state">
              <Search />
              <h3>{t("inv.noAccessories")}</h3>
            </div>
          )}
        </div>
      )}
      <div className="table-bottom">
        <span>
          {filtered.length} {t("inv.demoSkus")}
        </span>
      </div>
      {notice && (
        <p className="session-notice" role="status">
          {notice}
        </p>
      )}
      <OperationDialog
        open={open}
        onClose={() => setOpen(false)}
        title={t("inv.receivingDraftTitle")}
      >
        <label className="form-label">
          {t("inv.receivingProduct")}
          <select
            aria-label={t("inv.receivingProduct")}
            value={receivingSku}
            onChange={(e) => setReceivingSku(e.target.value)}
          >
            <option value="">{t("inv.newSkuDraft")}</option>
            {ws.accessories
              .filter((row) => scope === "ALL" || row.store === scope)
              .map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name} · {row.code}
                </option>
              ))}
          </select>
        </label>
        <OperationDraftForm
          key={receivingSku}
          title={t("inv.receiving")}
          optionalFields={["sku", "category", "variant", "compatibility", "reference", "remarks"]}
          onFieldChange={(name, value) => {
            if (name === "barcode") {
              const match = ws.accessories.find(
                (row) => row.code === value.trim() && (scope === "ALL" || row.store === scope),
              );
              if (match) setReceivingSku(match.id);
            }
          }}
          onScan={(assigned) => {
            const match = ws.accessories.find(
              (row) => row.code === assigned.barcode && (scope === "ALL" || row.store === scope),
            );
            if (match) setReceivingSku(match.id);
          }}
          submitLabel={t("retail.receive")}
          children={<IntakeSupplier />}
          fields={receivingFields}
          schema={accessoryDraftSchema}
          defaults={receivingDefaults}
          onCancel={() => setOpen(false)}
          onSave={(value) => {
            const res = receiveTestAccessory(value, { receivingKey });
            setOpen(false);
            setReceivingKey(crypto.randomUUID());
            setReceivingSku("");
            setSelected(getTestState().accessories.find((a) => a.id === res.sku) ?? null);
            setView("inventory");
            setQuery("");
            setCategory("All");
            setNotice(
              t("tw.received", { qty: value.quantity, sku: res.sku, balance: String(res.balance) }),
            );
          }}
        />
      </OperationDialog>
      <OperationDialog
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected?.name ?? t("inv.accessorySku")}
      >
        {selected && (
          <>
            <dl className="detail-list">
              <dt>{t("inv.skuCategory")}</dt>
              <dd>
                {selected.draft?.sku ?? selected.id} · {selected.category}
              </dd>
              <dt>{t("inv.variant")}</dt>
              <dd>{selected.draft?.variant ?? selected.detail}</dd>
              <dt>{t("inv.compatibility")}</dt>
              <dd>{selected.draft?.compatibility ?? selected.detail}</dd>
              <dt>{t("shared.store")}</dt>
              <dd>{storeLabel(selected.store)}</dd>
              <dt>{t("inv.quantity")}</dt>
              <dd>{selected.quantity}</dd>
            </dl>
            {ws.accessories.some((a) => a.id === selected.id) && (
              <DemoAccessoryExtras key={selected.id} sku={selected.id} />
            )}
            <details className="retail-details">
              <summary>{t("retail.technical")}</summary>
              <dl className="detail-list">
                <dt>{t("shared.reference")}</dt>
                <dd>
                  <bdi>{selected.id}</bdi>
                </dd>
              </dl>
            </details>
            <BarcodeLabel
              value={selected.code ?? selected.id}
              name={selected.name}
              store={selected.store}
              sizeMm={testSettings()["labels.sizeMm"]}
            />
            <h3 className="operation-section-title">
              <History size={16} />
              {t("inv.stockHistory")}
            </h3>
            <ul className="operation-history">
              {ws.movements
                .filter((m) => m.sku === selected.id)
                .map((m) => (
                  <li key={m.id}>
                    <bdi>
                      {m.quantity > 0 ? "+" : ""}
                      {m.quantity} · {m.reference}
                    </bdi>
                    <small>
                      {localizeMessage(lang, m.reason)} · {m.at}
                    </small>
                  </li>
                ))}
            </ul>
            {reviewActor()?.role === "SUPER_ADMIN" && (
              <>
                <h3>{t("prov.history")}</h3>
                <p className="field-hint">{t("prov.allocation")}</p>
                {ownerReceiptHistory(selected.id).length === 0 && <p>{t("prov.missing")}</p>}
                {ownerReceiptHistory(selected.id).map((m) => (
                  <div key={m.id}>
                    <strong>
                      {m.quantity} · {storeLabel(m.store)}
                    </strong>
                    <OwnerProvenance
                      kind="receipt"
                      id={m.id}
                      supplierId={m.supplierId}
                      reference={m.draft?.reference}
                      at={m.at}
                      operator={m.receivedBy}
                    />
                  </div>
                ))}
              </>
            )}
            <AccessoryTools
              sku={selected.id}
              store={selected.store}
              price={selected.amount ?? ""}
              onSaved={() => setSelected(null)}
            />
          </>
        )}
      </OperationDialog>
    </div>
  );
}

function AccessoryTools({
  sku,
  store,
  price,
  onSaved,
}: {
  sku: string;
  store: import("@/domain/erp").StoreId;
  price: string;
  onSaved: () => void;
}) {
  const { t, lang } = useErp();
  const [error, setError] = useState("");
  return (
    <>
      <form
        className="draft-form"
        onSubmit={(e) => {
          e.preventDefault();
          try {
            setTestAccessoryPrice(sku, String(new FormData(e.currentTarget).get("price")));
            onSaved();
          } catch (err) {
            setError(localizeMessage(lang, err instanceof Error ? err.message : String(err)));
          }
        }}
      >
        <label>
          {t("doc.price")} (DZD)
          <input
            name="price"
            defaultValue={price}
            dir="ltr"
            inputMode="decimal"
            aria-label={t("tw.setPrice")}
          />
        </label>
        <Button type="submit">{t("tw.confirm")}</Button>
      </form>
      <form
        className="draft-form"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          try {
            adjustTestAccessory(sku, store, String(f.get("quantity")), String(f.get("reference")));
            onSaved();
          } catch (err) {
            setError(localizeMessage(lang, err instanceof Error ? err.message : String(err)));
          }
        }}
      >
        <h3>{t("doc.adjustment")}</h3>
        <label>
          {t("doc.adjustQty")}
          <input name="quantity" dir="ltr" aria-label={t("doc.adjustQty")} />
        </label>
        <label>
          {t("doc.adjustReason")}
          <input name="reference" aria-label={t("doc.adjustReason")} />
        </label>
        <p className="field-hint">{t("doc.adjustBlocked")}</p>
        <Button type="submit">{t("doc.adjustSave")}</Button>
      </form>
      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}
    </>
  );
}

/** Demo accessory extras: owner category list, optional photo (camera or file), low-stock threshold. */
function DemoAccessoryExtras({ sku }: { sku: string }) {
  const { lang } = useErp();
  const ws = useTestWorkspace();
  const meta = ws.accessoryMeta?.[sku] ?? {};
  const [category, setCategory] = useState(meta.category ?? "");
  const [threshold, setThreshold] = useState(
    meta.lowStockThreshold === undefined ? "" : String(meta.lowStockThreshold),
  );
  const [photo, setPhoto] = useState(meta.photo ?? "");
  const [error, setError] = useState("");
  const x = (k: Parameters<typeof intakeText>[1]) => intakeText(lang, k);
  return (
    <form
      className="draft-form"
      onSubmit={(e) => {
        e.preventDefault();
        try {
          saveTestAccessoryMeta(sku, {
            ...(category ? { category } : {}),
            ...(photo ? { photo } : {}),
            ...(threshold.trim() ? { lowStockThreshold: Number(threshold) } : {}),
          });
          setError("");
        } catch (err) {
          setError(err instanceof Error ? err.message : "!");
        }
      }}
    >
      <label className="form-label">
        {x("category")}
        <select value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">—</option>
          {testSettings(ws)["intake.accessoryCategories"].map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </label>
      <label className="form-label">
        {x("threshold")}
        <Input
          type="number"
          min={0}
          step={1}
          value={threshold}
          onChange={(e) => setThreshold(e.target.value)}
        />
      </label>
      <label className="form-label">
        {x("photo")}
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          capture="environment"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = () => setPhoto(String(reader.result));
            reader.readAsDataURL(file);
          }}
        />
      </label>
      {photo && <img src={photo} alt={x("photo")} className="max-h-32 w-auto" />}
      {error && <p role="alert">{error}</p>}
      <Button size="lg" type="submit">
        {x("save")}
      </Button>
    </form>
  );
}
