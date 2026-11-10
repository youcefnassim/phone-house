import { reviewActor } from "@/data/test-workspace";
import { useEffect, useState } from "react";
import { useErp } from "./context";
import { useTestWorkspace } from "@/data/test-workspace";
import { salesByDay } from "@/domain/batch4b";
import { localZakatSheet } from "@/data/local-batch4b";
import { SalesReport, ZakatReport, type ZakatSheet } from "./sales-report";
export function Reports() {
  const role = reviewActor()?.role ?? "SELLER";
  const { scope } = useErp(),
    ws = useTestWorkspace(),
    [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [sheet, setSheet] = useState<ZakatSheet | null>(null);
  useEffect(() => {
    let alive = true;
    if (role === "SUPER_ADMIN")
      void localZakatSheet()
        .then((s) => {
          if (alive) setSheet(s);
        })
        .catch(() => {
          if (alive) setSheet(null);
        });
    return () => {
      alive = false;
    };
  }, [role, ws]);
  const rows = salesByDay(
    ws.sales.map((s) => ({ ...s, voided: !!ws.saleVoids?.some((v) => v.saleId === s.id) })),
    scope,
    from,
    to,
  );
  return (
    <div className="page-enter">
      <SalesReport rows={rows} from={from} to={to} onFrom={setFrom} onTo={setTo} />
      {role === "SUPER_ADMIN" && sheet && <ZakatReport sheet={sheet} />}
    </div>
  );
}
