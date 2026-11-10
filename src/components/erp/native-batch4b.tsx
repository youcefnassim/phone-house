import { NativeExchange } from "./native-exchange";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNativeTransport } from "./native-transport";
import { useErp } from "./context";
import { SalesReport, ZakatReport, type ZakatSheet } from "./sales-report";
import type { SaleDay } from "@/domain/batch4b";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SavActions } from "./sav-actions";
import { batch4bText } from "@/locales/batch4b";
import { nativeSavResult } from "@/domain/native-operations";
import { useNativeCommand } from "./use-native-command";
import { NativeCommandStatus } from "./native-command-status";
import type { NativeOperation } from "@/domain/native-commands";
import { nativeCompletenessText } from "@/locales/native-completeness";
export function NativeReports({ store, owner }: { store: "M01" | "M02"; owner: boolean }) {
  const { lang } = useErp(),
    t = nativeCompletenessText(lang);
  const transport = useNativeTransport(),
    [from, setFrom] = useState(""),
    [to, setTo] = useState("");
  const q = useQuery({
    queryKey: ["batch4b-report", transport, store, from, to],
    queryFn: async () => {
      if (!transport.salesReport) throw new Error("NOT_CONNECTED");
      return (await transport.salesReport({
        store,
        ...(from ? { from } : {}),
        ...(to ? { to } : {}),
      })) as SaleDay[];
    },
    retry: false,
  });
  const z = useQuery({
    queryKey: ["batch4b-zakat", transport, store],
    queryFn: async () => {
      if (!transport.zakatSheet) throw new Error("NOT_CONNECTED");
      return (await transport.zakatSheet({ store })) as ZakatSheet;
    },
    enabled: owner,
    retry: false,
  });
  return (
    <>
      {q.isPending && <p role="status">{t.loading}</p>}
      <SalesReport rows={q.data ?? []} from={from} to={to} onFrom={setFrom} onTo={setTo} />
      {q.isError && <p role="alert">{String(q.error)}</p>}
      {owner && z.isPending && <p role="status">{t.loading}</p>}
      {owner && z.isError && <p role="alert">{String(z.error)}</p>}
      {owner && z.data && <ZakatReport sheet={z.data} />}
    </>
  );
}
export function NativeSav({
  store,
  owner,
  approve,
}: {
  store: "M01" | "M02";
  owner: boolean;
  approve: boolean;
}) {
  const command = useNativeCommand();
  const transport = useNativeTransport(),
    client = useQueryClient(),
    { lang } = useErp(),
    t = batch4bText(lang),
    [caseId, setCaseId] = useState(""),
    [saleId, setSaleId] = useState(""),
    [phoneId, setPhoneId] = useState(""),
    [customerId, setCustomerId] = useState(""),
    [imei, setImei] = useState(""),
    [issue, setIssue] = useState(""),
    [error, setError] = useState("");
  const sales = useQuery({
    queryKey: ["native-sav-sales", command.repo, store],
    queryFn: () => command.repo.salesHistory({ store, limit: 200 }),
    retry: false,
  });
  const selectedSale = sales.data?.sales.find((s) => s.id === saleId);
  const q = useQuery({
    queryKey: ["batch4b-sav", transport, store],
    queryFn: async () => {
      if (!transport.savCases) throw new Error("NOT_CONNECTED");
      return nativeSavResult.parse(await transport.savCases({ store }));
    },
    retry: false,
  });
  const send = async (operation: string, payload: Record<string, unknown>) => {
    await command.send(operation as NativeOperation, { store, ...payload }, async () => {
      const r = await q.refetch();
      if (r.isError) throw r.error;
      await client.invalidateQueries();
    });
  };
  return (
    <section>
      <fieldset disabled={command.locked}>
        <div className="grid sm:grid-cols-2 gap-3">
          <label>
            {t.sale}
            <select
              value={saleId}
              onChange={(e) => {
                const s = sales.data?.sales.find((s) => s.id === e.target.value);
                setSaleId(e.target.value);
                setCustomerId(s?.customerId ?? "");
                setPhoneId("");
                setImei("");
              }}
            >
              <option value="">—</option>
              {sales.data?.sales
                .filter((s) => !s.voided && s.lines.some((l) => l.kind === "phone"))
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.customerName} · {s.id}
                  </option>
                ))}
            </select>
          </label>
          {[
            [t.newPhone, phoneId, setPhoneId],
            [t.customer, customerId, setCustomerId],
            [t.imei, imei, setImei],
            [t.issue, issue, setIssue],
          ].map(([label, value, setter]) => (
            <label key={String(label)}>
              {String(label)}
              <Input
                value={String(value)}
                onChange={(e) => (setter as (v: string) => void)(e.target.value)}
              />
            </label>
          ))}
          {selectedSale?.lines
            .filter((l) => l.kind === "phone")
            .map((l, i) => (
              <Button
                key={i}
                size="lg"
                variant="outline"
                onClick={() => {
                  void command.repo
                    .receipt({ store, id: saleId })
                    .then((r) => {
                      const unit = r.lines.find(
                        (u) => u.kind === "phone" && (u.imei1 === l.imei1 || u.serial === l.serial),
                      );
                      if (unit) {
                        setPhoneId(unit.itemId);
                        setImei(unit.imei1 ?? "");
                      }
                    })
                    .catch((e) => setError(String(e)));
                }}
              >
                {l.name} · {l.imei1 ?? l.serial}
              </Button>
            ))}
          <Button
            size="lg"
            disabled={!saleId || !phoneId || !customerId || !imei || !issue}
            onClick={() =>
              void send("sav.open", {
                id: crypto.randomUUID(),
                saleId,
                phoneId,
                customerId,
                imei,
                issue,
              }).catch((e) => setError(String(e)))
            }
          >
            {t.open}
          </Button>
        </div>
        <label>
          {t.case}
          <select value={caseId} onChange={(e) => setCaseId(e.target.value)}>
            <option value="">—</option>
            {q.data?.cases.map((c) => (
              <option value={c.id} key={c.id}>
                {c.publicRef ?? c.saleId} · {c.imei1} · {c.issue}
              </option>
            ))}
          </select>
        </label>
        {q.data?.cases
          .filter((c) => c.id === caseId)
          .map((c) => (
            <div key={c.id}>
              <p>
                {c.customerName} · {c.imei1}
              </p>
              <p>
                {t.days}: {c.daysSinceSale ?? "—"}
              </p>
              {c.tracking?.map((e, i) => (
                <p key={i}>
                  {t[e.status as keyof typeof t] ?? e.status} · {e.note}
                </p>
              ))}
              {c.outcome && <p>{t[c.outcome as keyof typeof t] ?? c.outcome}</p>}
              <SavActions
                manufacturer={c.warrantyProvider === "MANUFACTURER"}
                approve={approve}
                closed={!!c.outcome}
                onCommand={(op, v) => send(op, { caseId: c.id, ...v })}
              />
              {approve && !c.outcome && (
                <NativeExchange
                  store={store}
                  caseId={c.id}
                  saleId={c.saleId}
                  customerId={c.customerId}
                  onCommand={send}
                />
              )}
              {owner && (
                <Button
                  variant="outline"
                  size="lg"
                  onClick={() =>
                    void send("sav.restock", { phoneId: c.phoneId, note: t.restock }).catch((e) =>
                      setError(String(e)),
                    )
                  }
                >
                  {t.restock}
                </Button>
              )}
            </div>
          ))}
        {error && <p role="alert">{error}</p>}
      </fieldset>
      <NativeCommandStatus command={command} />
    </section>
  );
}
