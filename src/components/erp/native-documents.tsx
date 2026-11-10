import { OfficialSaleDocumentDialog } from "./official-sale-documents";
import { resolveSettings, type AppSettings } from "@/domain/intake";
import { useDailyNative } from "./use-daily-native";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { FileText, Printer, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { NativeReceipt } from "@/domain/native-documents";
import { projectNativeSpecimens } from "@/domain/daily-specimens";
import { storeLabel } from "@/domain/erp";
import { useErp } from "./context";
import { OperationDialog } from "./operation-ui";

const money = (minor: number) =>
  `${Math.floor(minor / 100)}.${String(minor % 100).padStart(2, "0")} DZD`;
/** Strict native receipt presentation. Never reads IndexedDB, creates a buyer,
 * allocates accessory lots, updates a record or invents fiscal/legal fields. */
function NativeSheet({ receipt, itemId }: { receipt: NativeReceipt; itemId: string }) {
  const { t, lang } = useErp();
  const specimens = projectNativeSpecimens(receipt);
  const warranty = specimens.warranties.find((w) => w.phone.itemId === itemId);
  const lines = warranty ? [warranty.phone] : receipt.lines;
  return (
    <article
      className={`test-document test-document-${warranty ? "warranty" : "invoice"}`}
      dir={lang === "ar-DZ" ? "rtl" : "ltr"}
      data-testid="native-document-sheet"
    >
      <header className="document-brand">
        <div>
          <strong>Phone House</strong>
          <small>MAGHNIA</small>
        </div>
        <div>
          <span>{t(warranty ? "doc.warranty" : "doc.invoice")}</span>
          <small>{storeLabel(receipt.store)}</small>
        </div>
      </header>
      <div className="document-specimen">{t("doc.specimen")}</div>
      <div className="document-parties">
        <section>
          <h3>{t("doc.buyer")}</h3>
          <strong>
            {receipt.buyer
              ? `${receipt.buyer.surname ?? ""} ${receipt.buyer.givenName ?? ""}`.trim() ||
                receipt.buyer.name
              : t("pos.walkIn")}
          </strong>
          {receipt.buyer?.contact && (
            <p>
              <bdi>{receipt.buyer.contact}</bdi>
            </p>
          )}
        </section>
        <dl>
          <dt>{t("doc.reference")}</dt>
          <dd>
            <bdi>{receipt.saleId}</bdi>
          </dd>
          <dt>{t("doc.date")}</dt>
          <dd>
            {new Intl.DateTimeFormat(lang, {
              dateStyle: "medium",
              timeStyle: "short",
              timeZone: "Africa/Algiers",
            }).format(new Date(receipt.soldAt))}
          </dd>
          <dt>{t("doc.seller")}</dt>
          <dd>
            <bdi>{receipt.operator}</bdi>
          </dd>
        </dl>
      </div>
      <table className="document-table">
        <thead>
          <tr>
            <th>{t("doc.model")}</th>
            <th>{t("doc.qty")}</th>
            {!warranty && (
              <>
                <th>{t("doc.unit")}</th>
                <th>{t("doc.total")}</th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => (
            <tr key={line.itemId}>
              <td>
                <strong>{line.name}</strong>
                <small>
                  <bdi>{line.reference}</bdi>
                </small>
                {[line.imei1, line.imei2, line.serial, line.barcode]
                  .filter(Boolean)
                  .map((identity, index) => (
                    <small key={index}>
                      <bdi>{identity}</bdi>
                    </small>
                  ))}
              </td>
              <td>{line.quantity}</td>
              {!warranty && (
                <>
                  <td>
                    <bdi>{money(line.unitMinor)}</bdi>
                  </td>
                  <td>
                    <bdi>{money(line.unitMinor * line.quantity)}</bdi>
                  </td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {warranty ? (
        <section className="warranty-terms">
          <h2>{t("doc.terms")}</h2>
          <p>{t("doc.noTerms")}</p>
          <p>
            {t("sale.pending")} · {warranty.months} {t("sale.months")} ·{" "}
            <bdi>
              {warranty.start} → {warranty.end}
            </bdi>
          </p>
        </section>
      ) : (
        <>
          <div className="document-total">
            <span>{t("doc.total")}</span>
            <strong>
              <bdi>{money(receipt.totalMinor)}</bdi>
            </strong>
          </div>
          <section className="document-payment">
            <h3>
              {t("doc.payment")} · {t(receipt.payment === "Cash" ? "pos.cash" : "pos.bank")}
            </h3>
            {receipt.bankReference && (
              <p>
                <bdi>{receipt.bankReference}</bdi>
              </p>
            )}
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

export function NativeDocumentDialog({
  receipt,
  onClose,
  settings: suppliedSettings,
}: {
  settings?: AppSettings;
  receipt: NativeReceipt;
  onClose: () => void;
}) {
  const { t } = useErp();
  const { controller } = useDailyNative(receipt.store);
  const [settings, setSettings] = useState<AppSettings>(
    () => suppliedSettings ?? resolveSettings({}),
  );
  useEffect(() => {
    if (suppliedSettings) {
      setSettings(suppliedSettings);
      return;
    }
    let active = true;
    void controller
      .settings()
      .then((s) => {
        if (active) setSettings(s);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [controller, suppliedSettings]);
  const specimens = projectNativeSpecimens(receipt);
  const [itemId, setItemId] = useState("");
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  if (receipt.publicRef)
    return <OfficialSaleDocumentDialog receipt={receipt} settings={settings} onClose={onClose} />;
  return (
    <>
      <OperationDialog open onClose={onClose} title={t("doc.invoice")}>
        <div className="document-controls">
          <Button
            variant={itemId ? "outline" : "secondary"}
            onClick={() => setItemId("")}
            aria-pressed={!itemId}
          >
            <FileText />
            {t("doc.invoiceTab")}
          </Button>
          <Button
            variant={itemId ? "secondary" : "outline"}
            disabled={!specimens.warranties.length}
            onClick={() => setItemId(specimens.warranties[0]?.phone.itemId ?? "")}
            aria-pressed={!!itemId}
          >
            <ShieldCheck />
            {t("doc.warrantyTab")}
          </Button>
          {!!itemId && (
            <select
              aria-label={t("doc.item")}
              value={itemId}
              onChange={(e) => setItemId(e.target.value)}
            >
              {specimens.warranties.map((w) => (
                <option key={w.phone.itemId} value={w.phone.itemId}>
                  {w.phone.name} · {w.phone.imei1 || w.phone.serial}
                </option>
              ))}
            </select>
          )}
          <Button
            variant="outline"
            disabled={!mounted}
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
        <div className="document-screen">
          <NativeSheet receipt={receipt} itemId={itemId} />
        </div>
        <Button variant="outline" onClick={onClose}>
          {t("doc.close")}
        </Button>
      </OperationDialog>
      {mounted &&
        createPortal(
          <div className="test-document-print-root">
            <NativeSheet receipt={receipt} itemId={itemId} />
          </div>,
          document.body,
        )}
    </>
  );
}
