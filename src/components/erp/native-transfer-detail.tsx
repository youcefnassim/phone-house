import { useMemo, useState } from "react";
import { useNativeTransport } from "./native-transport";
import { createNativeRepository } from "@/data/native-repository";
import { useErp } from "./context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { stockCountText } from "@/locales/stock-count";
import { localizeMessage } from "@/locales/messages";
import type { NativeTransferDetailResult } from "@/domain/native-operations";
import type { StoreId } from "@/domain/erp";
export function NativeTransferDetail({ store, owner }: { store: StoreId; owner: boolean }) {
  const { lang } = useErp(),
    t = stockCountText(lang),
    transport = useNativeTransport(),
    repo = useMemo(() => createNativeRepository(transport), [transport]);
  const [id, setId] = useState(""),
    [data, setData] = useState<NativeTransferDetailResult | null>(null),
    [reason, setReason] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const load = async () => setData(await repo.transferDetail({ store, transferId: id }));
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
      key: `transfer-${crypto.randomUUID()}`,
      operation,
      payload: { store, ...payload },
    });
    await load();
  };
  return (
    <section className="border-t border-border py-4">
      <div className="flex flex-wrap gap-3">
        <label>
          {t.transferId}
          <Input value={id} onChange={(e) => setId(e.target.value)} />
        </label>
        <Button size="lg" disabled={!id || busy} onClick={() => void run(load)}>
          {t.review}
        </Button>
      </div>
      {data && (
        <>
          <p className="mt-3">
            {t.carrier}: {data.dispatch?.carrier || "—"}
          </p>
          {data.lines.map((l) => (
            <div className="flex flex-wrap gap-3 py-3" key={l.itemId}>
              <bdi>
                {l.code} · {l.quantity}
              </bdi>
              {data.transfer.stage === "IN_TRANSIT" && store === data.transfer.destinationStore && (
                <Button
                  size="lg"
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    void run(() =>
                      command("transfer.scan", {
                        transferId: id,
                        itemId: l.itemId,
                        code: l.code,
                        quantity: l.quantity,
                        damaged: true,
                      }),
                    )
                  }
                >
                  {t.damaged}
                </Button>
              )}
            </div>
          ))}
          {data.discrepancies?.map((d) => (
            <div key={d.itemId} className="flex flex-wrap items-center gap-3 py-3">
              <bdi>
                {d.itemId} · {d.quantity}
              </bdi>
              <span>
                {d.kind === "DAMAGED" ? t.damaged : t.missing} · {d.outcome ?? t.pending}
              </span>
              {owner &&
                !d.outcome &&
                store === data.transfer.sourceStore &&
                (["RETURN", "WRITE_OFF"] as const).map((outcome) => (
                  <Button
                    size="lg"
                    key={outcome}
                    disabled={busy || !reason.trim()}
                    onClick={() =>
                      void run(() =>
                        command("transfer.resolve", {
                          transferId: id,
                          itemId: d.itemId,
                          outcome,
                          reason,
                        }),
                      )
                    }
                  >
                    {outcome === "RETURN" ? t.returned : t.writeoff}
                  </Button>
                ))}
            </div>
          ))}
          {owner && (
            <label>
              {t.reason}
              <Input value={reason} onChange={(e) => setReason(e.target.value)} />
            </label>
          )}
        </>
      )}
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}
