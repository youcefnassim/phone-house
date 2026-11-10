import { formatMoney, cartTotal, storeLabel, type CartLine, type StoreId } from "@/domain/erp";
import { Button } from "@/components/ui/button";
import { LockKeyhole } from "lucide-react";
import { useErp } from "./context";
import { localizeMessage } from "@/locales/messages";
import { displayName } from "@/locales/display";

export function ReceiptPreview({
  cart,
  store,
  customer,
  tender,
  seller = "Test seller",
}: {
  cart: CartLine[];
  store: StoreId;
  customer: string;
  tender: string;
  seller?: string;
}) {
  const { t, lang } = useErp();
  return (
    <section className="receipt-preview">
      <header>
        <strong>PH · Phone House Maghnia</strong>
        <span>{t("rcpt.header")}</span>
        <small>{storeLabel(store)}</small>
      </header>
      <dl className="detail-list">
        <dt>{t("rcpt.customer")}</dt>
        <dd>{displayName(lang, customer)}</dd>
        <dt>{t("rcpt.payment")}</dt>
        <dd>{localizeMessage(lang, tender)}</dd>
        <dt>{t("rcpt.seller")}</dt>
        <dd>{displayName(lang, seller)}</dd>
      </dl>
      <table className="data-table">
        <thead>
          <tr>
            <th>{t("rcpt.item")}</th>
            <th>{t("rcpt.qty")}</th>
            <th>{t("rcpt.lineTotal")}</th>
          </tr>
        </thead>
        <tbody>
          {cart.map((line) => (
            <tr key={line.item.id}>
              <td>
                {line.item.name}
                <small className="ltr">
                  {line.item.kind === "phone" ? `IMEI ${line.item.imei}` : line.item.code}
                </small>
              </td>
              <td>{line.quantity}</td>
              <td className="ltr">{formatMoney(cartTotal([line]))}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="receipt-total">
        <strong>{t("rcpt.total")}</strong>
        <strong className="ltr">{formatMoney(cartTotal(cart))}</strong>
      </div>
      <p className="safety-notice">{t("rcpt.notice")}</p>
      <Button disabled variant="outline">
        <LockKeyhole />
        {t("rcpt.blocked")}
      </Button>
    </section>
  );
}
