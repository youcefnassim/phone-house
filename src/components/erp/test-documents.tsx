import { OfficialSaleDocumentDialog } from "./official-sale-documents";
import { localSaleReceipt } from "@/domain/local-sale-receipt";
import { testSettings } from "@/data/test-workspace";
import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { Printer, FileText, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { testDocument, testBuyerSchema } from "@/domain/test-documents";
import { useTestWorkspace, nameTestSale, type TestSale } from "@/data/test-workspace";
import { formatMoney, storeLabel } from "@/domain/erp";
import { displayText } from "@/locales/display";
import { localizeMessage } from "@/locales/messages";
import { useErp } from "./context";
import { OperationDialog } from "./operation-ui";

function DocumentSheet({
  sale,
  kind,
  itemId,
}: {
  sale: TestSale;
  kind: "invoice" | "warranty";
  itemId: string;
}) {
  const { t, lang } = useErp();
  const doc = testDocument(sale, kind, itemId);
  return (
    <article
      className={`test-document test-document-${kind}`}
      dir={lang === "ar-DZ" ? "rtl" : "ltr"}
      data-testid="document-sheet"
    >
      <header className="document-brand">
        <div>
          <strong>Phone House</strong>
          <small>MAGHNIA</small>
        </div>
        <div>
          <span>{t(kind === "invoice" ? "doc.invoice" : "doc.warranty")}</span>
          <small>{storeLabel(doc.store)}</small>
        </div>
      </header>
      <div className="document-specimen">{t("doc.specimen")}</div>
      <div className="document-parties">
        <section>
          <h3>{t("doc.buyer")}</h3>
          <strong>
            {doc.buyer
              ? `${doc.buyer.surname} ${doc.buyer.givenName}`
              : sale.customerId === "WALK-IN"
                ? t("pos.walkIn")
                : t("doc.customerPending")}
          </strong>
          {doc.buyer?.contact && (
            <p>
              <bdi>{doc.buyer.contact}</bdi>
            </p>
          )}
        </section>
        <dl>
          <dt>{t("doc.reference")}</dt>
          <dd>
            <bdi>{doc.reference}</bdi>
          </dd>
          <dt>{t("doc.date")}</dt>
          <dd>
            <bdi>
              {new Intl.DateTimeFormat(lang, {
                dateStyle: "medium",
                timeStyle: "short",
                timeZone: "Africa/Algiers",
              }).format(new Date(doc.at))}
            </bdi>
          </dd>
          <dt>{t("doc.seller")}</dt>
          <dd>{displayText(lang, doc.seller)}</dd>
        </dl>
      </div>
      {kind === "invoice" ? (
        <>
          <table className="document-table">
            <thead>
              <tr>
                <th>{t("doc.model")}</th>
                <th>{t("doc.qty")}</th>
                <th>{t("doc.unit")}</th>
                <th>{t("doc.total")}</th>
              </tr>
            </thead>
            <tbody>
              {doc.lines.map((line) => (
                <tr key={line.id}>
                  <td>
                    <strong>{line.name}</strong>
                    <small>{line.detail}</small>
                    {line.imei && (
                      <small>
                        <bdi>IMEI1 {line.imei}</bdi>
                      </small>
                    )}
                    {line.imei2 && (
                      <small>
                        <bdi>IMEI2 {line.imei2}</bdi>
                      </small>
                    )}
                    {line.serial && (
                      <small>
                        <bdi>{line.serial}</bdi>
                      </small>
                    )}
                    <small>
                      <bdi>{line.barcode}</bdi>
                    </small>
                  </td>
                  <td>
                    <bdi>{line.quantity}</bdi>
                  </td>
                  <td>
                    <bdi>{formatMoney(line.unitPrice)}</bdi>
                  </td>
                  <td>
                    <bdi>{formatMoney(line.lineTotal)}</bdi>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="document-total">
            <span>{t("doc.total")}</span>
            <strong>
              <bdi>{formatMoney(doc.total)}</bdi>
            </strong>
          </div>
          <section className="document-payment">
            <h3>
              {t("doc.payment")} · {localizeMessage(lang, doc.tender)}
            </h3>
            <p>{t("doc.localPaid")}</p>
          </section>
        </>
      ) : (
        <>
          <h2>{t("doc.item")}</h2>
          {doc.lines.map((line) => (
            <section className="warranty-item" key={line.id}>
              <strong>{line.name}</strong>
              <p>{line.detail}</p>
              <dl>
                <dt>{t("doc.reference")}</dt>
                <dd>
                  <bdi>{doc.reference}</bdi>
                </dd>
                {line.imei && (
                  <>
                    <dt>IMEI1</dt>
                    <dd>
                      <bdi>{line.imei}</bdi>
                    </dd>
                  </>
                )}
                {line.imei2 && (
                  <>
                    <dt>IMEI2</dt>
                    <dd>
                      <bdi>{line.imei2}</bdi>
                    </dd>
                  </>
                )}
                <dt>SKU / Barcode</dt>
                <dd>
                  <bdi>{line.barcode || line.id}</bdi>
                </dd>
              </dl>
            </section>
          ))}
          <section className="warranty-terms">
            <h2>{t("doc.terms")}</h2>
            <p>{t("doc.noTerms")}</p>
            {sale.warranties
              ?.filter((w) => w.itemId === itemId && w.requested)
              .map((w) => (
                <dl className="detail-list" key={w.itemId}>
                  <dt>{t("sale.pending")}</dt>
                  <dd>
                    {w.duration}
                    {w.months !== undefined ? ` ${t("sale.months")}` : ""} · {w.start} → {w.end}
                  </dd>
                </dl>
              ))}
          </section>
        </>
      )}
      <footer>
        <strong>{t("doc.specimen")}</strong>
        <p>{t("doc.pending")}</p>
      </footer>
    </article>
  );
}

export function TestDocumentDialog({ saleId, onClose }: { saleId: string; onClose: () => void }) {
  const { t } = useErp();
  const ws = useTestWorkspace();
  const sale = ws.sales.find((s) => s.id === saleId);
  const [kind, setKind] = useState<"invoice" | "warranty">("invoice");
  const [itemId, setItemId] = useState("");
  const [error, setError] = useState("");
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  const eligible =
    sale?.lines.filter(
      (l) => l.kind === "phone" && sale.warranties?.some((w) => w.itemId === l.id && w.requested),
    ) ?? [];
  const selectedItem = itemId || eligible[0]?.id || "";
  if (!sale) return null;
  if (sale.publicRef)
    return (
      <OfficialSaleDocumentDialog
        receipt={localSaleReceipt(sale)}
        settings={testSettings(ws)}
        onClose={onClose}
      />
    );
  return (
    <>
      <OperationDialog open={!!saleId} onClose={onClose} title={t("doc.invoice")}>
        {!sale.buyer && !sale.requestFingerprint && (
          <form
            className="draft-form"
            onSubmit={(e) => {
              e.preventDefault();
              const buyer = testBuyerSchema.safeParse(
                Object.fromEntries(new FormData(e.currentTarget)),
              );
              if (!buyer.success) {
                setError(t("doc.namesRequired"));
                return;
              }
              nameTestSale(sale.id, buyer.data);
              setError("");
            }}
          >
            <div className="operation-form-grid">
              <label>
                {t("doc.surname")}
                <input name="surname" aria-label={t("doc.surname")} />
              </label>
              <label>
                {t("doc.given")}
                <input name="givenName" aria-label={t("doc.given")} />
              </label>
              <label>
                {t("doc.contact")}
                <input name="contact" aria-label={t("doc.contact")} />
              </label>
            </div>
            {error && (
              <p role="alert" className="error-text">
                {error}
              </p>
            )}
            <Button type="submit">{t("doc.prepare")}</Button>
          </form>
        )}
        <div className="document-controls">
          <Button
            variant={kind === "invoice" ? "secondary" : "outline"}
            aria-pressed={kind === "invoice"}
            onClick={() => setKind("invoice")}
          >
            <FileText />
            {t("doc.invoiceTab")}
          </Button>
          <Button
            disabled={!eligible.length}
            variant={kind === "warranty" ? "secondary" : "outline"}
            aria-pressed={kind === "warranty"}
            onClick={() => setKind("warranty")}
          >
            <ShieldCheck />
            {t("doc.warrantyTab")}
          </Button>
          {kind === "warranty" && (
            <select
              aria-label={t("doc.item")}
              value={selectedItem}
              onChange={(e) => setItemId(e.target.value)}
            >
              {eligible.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name} · {l.imei || l.barcode || l.id}
                </option>
              ))}
            </select>
          )}
          <Button
            variant="outline"
            onClick={() => {
              document.body.classList.add("printing-test-document");
              try {
                window.print();
              } finally {
                document.body.classList.remove("printing-test-document");
              }
            }}
          >
            <Printer />
            {t("doc.print")}
          </Button>
        </div>
        <dl className="detail-list">
          <dt>{t("doc.payment")}</dt>
          <dd>
            {sale.tender === "Cash" ? t("pos.cash") : t("pos.bank")} · {formatMoney(sale.total)}
          </dd>
          <dt>{t("pos.enteredAmount")}</dt>
          <dd>{formatMoney(sale.paid)}</dd>
          <dt>{t("pos.changePreview")}</dt>
          <dd>{formatMoney(sale.change)}</dd>
          <dt>{t("pos.cash")}</dt>
          <dd>{formatMoney(sale.tender === "Cash" ? sale.total : "0")}</dd>
          <dt>{t("pos.customer")}</dt>
          <dd>{sale.buyer ? `${sale.buyer.surname} ${sale.buyer.givenName}` : t("pos.walkIn")}</dd>
        </dl>
        <details className="retail-details">
          <summary>{t("retail.details")}</summary>
          <p className="field-hint">{t("doc.pdf")}</p>
        </details>
        <div className="document-screen">
          <DocumentSheet sale={sale} kind={kind} itemId={selectedItem} />
        </div>
        <Button variant="outline" onClick={onClose}>
          {t("doc.close")}
        </Button>
      </OperationDialog>
      {mounted &&
        createPortal(
          <div className="test-document-print-root">
            <DocumentSheet sale={sale} kind={kind} itemId={selectedItem} />
          </div>,
          document.body,
        )}
    </>
  );
}

export function TestSaleDocuments({
  activeSaleId = "",
  onClose,
}: {
  activeSaleId?: string;
  onClose: () => void;
}) {
  const { scope, t, lang } = useErp();
  const ws = useTestWorkspace();
  const [selected, setSelected] = useState("");
  const [search, setSearch] = useState("");
  const id = activeSaleId || selected;
  const sales = ws.sales.filter(
    (s) =>
      (scope === "ALL" || s.store === scope) &&
      [
        s.id,
        s.customer,
        s.buyer?.surname,
        s.buyer?.givenName,
        ...s.lines.map((l) => `${l.name} ${l.imei || ""} ${l.imei2 || ""}`),
      ]
        .join(" ")
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  return (
    <section className="test-sale-documents">
      <h2>{t("doc.history")}</h2>
      <label className="search-field">
        <input
          value={search}
          aria-label={t("doc.history")}
          placeholder={t("doc.history")}
          onChange={(e) => setSearch(e.target.value)}
        />
      </label>
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>{t("doc.reference")}</th>
              <th>{t("doc.buyer")}</th>
              <th>{t("shared.store")}</th>
              <th>{t("doc.total")}</th>
              <th>{t("doc.invoice")}</th>
            </tr>
          </thead>
          <tbody>
            {sales.map((s) => (
              <tr key={s.id}>
                <td>
                  <bdi>{s.id}</bdi>
                  <small>{s.lines.map((l) => l.name).join(", ")}</small>
                </td>
                <td>
                  {s.buyer
                    ? `${s.buyer.surname} ${s.buyer.givenName}`
                    : displayText(lang, s.customer)}
                </td>
                <td>{storeLabel(s.store)}</td>
                <td>
                  <bdi>{formatMoney(s.total)}</bdi>
                </td>
                <td>
                  <Button
                    variant="outline"
                    aria-label={t("doc.reopen", { id: s.id })}
                    onClick={() => setSelected(s.id)}
                  >
                    <FileText />
                    {t("retail.viewInvoice")}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!sales.length && <p className="field-hint">{t("doc.noSale")}</p>}
      {id && (
        <TestDocumentDialog
          key={id}
          saleId={id}
          onClose={() => {
            setSelected("");
            onClose();
          }}
        />
      )}
    </section>
  );
}
