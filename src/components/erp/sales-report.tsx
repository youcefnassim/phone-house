import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FileSpreadsheet, FileText } from "lucide-react";
import { batch4bText } from "@/locales/batch4b";
import { excelSales, pdfSales } from "@/data/report-export";
import type { SaleDay } from "@/domain/batch4b";
import { useErp } from "./context";
export function SalesReport({
  rows,
  from,
  to,
  onFrom,
  onTo,
}: {
  rows: SaleDay[];
  from: string;
  to: string;
  onFrom: (v: string) => void;
  onTo: (v: string) => void;
}) {
  const { lang } = useErp(),
    t = batch4bText(lang),
    [error, setError] = useState("");
  const run = (fn: () => Promise<void>) => void fn().catch(() => setError(t.unknown));
  return (
    <section>
      <h2 className="text-xl font-semibold mb-4">{t.sales}</h2>
      <div className="flex flex-wrap items-end gap-3 mb-5">
        <label>
          {t.from}
          <Input type="date" value={from} onChange={(e) => onFrom(e.target.value)} />
        </label>
        <label>
          {t.to}
          <Input type="date" value={to} onChange={(e) => onTo(e.target.value)} />
        </label>
        <Button
          size="lg"
          variant="outline"
          onClick={() => run(() => excelSales(rows, [t.store, t.day, t.count, t.total]))}
        >
          <FileSpreadsheet />
          Excel
        </Button>
        <Button size="lg" variant="outline" onClick={() => run(() => pdfSales(rows))}>
          <FileText />
          PDF
        </Button>
      </div>
      {error && <p role="alert">{error}</p>}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr>
              {[t.store, t.day, t.count, t.total].map((x) => (
                <th className="text-start border-b border-border p-3" key={x}>
                  {x}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.store + r.day}>
                <td className="p-3">{r.store}</td>
                <td dir="ltr">{r.day}</td>
                <td>{r.sales}</td>
                <td dir="ltr">{r.total} DZD</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
export type ZakatSheet = {
  stock: string;
  cash: string;
  receivables: string;
  payables: string;
  net: string;
  known: number;
  total: number;
  missing: number;
};
export function ZakatReport({ sheet }: { sheet: ZakatSheet }) {
  const { lang } = useErp(),
    t = batch4bText(lang);
  return (
    <section className="border-t border-border mt-8 pt-5">
      <h2 className="font-semibold text-xl">{t.zakat}</h2>
      <p className="my-3">
        {t.coverage}: {sheet.known} / {sheet.total} · {t.missing}: {sheet.missing}
      </p>
      {sheet.missing > 0 && <p className="text-muted-foreground">{t.costWarning}</p>}
      <dl className="grid grid-cols-2 gap-3 mt-4">
        {(
          [
            ["stock", t.stock],
            ["cash", t.cash],
            ["receivables", t.credit],
            ["payables", t.payables],
            ["net", t.net],
          ] as const
        ).map(([k, label]) => (
          <div key={k}>
            <dt>{label}</dt>
            <dd className="font-semibold" dir="ltr">
              {formatCentimes(sheet[k])} DZD
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function formatCentimes(v: string) {
  const n = BigInt(v),
    a = n < 0n ? -n : n;
  return `${n < 0n ? "-" : ""}${a / 100n}.${(a % 100n).toString().padStart(2, "0")}`;
}
