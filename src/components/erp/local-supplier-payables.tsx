import { useEffect, useState } from "react";
import {
  localSupplierPayables,
  recordLocalSupplierCost,
  recordLocalSupplierPayment,
} from "@/data/local-supplier-finance";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useErp } from "./context";
import { stockCountText } from "@/locales/stock-count";
import { formatMinor } from "@/domain/production-modules";
export function LocalSupplierPayables() {
  const { lang, scope } = useErp(),
    t = stockCountText(lang),
    [rows, setRows] = useState<Awaited<ReturnType<typeof localSupplierPayables>>>([]),
    [supplier, setSupplier] = useState(""),
    [source, setSource] = useState(""),
    [amount, setAmount] = useState(""),
    [method, setMethod] = useState<"Cash" | "Bank">("Bank"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const load = async () => setRows(await localSupplierPayables());
  useEffect(() => {
    let alive = true;
    void localSupplierPayables()
      .then((r) => {
        if (alive) setRows(r);
      })
      .catch(() => {
        if (alive) setError("—");
      });
    return () => {
      alive = false;
    };
  }, []);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
      await load();
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="border-t border-border py-4">
      <h2 className="font-semibold mb-3">{t.payables}</h2>
      <label>
        {t.supplier}
        <select
          className="form-label"
          value={supplier}
          onChange={(e) => setSupplier(e.target.value)}
        >
          <option value="">—</option>
          {rows.map((r) => (
            <option key={r.supplier_id} value={r.supplier_id}>
              {r.name}
            </option>
          ))}
        </select>
      </label>
      {rows.map((r) => (
        <p key={r.supplier_id}>
          {r.name} · {formatMinor(r.balance_minor)}
        </p>
      ))}
      <div className="grid gap-3 sm:grid-cols-2 mt-3">
        <label>
          {t.source}
          <Input value={source} onChange={(e) => setSource(e.target.value)} />
        </label>
        <label>
          {t.amount}
          <Input value={amount} onChange={(e) => setAmount(e.target.value)} />
        </label>
        <Button
          size="lg"
          disabled={busy || !source || !supplier || !amount}
          onClick={() => void run(() => recordLocalSupplierCost(source, supplier, amount))}
        >
          {t.cost}
        </Button>
        <label>
          {t.method}
          <select
            value={method}
            onChange={(e) => setMethod(e.target.value === "Cash" ? "Cash" : "Bank")}
          >
            <option value="Bank">{t.bank}</option>
            <option value="Cash">{t.cash}</option>
          </select>
        </label>
        <Button
          size="lg"
          disabled={busy || scope === "ALL" || !supplier || !amount}
          onClick={() =>
            void run(() =>
              recordLocalSupplierPayment(supplier, scope === "M02" ? "M02" : "M01", amount, method),
            )
          }
        >
          {t.payment}
        </Button>
      </div>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
