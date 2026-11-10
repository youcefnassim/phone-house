import { reviewActor } from "@/data/test-workspace";
import { useState } from "react";
import { useErp } from "./context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTestWorkspace } from "@/data/test-workspace";
import {
  openLocalSav,
  trackLocalSav,
  outcomeLocalSav,
  restockLocalSav,
  exchangeLocalSav,
} from "@/data/local-batch4b";
import { batch4bText } from "@/locales/batch4b";
import { daysSinceSale } from "@/domain/batch4b";
import { SavActions } from "./sav-actions";
export function LocalSav() {
  const role = reviewActor()?.role ?? "SELLER";
  const { lang, scope } = useErp(),
    t = batch4bText(lang),
    ws = useTestWorkspace(),
    [unit, setUnit] = useState(""),
    [issue, setIssue] = useState(""),
    [error, setError] = useState(""),
    [replacement, setReplacement] = useState(""),
    [exchangeNote, setExchangeNote] = useState(""),
    [exchangeMethod, setExchangeMethod] = useState<"Cash" | "Bank">("Cash");
  const sold = ws.sales
    .filter(
      (s) =>
        (scope === "ALL" || s.store === scope) && !ws.saleVoids?.some((v) => v.saleId === s.id),
    )
    .flatMap((s) => s.lines.filter((l) => l.kind === "phone").map((l) => ({ sale: s, line: l })));
  const run = (fn: () => void) => {
    try {
      fn();
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  return (
    <section className="mb-6 border-b border-border pb-5">
      <h2 className="font-semibold text-xl mb-3">{t.sav}</h2>
      <div className="grid sm:grid-cols-2 gap-3">
        <label>
          {t.sale}
          <select value={unit} onChange={(e) => setUnit(e.target.value)}>
            <option value="">—</option>
            {sold.map((s) => (
              <option key={s.sale.id + s.line.id} value={s.sale.id + "|" + s.line.id}>
                {s.sale.publicRef ?? s.sale.id} · {s.line.name} · {s.line.imei}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t.issue}
          <Input value={issue} onChange={(e) => setIssue(e.target.value)} />
        </label>
        <Button
          size="lg"
          disabled={!unit || !issue}
          onClick={() =>
            run(() => {
              const s = sold.find((s) => unit === s.sale.id + "|" + s.line.id);
              if (s) openLocalSav(s.sale, s.line.id, issue);
            })
          }
        >
          {t.open}
        </Button>
      </div>
      {error && <p role="alert">{error}</p>}
      {ws.savCases
        ?.filter((c) => scope === "ALL" || c.store === scope)
        .map((c) => {
          const sale = ws.sales.find((s) => s.id === c.saleId);
          return (
            <article key={c.id} className="border-t border-border py-4">
              <h3 className="font-semibold">
                {sale?.publicRef ?? c.saleId} · {c.issue}
              </h3>
              <p>
                {sale?.customer} · {sale?.lines.find((l) => l.id === c.phoneId)?.imei}
              </p>
              <p>
                {t.days}: {sale ? daysSinceSale(sale.at) : "—"}
              </p>
              {c.tracking.map((e, i) => (
                <p key={i}>
                  {t[e.status as keyof typeof t] ?? e.status} · {e.note}
                </p>
              ))}
              {c.outcome && (
                <p>
                  {t[c.outcome.value as keyof typeof t]} · {c.outcome.amount ?? ""}
                </p>
              )}
              {role !== "SELLER" && !c.outcome && (
                <div className="grid gap-3 my-3">
                  <label>
                    {t.newPhone}
                    <select value={replacement} onChange={(e) => setReplacement(e.target.value)}>
                      <option value="">—</option>
                      {ws.phones
                        .filter((p) => p.store === c.store && p.status === "Available" && p.amount)
                        .map((p) => (
                          <option value={p.id} key={p.id}>
                            {p.name} · {p.imei} · {p.amount} DZD
                          </option>
                        ))}
                    </select>
                  </label>
                  <label>
                    {t.note}
                    <Input value={exchangeNote} onChange={(e) => setExchangeNote(e.target.value)} />
                  </label>
                  <select
                    value={exchangeMethod}
                    onChange={(e) => setExchangeMethod(e.target.value === "Cash" ? "Cash" : "Bank")}
                  >
                    <option value="Cash">{t.Cash}</option>
                    <option value="Bank">{t.Bank}</option>
                  </select>
                  <Button
                    size="lg"
                    disabled={!replacement || !exchangeNote}
                    onClick={() =>
                      run(() => {
                        exchangeLocalSav(c.id, replacement, exchangeMethod, exchangeNote);
                      })
                    }
                  >
                    {t.EXCHANGE}
                  </Button>
                </div>
              )}
              <SavActions
                approve={role !== "SELLER"}
                manufacturer={
                  !!sale?.warranties?.some(
                    (w) => w.itemId === c.phoneId && w.provider === "MANUFACTURER" && w.requested,
                  )
                }
                closed={!!c.outcome}
                onCommand={async (op, v) => {
                  if (op === "sav.track") trackLocalSav({ ...v, store: c.store, caseId: c.id });
                  else outcomeLocalSav({ ...v, store: c.store, caseId: c.id }, crypto.randomUUID());
                }}
              />
              {["REFUND", "EXCHANGE"].includes(c.outcome?.value ?? "") &&
                ws.phones.find((p) => p.id === c.phoneId)?.status === "Inspection" && (
                  <>
                    <p>{t.holding}</p>
                    {role === "SUPER_ADMIN" && (
                      <Button size="lg" onClick={() => run(() => restockLocalSav(c.phoneId))}>
                        {t.restock}
                      </Button>
                    )}
                  </>
                )}
            </article>
          );
        })}
    </section>
  );
}
