import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNativeCommand } from "./use-native-command";
import { NativeCommandStatus } from "./native-command-status";
import { useErp } from "./context";
import { nativeCompletenessText } from "@/locales/native-completeness";
import { permits, canApproveTransfer } from "@/domain/permissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { NativePosSearchResult } from "@/domain/native-pos-search";
import { NativePagination, NATIVE_LIST_PAGE } from "./native-pagination";
type Line = { itemId: string; kind: "phone" | "accessory"; quantity: number; code: string };
export function NativeTransfers({ store }: { store: "M01" | "M02" }) {
  const { lang } = useErp(),
    t = nativeCompletenessText(lang),
    command = useNativeCommand();
  const [id, setId] = useState(""),
    [item, setItem] = useState(""),
    [quantity, setQuantity] = useState("1"),
    [lines, setLines] = useState<Line[]>([]),
    [destination, setDestination] = useState(store === "M01" ? "M02" : "M01"),
    [carrier, setCarrier] = useState(""),
    [note, setNote] = useState(""),
    [reason, setReason] = useState(""),
    [code, setCode] = useState(""),
    [scanQuantity, setScanQuantity] = useState("1"),
    [damaged, setDamaged] = useState(false);
  const [offset, setOffset] = useState(0);
  const status = useQuery({
    queryKey: ["native-transfer-status", command.repo],
    queryFn: () => command.repo.status(),
    retry: false,
  });
  const records = useQuery({
    queryKey: ["native-transfer-list", command.repo, store, offset],
    queryFn: () => command.repo.read("/transfers", store, { limit: NATIVE_LIST_PAGE, offset }),
    retry: false,
  });
  const stock = useQuery({
    queryKey: ["native-transfer-stock", command.repo, store],
    queryFn: () => command.repo.posSearch({ store, limit: 100 }),
    retry: false,
  });
  const catalog = useQuery({
    queryKey: ["native-transfer-catalog", command.repo, store],
    queryFn: () => command.repo.dailyResources(store),
    retry: false,
  });
  const detail = useQuery({
    queryKey: ["native-transfer-detail", command.repo, store, id],
    queryFn: () => command.repo.transferDetail({ store, transferId: id }),
    enabled: !!id,
    retry: false,
  });
  const can = (op: string) =>
    status.data?.memberships?.some((m) => permits(m.role, m.store, store, op));
  const data = detail.data;
  const rows = records.data?.state === "READY" ? records.data.projection.rows : [];
  const reload = async () => {
    const results = await Promise.all([
      records.refetch(),
      stock.refetch(),
      ...(id ? [detail.refetch()] : []),
    ]);
    const failed = results.find((r) => r.isError);
    if (failed) throw failed.error;
  };
  const send = (op: Parameters<typeof command.send>[0], payload: Record<string, unknown>) =>
    command.send(op, { store, ...payload }, reload).catch(() => {});
  const add = () => {
    const p: NativePosSearchResult["items"][number] | undefined = stock.data?.items.find(
      (p) => p.id === item,
    );
    const n = Number(quantity);
    if (
      !p ||
      !Number.isInteger(n) ||
      n < 1 ||
      n > p.quantity ||
      (p.kind === "phone" && n !== 1) ||
      lines.some((l) => l.itemId === item)
    )
      return;
    const code =
      p.kind === "phone" ? p.barcode : catalog.data?.catalog.find((c) => c.id === p.id)?.sku;
    if (!code) return;
    setLines((v) => [...v, { itemId: p.id, kind: p.kind, quantity: n, code }]);
    setItem("");
    setQuantity("1");
  };
  return (
    <section className="grid gap-5">
      {can("transfer.create") && (
        <form
          className="grid sm:grid-cols-2 gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            const created = crypto.randomUUID();
            void command
              .send("transfer.create", { store, id: created, destination, lines }, async () => {
                const r = await records.refetch();
                if (r.isError) throw r.error;
                setId(created);
                setLines([]);
              })
              .catch(() => {});
          }}
        >
          <h2 className="sm:col-span-2 font-semibold">{t.create}</h2>
          <label>
            {t.destination}
            <select
              disabled={command.locked}
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
            >
              <option value={store === "M01" ? "M02" : "M01"}>
                {store === "M01" ? "Magasin 2 (M02)" : "Magasin 1 (M01)"}
              </option>
            </select>
          </label>
          <label>
            {t.product}
            <select
              disabled={command.locked}
              value={item}
              onChange={(e) => setItem(e.target.value)}
            >
              <option value="">—</option>
              {stock.data?.items
                .filter((p) => p.quantity > 0)
                .map((p) => (
                  <option value={p.id} key={p.id}>
                    {p.name} · {p.imei1 ?? p.barcode}
                  </option>
                ))}
            </select>
          </label>
          <label>
            {t.quantity}
            <Input
              type="number"
              min={1}
              step={1}
              value={quantity}
              disabled={command.locked}
              onChange={(e) => setQuantity(e.target.value)}
            />
          </label>
          <Button
            type="button"
            size="lg"
            variant="outline"
            disabled={command.locked || !item || !catalog.data}
            onClick={add}
          >
            {t.addLine}
          </Button>
          {lines.map((l) => (
            <div key={l.itemId} className="flex gap-3 items-center">
              <bdi>
                {l.code} × {l.quantity}
              </bdi>
              <Button
                type="button"
                variant="outline"
                disabled={command.locked}
                onClick={() => setLines((v) => v.filter((p) => p.itemId !== l.itemId))}
              >
                {t.cancel}
              </Button>
            </div>
          ))}
          <Button size="lg" disabled={command.locked || !lines.length}>
            {t.create}
          </Button>
        </form>
      )}
      <label>
        {t.transfer}
        <select disabled={command.locked} value={id} onChange={(e) => setId(e.target.value)}>
          <option value="">—</option>
          {rows.map((r) => (
            <option key={String(r["id"])} value={String(r["id"])}>
              {String(r["id"])} · {String(r["source_store"])} → {String(r["destination_store"])} ·{" "}
              {String(r["stage"])}
            </option>
          ))}
        </select>
      </label>
      {data && (
        <>
          <p>
            {t.carrier}: {data.dispatch?.carrier ?? "—"}
          </p>
          {(["SUPER_ADMIN", "M02_MANAGER"] as const).map((approval) =>
            data.approvals.some((a) => a.approval === approval) ? (
              <p key={approval}>✓ {approval}</p>
            ) : status.data?.memberships?.some((m) =>
                canApproveTransfer(approval, m.role, m.store),
              ) && data.transfer.stage === "APPROVALS" ? (
              <Button
                size="lg"
                disabled={command.locked}
                key={approval}
                onClick={() => void send("transfer.approve", { transferId: id, approval })}
              >
                {t.approve} · {approval === "SUPER_ADMIN" ? "Super Admin" : t.manager}
              </Button>
            ) : null,
          )}
          <div>
            {data.lines.map((l) => (
              <p className="border-b border-border py-2" key={l.itemId}>
                <bdi>
                  {l.code} × {l.quantity}
                </bdi>
              </p>
            ))}
          </div>
          {can("transfer.scan") &&
            ((data.transfer.stage === "APPROVALS" && data.transfer.sourceStore === store) ||
              (data.transfer.stage === "IN_TRANSIT" &&
                data.transfer.destinationStore === store)) && (
              <form
                className="grid sm:grid-cols-2 gap-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  const line = data.lines.find((l) => l.code === code.trim());
                  if (!line) return;
                  void send("transfer.scan", {
                    transferId: id,
                    itemId: line.itemId,
                    code: code.trim(),
                    quantity: Number(scanQuantity),
                    damaged,
                  });
                }}
              >
                <label>
                  {t.scan}
                  <Input
                    required
                    disabled={command.locked}
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                  />
                </label>
                <label>
                  {t.quantity}
                  <Input
                    required
                    disabled={command.locked}
                    type="number"
                    min={1}
                    step={1}
                    value={scanQuantity}
                    onChange={(e) => setScanQuantity(e.target.value)}
                  />
                </label>
                {data.transfer.stage === "IN_TRANSIT" && (
                  <label className="flex gap-2">
                    <input
                      type="checkbox"
                      disabled={command.locked}
                      checked={damaged}
                      onChange={(e) => setDamaged(e.target.checked)}
                    />
                    {t.damaged}
                  </label>
                )}
                <Button
                  size="lg"
                  disabled={command.locked || !data.lines.some((l) => l.code === code.trim())}
                >
                  {t.scan}
                </Button>
              </form>
            )}
          <label>
            {t.evidence}
            <Input
              value={note}
              disabled={command.locked}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
          {can("transfer.dispatch") &&
            data.transfer.sourceStore === store &&
            data.transfer.stage === "APPROVALS" && (
              <>
                <label>
                  {t.carrier}
                  <Input
                    required
                    value={carrier}
                    disabled={command.locked}
                    onChange={(e) => setCarrier(e.target.value)}
                  />
                </label>
                <Button
                  size="lg"
                  disabled={command.locked || !carrier.trim() || !note.trim()}
                  onClick={() =>
                    void send("transfer.dispatch", { transferId: id, carrier, evidence: note })
                  }
                >
                  {t.dispatch}
                </Button>
              </>
            )}
          {can("transfer.receive") &&
            data.transfer.destinationStore === store &&
            data.transfer.stage === "IN_TRANSIT" && (
              <>
                <p>{t.partial}</p>
                <Button
                  size="lg"
                  disabled={command.locked || !note.trim()}
                  onClick={() => void send("transfer.receive", { transferId: id, evidence: note })}
                >
                  {t.receive}
                </Button>
              </>
            )}
          {can("transfer.resolve") && data.transfer.sourceStore === store && (
            <>
              <label>
                {t.reason}
                <Input
                  value={reason}
                  disabled={command.locked}
                  onChange={(e) => setReason(e.target.value)}
                />
              </label>
              {data.discrepancies?.map((d) => (
                <div key={d.itemId} className="flex flex-wrap gap-3 border-b border-border py-3">
                  <bdi>
                    {d.itemId} × {d.quantity}
                  </bdi>
                  <span>{d.kind === "DAMAGED" ? t.damaged : t.partial}</span>
                  {d.outcome ? (
                    <span>{d.outcome === "RETURN" ? t.returned : t.writeoff}</span>
                  ) : (
                    (["RETURN", "WRITE_OFF"] as const).map((outcome) => (
                      <Button
                        size="lg"
                        key={outcome}
                        disabled={command.locked || !reason.trim()}
                        onClick={() =>
                          void send("transfer.resolve", {
                            transferId: id,
                            itemId: d.itemId,
                            outcome,
                            reason,
                          })
                        }
                      >
                        {outcome === "RETURN" ? t.returned : t.writeoff}
                      </Button>
                    ))
                  )}
                </div>
              ))}
              {data.dispatch && !data.cancellation && (
                <Button
                  size="lg"
                  variant="outline"
                  disabled={command.locked || !reason.trim()}
                  onClick={() => void send("transfer.cancel", { transferId: id, reason })}
                >
                  {t.cancelTransfer}
                </Button>
              )}
            </>
          )}
        </>
      )}
      {(records.isError || detail.isError) && <p role="alert">{t.empty}</p>}
      <NativePagination
        offset={offset}
        hasMore={records.data?.state === "READY" && !!records.data.projection.page?.hasMore}
        busy={records.isFetching || command.locked}
        onChange={(page) => {
          setOffset(page);
          setId("");
        }}
      />
      <NativeCommandStatus command={command} />
    </section>
  );
}
