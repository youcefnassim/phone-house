import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNativeCommand } from "./use-native-command";
import { useErp } from "./context";
import { nativeCompletenessText } from "@/locales/native-completeness";
import { nativeDailyError } from "@/locales/native-daily";
import { formatMinor } from "@/domain/production-modules";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeDocumentDialog } from "./native-documents";
import type { NativeReceipt } from "@/domain/native-documents";
export function NativeCustomers({ store }: { store: "M01" | "M02" }) {
  const { lang } = useErp(),
    t = nativeCompletenessText(lang),
    { repo } = useNativeCommand();
  const [search, setSearch] = useState(""),
    [applied, setApplied] = useState(""),
    [selected, setSelected] = useState(""),
    [receipt, setReceipt] = useState<NativeReceipt | null>(null);
  const customers = useQuery({
    queryKey: ["native-customers", repo, store, applied],
    queryFn: () => repo.customerSearch({ store, search: applied, limit: 100 }),
    retry: false,
  });
  const history = useQuery({
    queryKey: ["native-customer-history", repo, store, selected],
    queryFn: () => repo.customerHistory({ store, customerId: selected, limit: 100 }),
    enabled: !!selected,
    retry: false,
  });
  return (
    <section className="grid gap-4">
      <form
        className="flex gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          setApplied(search);
        }}
      >
        <Input aria-label={t.search} value={search} onChange={(e) => setSearch(e.target.value)} />
        <Button size="lg">{t.search}</Button>
      </form>
      <label>
        {t.customer}
        <select value={selected} onChange={(e) => setSelected(e.target.value)}>
          <option value="">—</option>
          {customers.data?.customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} · {c.contact ?? c.reference}
            </option>
          ))}
        </select>
      </label>
      {(customers.isError || history.isError) && (
        <p role="alert">{nativeDailyError(lang, "FORBIDDEN")}</p>
      )}
      {history.data && (
        <div>
          <h2 className="font-semibold">
            {t.history} · {history.data.customer.name}
          </h2>
          {history.data.sales.map((s) => (
            <div className="border-b border-border flex flex-wrap gap-3 py-3" key={s.id}>
              <bdi>{s.id}</bdi>
              <span>
                {new Intl.DateTimeFormat(lang, {
                  timeZone: "Africa/Algiers",
                  dateStyle: "medium",
                }).format(s.soldAt)}
              </span>
              <span>{formatMinor(s.totalMinor)}</span>
              <Button
                size="lg"
                variant="outline"
                onClick={() => void repo.receipt({ store, id: s.id }).then(setReceipt)}
              >
                {t.history}
              </Button>
            </div>
          ))}
        </div>
      )}
      {receipt && <NativeDocumentDialog receipt={receipt} onClose={() => setReceipt(null)} />}
    </section>
  );
}
