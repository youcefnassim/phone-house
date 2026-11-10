import { useEffect, useMemo, useState } from "react";
import { useNativeTransport } from "./native-transport";
import { createNativeRepository } from "@/data/native-repository";
import { useErp } from "./context";
import { stockCountText } from "@/locales/stock-count";
import { formatMinor } from "@/domain/production-modules";
import type { StoreId } from "@/domain/erp";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useNativeCommand } from "./use-native-command";
import { NativeCommandStatus } from "./native-command-status";
export function NativeSupplierPayables({ store }: { store: StoreId }) {
  const command = useNativeCommand();
  const [supplierId, setSupplier] = useState(""),
    [sourceId, setSource] = useState(""),
    [phoneId, setPhone] = useState(""),
    [amount, setAmount] = useState(""),
    [method, setMethod] = useState("Bank"),
    [bankMethod, setBank] = useState("VIREMENT"),
    [shiftId, setShift] = useState("");
  const [suppliers, setSuppliers] = useState<{ id: string; name: string }[]>([]);
  const transport = useNativeTransport(),
    repo = useMemo(() => createNativeRepository(transport), [transport]),
    { lang } = useErp(),
    t = stockCountText(lang);
  const [rows, setRows] = useState<Awaited<ReturnType<typeof repo.supplierPayables>>>([]),
    [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    void repo
      .supplierLookup(store)
      .then((r) => live && setSuppliers(r))
      .catch(() => {});
    void repo
      .supplierPayables(store)
      .then((r) => {
        if (live) setRows(r);
      })
      .catch(() => {
        if (live) setError("—");
      });
    return () => {
      live = false;
      setRows([]);
    };
  }, [repo, store]);
  return (
    <section className="border-t border-border py-4">
      <h2 className="font-semibold mb-3">{t.payables}</h2>
      {rows.map((r) => (
        <p key={r.supplier_id}>
          {r.name} · {formatMinor(r.balance_minor)}
        </p>
      ))}
      <fieldset disabled={command.locked} className="grid gap-4 my-4">
        <label>
          {t.supplier}
          <select value={supplierId} onChange={(e) => setSupplier(e.target.value)}>
            <option value="">—</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t.amount}
          <Input value={amount} inputMode="decimal" onChange={(e) => setAmount(e.target.value)} />
        </label>
        <form
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            void command
              .send(
                "supplier.cost",
                { store, supplierId, sourceId, amount, ...(phoneId ? { phoneId } : {}) },
                async () => setRows(await repo.supplierPayables(store)),
              )
              .catch(() => {});
          }}
        >
          <label>
            {t.sourceId}
            <Input value={sourceId} onChange={(e) => setSource(e.target.value)} />
          </label>
          <label>
            {t.phoneId}
            <Input value={phoneId} onChange={(e) => setPhone(e.target.value)} />
          </label>
          <Button size="lg" disabled={!supplierId || !sourceId || !amount}>
            {t.cost}
          </Button>
        </form>
        <form
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            void command
              .send(
                "supplier.payment",
                {
                  store,
                  supplierId,
                  amount,
                  method,
                  ...(method === "Cash" ? { shiftId } : { bankMethod }),
                },
                async () => setRows(await repo.supplierPayables(store)),
              )
              .catch(() => {});
          }}
        >
          <label>
            {t.method}
            <select value={method} onChange={(e) => setMethod(e.target.value)}>
              <option value="Cash">{t.cash}</option>
              <option value="Bank">{t.bank}</option>
            </select>
          </label>
          {method === "Cash" ? (
            <label>
              {t.shiftId}
              <Input value={shiftId} onChange={(e) => setShift(e.target.value)} />
            </label>
          ) : (
            <label>
              {t.bankMethod}
              <select value={bankMethod} onChange={(e) => setBank(e.target.value)}>
                <option value="VIREMENT">Virement</option>
                <option value="CCP_BARIDIMOB">CCP / BaridiMob</option>
              </select>
            </label>
          )}
          <Button size="lg" disabled={!supplierId || !amount || (method === "Cash" && !shiftId)}>
            {t.payment}
          </Button>
        </form>
      </fieldset>
      <NativeCommandStatus command={command} />
      {error && <p role="status">{error}</p>}
    </section>
  );
}
