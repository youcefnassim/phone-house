import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNativeTransport } from "./native-transport";
import { useErp } from "./context";
import { batch4bText } from "@/locales/batch4b";
import { nativePosSearchResult } from "@/domain/native-pos-search";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { nativeReceipt } from "@/domain/native-documents";
import { nativeCompletenessText } from "@/locales/native-completeness";
import { decimalValue, minorUnits } from "@/domain/erp";
export function NativeExchange({
  store,
  caseId,
  saleId,
  customerId,
  onCommand,
}: {
  store: "M01" | "M02";
  caseId: string;
  saleId: string;
  customerId: string;
  onCommand: (op: string, payload: Record<string, unknown>) => Promise<void>;
}) {
  const transport = useNativeTransport(),
    { lang } = useErp(),
    t = batch4bText(lang),
    labels = nativeCompletenessText(lang),
    [unit, setUnit] = useState(""),
    [shift, setShift] = useState(""),
    [note, setNote] = useState(""),
    [method, setMethod] = useState<"Cash" | "Bank">("Cash"),
    [bankMethod, setBankMethod] = useState("VIREMENT"),
    [refundAmount, setRefundAmount] = useState(""),
    [warranty, setWarranty] = useState(""),
    [provider, setProvider] = useState("SHOP"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const items = useQuery({
    queryKey: ["exchange-items", transport, store],
    queryFn: async () => {
      if (!transport.posSearch) throw new Error("NOT_CONNECTED");
      return nativePosSearchResult.parse(await transport.posSearch({ store, limit: 100 }));
    },
    retry: false,
  });
  const receipt = useQuery({
    queryKey: ["exchange-receipt", transport, store, saleId],
    queryFn: async () => {
      if (!transport.receipt) throw new Error("NOT_CONNECTED");
      return nativeReceipt.parse(await transport.receipt({ store, id: saleId }));
    },
    retry: false,
  });
  const chosen = items.data?.items.find((p) => p.id === unit);
  const save = async () => {
    if (!chosen?.amountMinor || !receipt.data) return;
    setBusy(true);
    try {
      const r = receipt.data;
      const checkout = {
        contractVersion: "native-pos-2026-11-07",
        idempotencyKey: "exchange-sale-" + crypto.randomUUID(),
        clientRequestId: crypto.randomUUID(),
        payload: {
          store,
          shiftId: shift,
          customerId,
          buyer: {
            surname: r.buyer?.surname ?? "",
            givenName: r.buyer?.givenName ?? "",
            contact: r.buyer?.contact ?? "",
          },
          lines: [{ itemId: unit, kind: "phone", quantity: "1" }],
          tender: method,
          tenderedAmount: decimalValue(BigInt(chosen.amountMinor)),
          ...(method === "Bank" ? { bankMethod } : {}),
          warranties: [
            {
              itemId: unit,
              requested: warranty !== "NO",
              ...(warranty !== "NO" ? { provider, months: Number(warranty) } : {}),
            },
          ],
        },
      };
      await onCommand("sav.exchange", {
        store,
        caseId,
        note,
        refundAmount,
        method,
        ...(method === "Cash" ? { shiftId: shift } : { bankMethod }),
        checkout,
      });
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="border-t border-border mt-5 py-4 grid gap-3">
      <h3 className="font-semibold">{t.EXCHANGE}</h3>
      <label>
        {t.newPhone}
        <select value={unit} onChange={(e) => setUnit(e.target.value)}>
          <option value="">—</option>
          {items.data?.items
            .filter((p) => p.kind === "phone" && p.quantity > 0 && p.amountMinor)
            .map((p) => (
              <option value={p.id} key={p.id}>
                {p.name} · {p.imei1} · {(p.amountMinor ?? 0) / 100} DZD
              </option>
            ))}
        </select>
      </label>
      <label>
        {t.cash}
        <Input value={shift} onChange={(e) => setShift(e.target.value)} />
      </label>
      <label>
        {t.note}
        <Input value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      <label>
        {t.amount}
        <Input
          inputMode="decimal"
          value={refundAmount}
          onChange={(e) => setRefundAmount(e.target.value)}
        />
      </label>
      <select
        value={method}
        onChange={(e) => setMethod(e.target.value === "Cash" ? "Cash" : "Bank")}
      >
        <option value="Cash">{t.Cash}</option>
        <option value="Bank">{t.Bank}</option>
      </select>
      {method === "Bank" && (
        <label>
          {labels.bankMethod}
          <select value={bankMethod} onChange={(e) => setBankMethod(e.target.value)}>
            <option value="VIREMENT">Virement</option>
            <option value="CCP_BARIDIMOB">CCP / BaridiMob</option>
          </select>
        </label>
      )}
      {chosen?.amountMinor && /^\d+(?:\.\d{1,2})?$/.test(refundAmount) && (
        <p>
          {labels.difference}: {decimalValue(BigInt(chosen.amountMinor) - minorUnits(refundAmount))}{" "}
          DZD
        </p>
      )}
      <select
        aria-label={labels.warranty}
        value={warranty}
        onChange={(e) => setWarranty(e.target.value)}
      >
        <option value="">—</option>
        <option value="NO">{labels.no}</option>
        {[1, 3, 6, 12].map((n) => (
          <option key={n} value={n}>
            YES · {n}
          </option>
        ))}
      </select>
      {warranty && warranty !== "NO" && (
        <select value={provider} onChange={(e) => setProvider(e.target.value)}>
          <option value="SHOP">SHOP</option>
          <option value="MANUFACTURER">MANUFACTURER</option>
        </select>
      )}
      <Button
        size="lg"
        disabled={busy || !unit || !shift || !note || !warranty || !receipt.data || !refundAmount}
        onClick={() => void save()}
      >
        {t.EXCHANGE}
      </Button>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
