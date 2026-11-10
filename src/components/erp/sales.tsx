import { permits } from "@/domain/permissions";
import { useState } from "react";
import { useErp } from "./context";
import { TestDocumentDialog } from "./test-documents";
import { useTestWorkspace, reviewActor, voidTestSale } from "@/data/test-workspace";
import { algiersDate, salesDateRange } from "@/domain/sales-review";
import { Button } from "@/components/ui/button";
import { FileText } from "lucide-react";
import { formatMoney, storeLabel } from "@/domain/erp";
export function SalesPage() {
  const { t, scope, lang } = useErp();
  const ws = useTestWorkspace();
  const actor = reviewActor(ws);
  const [period, setPeriod] = useState("today");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [query, setQuery] = useState("");
  const [store, setStore] = useState("ALL");
  const [seller, setSeller] = useState("");
  const [payment, setPayment] = useState("");
  const [voidError, setVoidError] = useState("");
  const [selected, setSelected] = useState("");
  const range = period === "custom" ? { from, to } : salesDateRange(period);
  const rows = ws.sales.filter(
    (s) =>
      (scope === "ALL" || s.store === scope) &&
      (actor?.role === "SUPER_ADMIN" || actor?.stores.includes(s.store)) &&
      (store === "ALL" || s.store === store) &&
      (!seller || s.seller === seller) &&
      (!payment || s.tender === payment) &&
      (!range.from || algiersDate(s.at) >= range.from) &&
      (!range.to || algiersDate(s.at) <= range.to) &&
      [
        s.id,
        s.customer,
        s.seller,
        s.buyer?.surname,
        s.buyer?.givenName,
        ...s.lines.map(
          (l) => `${l.name} ${l.imei ?? ""} ${l.imei2 ?? ""} ${l.serial ?? ""} ${l.barcode ?? ""}`,
        ),
      ]
        .join(" ")
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  return (
    <div className="page-enter">
      <div className="page-heading">
        <h1>{t("sale.title")}</h1>
      </div>
      <div className="table-toolbar">
        <label className="search-field">
          <input
            aria-label={t("sale.search")}
            placeholder={t("sale.search")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <select
          aria-label={t("doc.date")}
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
        >
          {(["today", "yesterday", "week", "all", "custom"] as const).map((p) => (
            <option key={p} value={p}>
              {t(`sale.${p}`)}
            </option>
          ))}
        </select>
        {period === "custom" && (
          <>
            <label>
              {t("sale.from")}
              <input
                type="date"
                aria-label={t("sale.from")}
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </label>
            <label>
              {t("sale.to")}
              <input
                type="date"
                aria-label={t("sale.to")}
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </label>
          </>
        )}
        <select
          aria-label={t("shared.store")}
          value={store}
          onChange={(e) => setStore(e.target.value)}
        >
          <option value="ALL">{t("shell.allStores")}</option>
          {["M01", "M02"]
            .filter((id) => actor?.role === "SUPER_ADMIN" || actor?.stores.some((s) => s === id))
            .map((id) => (
              <option key={id}>{id}</option>
            ))}
        </select>
        <select
          aria-label={t("doc.seller")}
          value={seller}
          onChange={(e) => setSeller(e.target.value)}
        >
          <option value="">—</option>
          {[
            ...new Set(
              ws.sales.filter((s) => scope === "ALL" || s.store === scope).map((s) => s.seller),
            ),
          ].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <select
          aria-label={t("doc.payment")}
          value={payment}
          onChange={(e) => setPayment(e.target.value)}
        >
          <option value="">—</option>
          <option value="Cash">{t("pos.cash")}</option>
          <option value="Bank">{t("pos.bank")}</option>
        </select>
      </div>
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>{t("doc.reference")}</th>
              <th>{t("doc.date")}</th>
              <th>{t("doc.buyer")}</th>
              <th>{t("shared.store")}</th>
              <th>{t("doc.seller")}</th>
              <th>{t("doc.payment")}</th>
              <th>{t("doc.total")}</th>
              <th>{t("sale.warranty")}</th>
              <th>{t("doc.invoiceTab")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.id}>
                <td>
                  <bdi>{s.publicRef ?? s.id}</bdi>
                  {ws.saleVoids?.some((v) => v.saleId === s.id) && <small>{t("pc.voided")}</small>}
                  <small>
                    {s.lines
                      .map((l) => `${l.name} · ${l.imei || l.serial || l.barcode || ""}`)
                      .join(", ")}
                  </small>
                </td>
                <td>
                  {new Intl.DateTimeFormat(lang, {
                    timeZone: "Africa/Algiers",
                    dateStyle: "short",
                    timeStyle: "short",
                  }).format(new Date(s.at))}
                </td>
                <td>{s.buyer ? `${s.buyer.surname} ${s.buyer.givenName}` : s.customer}</td>
                <td>{storeLabel(s.store)}</td>
                <td>{s.seller}</td>
                <td>{t(s.tender === "Cash" ? "pos.cash" : "pos.bank")}</td>
                <td>
                  <bdi>{formatMoney(s.total)}</bdi>
                </td>
                <td>
                  {s.warranties?.some((w) => w.requested)
                    ? t("sale.pending")
                    : s.warranties
                      ? t("sale.no")
                      : t("sale.legacy")}
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
                  {actor &&
                    permits(
                      actor.role,
                      actor.role === "SUPER_ADMIN" ? "GLOBAL" : s.store,
                      s.store,
                      "sale.void",
                    ) &&
                    !ws.saleVoids?.some((v) => v.saleId === s.id) && (
                      <Button
                        variant="outline"
                        onClick={() => {
                          const reason = window.prompt(t("pc.reason"));
                          if (!reason) return;
                          try {
                            voidTestSale(s.id, `void-${crypto.randomUUID()}`, reason);
                            setVoidError("");
                          } catch (e) {
                            setVoidError(
                              e instanceof Error && e.message === "USE_SAV"
                                ? t("pc.useSav")
                                : t("pc.voided"),
                            );
                          }
                        }}
                      >
                        {t("pc.void")}
                      </Button>
                    )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {voidError && <p role="alert">{voidError}</p>}
      {!rows.length && <p>{t("doc.noSale")}</p>}
      {selected && (
        <TestDocumentDialog key={selected} saleId={selected} onClose={() => setSelected("")} />
      )}
    </div>
  );
}
