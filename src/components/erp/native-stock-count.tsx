import { useCallback, useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useErp } from "./context";
import { useNativeTransport } from "./native-transport";
import { createNativeRepository } from "@/data/native-repository";

import { stockCountText } from "@/locales/stock-count";
import { localizeMessage } from "@/locales/messages";
import type { StockCountResult } from "@/domain/stock-count";
import type { StoreId } from "@/domain/erp";
export function StockCount({ store }: { store: StoreId; native?: boolean }) {
  const { lang } = useErp(),
    t = stockCountText(lang);
  const native = true;
  const transport = useNativeTransport(),
    repo = useMemo(() => createNativeRepository(transport), [transport]);
  const [id, setId] = useState(""),
    [toolOpen, setToolOpen] = useState(false),
    [owner, setOwner] = useState(false),
    [month, setMonth] = useState(""),
    [code, setCode] = useState(""),
    [qty, setQty] = useState("1"),
    [reason, setReason] = useState(""),
    [data, setData] = useState<StockCountResult | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const load = useCallback(
    async (countId = id) => {
      if (countId) setData(await repo.stockCount(store, countId));
    },
    [id, native, repo, store],
  );
  useEffect(() => {
    if (native)
      void repo
        .status()
        .then((s) =>
          setOwner(!!s.memberships?.some((m) => m.role === "SUPER_ADMIN" && m.store === "GLOBAL")),
        );
  }, [native, repo]);
  const run = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
      setError("");
    } catch (e) {
      setError(localizeMessage(lang, e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy(false);
    }
  };
  const command = async (operation: string, payload: Record<string, unknown>) => {
    await repo.execute({
      version: "native-2026-11-06",
      key: `count-${crypto.randomUUID()}`,
      operation,
      payload: { store, ...payload },
    });
  };
  return (
    <section className="border-t border-border py-4">
      <Button size="lg" variant="outline" onClick={() => setToolOpen(true)}>
        {t.count}
      </Button>
      <Dialog open={toolOpen} onOpenChange={setToolOpen}>
        <DialogContent className="max-w-none w-screen h-dvh rounded-none overflow-y-auto content-start">
          <DialogTitle>{t.count}</DialogTitle>
          <div className="flex flex-wrap gap-3 mb-3">
            <label>
              {t.month}
              <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
            </label>
            <Button
              size="lg"
              disabled={busy || !month}
              onClick={() =>
                void run(async () => {
                  const countId = `count-${crypto.randomUUID()}`;
                  if (native) await command("count.open", { id: countId, month });
                  setId(countId);
                  await load(countId);
                })
              }
            >
              {t.open}
            </Button>
            <label>
              {t.countId}
              <Input value={id} onChange={(e) => setId(e.target.value)} />
            </label>
            <Button
              size="lg"
              variant="outline"
              disabled={busy || !id}
              onClick={() => void run(() => load())}
            >
              {t.review}
            </Button>
          </div>
          {data?.session.state === "OPEN" && (
            <>
              <p className="text-sm text-muted-foreground mb-3">{t.blind}</p>
              <form
                className="flex flex-wrap gap-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  void run(async () => {
                    if (native) {
                      const resources = await repo.posSearch({ store, search: code, limit: 100 });
                      const item = resources.items.find(
                        (i) => i.id === code || i.barcode === code || i.imei1 === code,
                      );
                      if (!item) throw new Error("NOT_FOUND");
                      await command("count.entry", {
                        countId: id,
                        itemId: item.id,
                        kind: item.kind,
                        quantity: Number(qty),
                      });
                    }
                    await load();
                    setCode("");
                  });
                }}
              >
                <label>
                  {t.scan}
                  <Input value={code} onChange={(e) => setCode(e.target.value)} />
                </label>
                <label>
                  {t.quantity}
                  <Input
                    type="number"
                    min="0"
                    value={qty}
                    onChange={(e) => setQty(e.target.value)}
                  />
                </label>
                <Button size="lg" disabled={busy} type="submit">
                  {t.save}
                </Button>
              </form>
              <Button
                size="lg"
                className="mt-3"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    if (native) await command("count.submit", { countId: id });

                    await load();
                  })
                }
              >
                {t.submit}
              </Button>
            </>
          )}
          {data && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm mt-4">
                <thead>
                  <tr>
                    <th>{t.itemId}</th>
                    <th>{t.quantity}</th>
                    {data.session.state === "SUBMITTED" && (
                      <>
                        <th>{t.expected}</th>
                        <th>{t.difference}</th>
                        <th>{t.adjust}</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((r) => (
                    <tr key={r.item_id} className="border-t border-border">
                      <td className="py-3">
                        <bdi>{r.imei ?? r.item_id}</bdi>
                      </td>
                      <td>{r.counted}</td>
                      {data.session.state === "SUBMITTED" && (
                        <>
                          <td>{r.expected}</td>
                          <td>{r.difference}</td>
                          <td>
                            {r.kind === "accessory" && !!r.difference && (
                              <Button
                                size="lg"
                                disabled={busy || !reason.trim()}
                                onClick={() =>
                                  void run(async () => {
                                    if (native)
                                      await command("stock.adjust", {
                                        countId: id,
                                        itemId: r.item_id,
                                        delta: r.difference,
                                        reason,
                                      });

                                    await load();
                                  })
                                }
                              >
                                {t.adjust}
                              </Button>
                            )}
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <label className="block mt-3">
            {t.reason}
            <Input value={reason} onChange={(e) => setReason(e.target.value)} />
          </label>
          {native &&
            owner &&
            data?.adjustments?.map((r) => (
              <div key={r.id} className="flex flex-wrap gap-3 items-center py-3">
                <bdi>
                  {r.item_id} · {r.delta}
                </bdi>
                <span>{r.outcome}</span>
                {r.outcome === "PENDING" && (
                  <>
                    {(["OK", "FLAGGED"] as const).map((outcome) => (
                      <Button
                        size="lg"
                        variant="outline"
                        key={outcome}
                        disabled={!reason.trim()}
                        onClick={() =>
                          void run(async () => {
                            await command("stock.review", {
                              adjustmentId: r.id,
                              outcome,
                              note: reason,
                            });
                            await load();
                          })
                        }
                      >
                        {outcome === "OK" ? t.ok : t.flag}
                      </Button>
                    ))}
                  </>
                )}
              </div>
            ))}
          {error && (
            <p role="alert" className="text-destructive mt-3">
              {error}
            </p>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
