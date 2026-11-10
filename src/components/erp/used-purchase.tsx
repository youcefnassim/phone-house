import { reviewActor } from "@/data/test-workspace";
import { useEffect, useState } from "react";
import { useErp } from "./context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { batch4bText } from "@/locales/batch4b";
import { useTestWorkspace, openShiftFor } from "@/data/test-workspace";
import { buyLocalIndividual, localIndividualPurchases } from "@/data/local-individual-purchase";
import { useNativeTransport } from "./native-transport";
import { permits } from "@/domain/permissions";
export function UsedPurchase({
  native = false,
  store,
}: {
  native?: boolean;
  store: "M01" | "M02";
}) {
  const role = reviewActor()?.role ?? "SELLER";
  const { lang } = useErp(),
    t = batch4bText(lang),
    ws = useTestWorkspace(),
    transport = useNativeTransport(),
    [show, setShow] = useState(false),
    [model, setModel] = useState(""),
    [surname, setSurname] = useState(""),
    [givenName, setGiven] = useState(""),
    [phone, setPhone] = useState(""),
    [imei, setImei] = useState(""),
    [serial, setSerial] = useState(""),
    [amount, setAmount] = useState(""),
    [photo, setPhoto] = useState(""),
    [shift, setShift] = useState(""),
    [pending, setPending] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [rows, setRows] = useState<Record<string, unknown>[]>([]),
    [models, setModels] = useState<{ id: string; name: string }[]>([]);
  const allowed = permits(role, role === "SUPER_ADMIN" ? "GLOBAL" : store, store, "used.purchase");
  useEffect(() => {
    let alive = true;
    if (native && transport.dailyResources)
      void transport.dailyResources({ store }).then((r) => {
        const data = r as { catalog: { id: string; name: string; condition?: string }[] };
        if (alive) setModels(data.catalog.filter((c) => c.condition === "USED"));
      });
    if (!native && role !== "SELLER")
      void localIndividualPurchases()
        .then((r) => {
          if (alive) setRows(r);
        })
        .catch(() => {});
    return () => {
      alive = false;
    };
  }, [native, transport, store, role, ws]);
  if (!allowed) return null;
  const save = async () => {
    setBusy(true);
    try {
      const id = crypto.randomUUID(),
        payload = {
          store,
          id,
          catalogId: model,
          barcode: id,
          imei,
          serial,
          surname,
          givenName,
          phone,
          amount,
          shiftId: native ? shift : (openShiftFor(store)?.id ?? ""),
          photoPending: true,
        };
      if (native)
        await transport.execute({
          version: "native-2026-11-06",
          key: "cmd-" + id,
          operation: "used.purchase",
          payload,
        });
      else await buyLocalIndividual(payload, photo);
      setShow(false);
      setPhoto("");
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="border-t border-border py-4">
      <Button size="lg" variant="outline" onClick={() => setShow(!show)}>
        {t.used}
      </Button>
      {show && (
        <div className="grid sm:grid-cols-2 gap-3 mt-4">
          <label>
            {t.model}
            <select value={model} onChange={(e) => setModel(e.target.value)}>
              <option value="">—</option>
              {(native
                ? models
                : (ws.phoneModels ?? [])
                    .filter((m) => m.condition === "USED")
                    .map((m) => ({ id: m.id, name: [m.brand, m.model, m.storage].join(" ") }))
              ).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
          {[
            [t.surname, surname, setSurname],
            [t.givenName, givenName, setGiven],
            [t.phone, phone, setPhone],
            [t.imei, imei, setImei],
            [t.serial, serial, setSerial],
            [t.amount, amount, setAmount],
            ...(native ? [[t.cash, shift, setShift]] : []),
          ].map(([label, value, setter]) => (
            <label key={String(label)}>
              {String(label)}
              <Input
                value={String(value)}
                onChange={(e) => (setter as (v: string) => void)(e.target.value)}
              />
            </label>
          ))}
          {native ? (
            <label>
              <input
                type="checkbox"
                checked={pending}
                onChange={(e) => setPending(e.target.checked)}
              />
              {t.pending}
            </label>
          ) : (
            <label>
              {t.photo}
              <Input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                capture="environment"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (!f || f.size > 10000000) return;
                  const r = new FileReader();
                  r.onload = () => setPhoto(String(r.result));
                  r.readAsDataURL(f);
                }}
              />
              {photo && <img className="max-h-32" src={photo} alt={t.photo} />}
            </label>
          )}
          <Button
            size="lg"
            disabled={
              busy ||
              !model ||
              !surname ||
              !givenName ||
              !phone ||
              !imei ||
              !serial ||
              !amount ||
              (native ? !pending : !photo)
            }
            onClick={() => void save()}
          >
            {t.save}
          </Button>
          <Button size="lg" variant="outline" onClick={() => setShow(false)}>
            {t.cancel}
          </Button>
        </div>
      )}
      {error && <p role="alert">{error}</p>}
      {!native &&
        rows
          .filter((r) => r["store"] === store)
          .map((r) => (
            <p key={String(r["id"])}>
              {String(r["surname"])} {String(r["givenName"])} · {String(r["phone"])}
              {role === "SUPER_ADMIN" && r["amount"] ? ` · ${String(r["amount"])} DZD` : ""}
            </p>
          ))}
    </section>
  );
}
