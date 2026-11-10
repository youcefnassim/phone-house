import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { NativeReceipt } from "@/domain/native-documents";
import type { AppSettings } from "@/domain/intake";
import { officialPrintGate } from "@/domain/warranty-documents";
import { documentText } from "@/locales/warranty-documents";
import { useErp } from "./context";
import { OperationDialog } from "./operation-ui";

const money = (n: number) => `${Math.floor(n / 100)}.${String(n % 100).padStart(2, "0")} DZD`;
function SalePages({
  receipt,
  settings,
  ticket,
}: {
  receipt: NativeReceipt;
  settings: AppSettings;
  ticket: boolean;
}) {
  const [qr, setQr] = useState("");
  useEffect(() => {
    let active = true;
    if (receipt.publicRef)
      void import("qrcode")
        .then((q) => q.toDataURL(receipt.publicRef ?? "", { margin: 1, width: 100 }))
        .then((v) => {
          if (active) setQr(v);
        });
    return () => {
      active = false;
    };
  }, [receipt.publicRef]);
  const invoiceRef =
    settings["documents.invoiceNumbering"] === "PUBLIC_REF"
      ? receipt.publicRef
      : receipt.invoiceNumber;
  const phones = receipt.lines.filter((l) => l.kind === "phone");
  return (
    <>
      {(ticket ? [null] : phones).map((phone) => {
        const warranty = phone
          ? receipt.warranties.find((w) => w.itemId === phone.itemId && w.requested)
          : undefined;
        const lines = phone ? [phone] : receipt.lines;
        return (
          <article
            key={phone?.itemId ?? "ticket"}
            className={`test-document official-sale-sheet ${ticket ? "official-thermal" : ""}`}
            data-testid="official-sale-sheet"
            dir="ltr"
          >
            <header className="document-brand">
              <div>
                <strong>{settings["company.legalName"]}</strong>
                <small>{settings["company.legalForm"]}</small>
                <small>{settings["company.storeAddress"][receipt.store]}</small>
              </div>
              <div>
                <strong>{ticket ? "Ticket / وصل" : "Facture / فاتورة"}</strong>
                <bdi>{ticket ? receipt.publicRef : invoiceRef}</bdi>
              </div>
            </header>
            {!ticket && (
              <p className="official-legal-identifiers">
                RC: {settings["company.rc"]} · NIF: {settings["company.nif"]} · NIS:{" "}
                {settings["company.nis"]} · AI: {settings["company.ai"]}
              </p>
            )}
            <div className="document-parties">
              <section>
                <h3>Client / الزبون</h3>
                <strong>{receipt.buyer?.name}</strong>
                <p>{receipt.buyer?.contact}</p>
              </section>
              <section>
                <p>
                  {new Intl.DateTimeFormat("fr-DZ", {
                    dateStyle: "short",
                    timeZone: "Africa/Algiers",
                  }).format(receipt.soldAt)}
                </p>
                <bdi>{receipt.publicRef}</bdi>
                {qr && <img className="sale-reference-qr" src={qr} alt={receipt.publicRef ?? ""} />}
              </section>
            </div>
            <table className="document-table">
              <thead>
                <tr>
                  <th>Produit / المنتج</th>
                  <th>Qté / كمية</th>
                  <th>Prix / السعر</th>
                  <th>Total / المجموع</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.itemId}>
                    <td>
                      <strong>{l.name}</strong>
                      {[l.imei1, l.imei2, l.serial, l.barcode].filter(Boolean).map((v, i) => (
                        <small key={i}>
                          <bdi>{v}</bdi>
                        </small>
                      ))}
                    </td>
                    <td>{l.quantity}</td>
                    <td>{money(l.unitMinor)}</td>
                    <td>{money(l.unitMinor * l.quantity)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!!receipt.creditMinor && (
              <p>
                Crédit / الدين · {money(receipt.creditMinor)} · {receipt.dueDate}
              </p>
            )}
            {!!receipt.discountMinor && <p>Remise / التخفيض · {money(receipt.discountMinor)}</p>}
            <div className="document-total">
              <span>Total / المجموع</span>
              <strong>
                {money(phone ? phone.unitMinor * phone.quantity : receipt.totalMinor)}
              </strong>
            </div>
            <p>
              {receipt.payment === "Cash"
                ? "Espèces / نقداً"
                : receipt.payment === "Split"
                  ? "Espèces + Banque / نقد + بنك"
                  : "Banque / البنك"}
              {receipt.bankReference ? ` · ${receipt.bankReference}` : ""}
            </p>
            {receipt.cashMinor !== undefined && (
              <p>
                Espèces / نقد · {money(receipt.cashMinor)} · Banque / بنك ·{" "}
                {money(receipt.bankMinor ?? 0)}{" "}
                {receipt.bankMethod === "VIREMENT"
                  ? "Virement"
                  : receipt.bankMethod === "CCP_BARIDIMOB"
                    ? "CCP / BaridiMob"
                    : ""}
              </p>
            )}
            {!ticket && warranty && (
              <section className="warranty-terms">
                <h2>Garantie / الضمان</h2>
                <bdi>{receipt.publicRef}</bdi>
                <p>
                  {phone?.name} · {phone?.imei1 ?? phone?.serial}
                </p>
                {warranty.provider === "MANUFACTURER" ? (
                  <p>
                    Garantie constructeur {warranty.months} mois / ضمان الشركة المصنعة{" "}
                    {warranty.months} شهر
                  </p>
                ) : (
                  <>
                    <p className="official-conditions">{settings["warranty.conditions"].fr}</p>
                    <p className="official-conditions" dir="rtl">
                      {settings["warranty.conditions"].ar}
                    </p>
                    <p>
                      {warranty.months} mois / شهر · {warranty.start} → {warranty.end}
                    </p>
                  </>
                )}
              </section>
            )}
            {!ticket && (
              <footer className="official-signatures">
                <div>Cachet / الختم</div>
                <div>Signature / التوقيع</div>
              </footer>
            )}
          </article>
        );
      })}
    </>
  );
}
export function OfficialSaleDocumentDialog({
  receipt,
  settings,
  onClose,
}: {
  receipt: NativeReceipt;
  settings: AppSettings;
  onClose: () => void;
}) {
  const { t, lang } = useErp();
  const x = documentText[lang];
  const [ticket, setTicket] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  const hasPhone = receipt.lines.some((l) => l.kind === "phone");
  const gate = officialPrintGate(
    settings,
    receipt.store,
    receipt.warranties.some((w) => w.requested && (w.provider ?? "SHOP") === "SHOP"),
  );
  const numbered = !!receipt.publicRef && !!receipt.invoiceNumber;
  const print = () => {
    setAttempted(true);
    if (!hasPhone || !numbered || (!ticket && !gate.ready)) return;
    document.body.classList.add("printing-test-document");
    try {
      window.print();
    } finally {
      document.body.classList.remove("printing-test-document");
    }
  };
  return (
    <>
      <OperationDialog open onClose={onClose} title={x.section}>
        <div className="document-controls">
          <Button variant={ticket ? "outline" : "secondary"} onClick={() => setTicket(false)}>
            Facture / فاتورة
          </Button>
          {hasPhone && (
            <Button variant={ticket ? "secondary" : "outline"} onClick={() => setTicket(true)}>
              {x.ticket}
            </Button>
          )}
          <Button variant="outline" disabled={!mounted || !hasPhone} onClick={print}>
            <Printer />
            {t("doc.print")}
          </Button>
        </div>
        {attempted && !ticket && !gate.ready && (
          <div role="alert">
            <h3>{x.configure}</h3>
            <ul>
              {gate.missing.map((c) => (
                <li key={c.key}>{c.label}</li>
              ))}
            </ul>
          </div>
        )}
        {attempted && !numbered && <p role="alert">{x.configure} · Référence / المرجع</p>}
        <div className="document-screen">
          <SalePages receipt={receipt} settings={settings} ticket={ticket} />
        </div>
        <Button variant="outline" onClick={onClose}>
          {t("doc.close")}
        </Button>
      </OperationDialog>
      {mounted &&
        createPortal(
          <div className="test-document-print-root">
            <SalePages receipt={receipt} settings={settings} ticket={ticket} />
          </div>,
          document.body,
        )}
    </>
  );
}
