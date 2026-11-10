import { useEffect, useState } from "react";
import { useErp } from "./context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { batch4bText } from "@/locales/batch4b";
import { useNativeTransport } from "./native-transport";
import { permits } from "@/domain/permissions";
import { useNativeCommand } from "./use-native-command";
import { NativeCommandStatus } from "./native-command-status";
export function NativeUsedPurchase({ store, owner }: { store: "M01" | "M02"; owner: boolean }) {
  const native = true;
  const role = owner ? "SUPER_ADMIN" : "MANAGER";
  const command = useNativeCommand();
  const [allowed, setAllowed] = useState(false);
  const { lang } = useErp(),
    t = batch4bText(lang),
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
  useEffect(() => {
    let alive = true;
    void transport
      .status()
      .then(
        (s) =>
          alive &&
          setAllowed(
            s.verified &&
              s.memberships?.some((m) => permits(m.role, m.store, store, "used.purchase")) === true,
          ),
      )
      .catch(() => {});
    if (native && transport.dailyResources)
      void transport
        .dailyResources({ store })
        .then((r) => {
          const data = r as { catalog: { id: string; name: string; condition?: string }[] };
          if (alive) setModels(data.catalog.filter((c) => c.condition === "USED"));
        })
        .catch(() => {});
    if (transport.individualPurchases)
      void transport
        .individualPurchases({ store })
        .then((r) => {
          if (alive) setRows(r as Record<string, unknown>[]);
        })
        .catch(() => {});
    return () => {
      alive = false;
    };
  }, [native, transport, store, role]);
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
          shiftId: shift,
          photoPending: true,
        };
      await command.send("used.purchase", payload, async () => {
        if (!transport.individualPurchases) throw new Error("NOT_CONNECTED");
        const next = await transport.individualPurchases({ store });
        setRows(next as Record<string, unknown>[]);
        setShow(false);
        setPhoto("");
        setError("");
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="border-t border-border py-4">
      <Button size="lg" variant="outline" disabled={command.locked} onClick={() => setShow(!show)}>
        {t.used}
      </Button>
      {show && (
        <div className="grid sm:grid-cols-2 gap-3 mt-4">
          <label>
            {t.model}
            <select value={model} onChange={(e) => setModel(e.target.value)}>
              <option value="">—</option>
              {models.map((m) => (
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
          <div className="sm:col-span-2 space-y-2 border border-border p-3 rounded-md bg-muted/20">
            <label className="block text-sm font-medium">
              {t.photo}
              <Input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                capture="environment"
                className="mt-1"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (!f || f.size > 10000000) return;
                  const r = new FileReader();
                  r.onload = () => {
                    setPhoto(String(r.result));
                    setPending(true);
                  };
                  r.readAsDataURL(f);
                }}
              />
            </label>
            {photo && (
              <div className="relative inline-block mt-2">
                <img className="max-h-36 rounded border border-border shadow-sm" src={photo} alt={t.photo} />
                <Button
                  size="sm"
                  variant="destructive"
                  className="mt-1 block"
                  onClick={() => setPhoto("")}
                >
                  {t.cancel}
                </Button>
              </div>
            )}
            <label className="flex items-center gap-2 text-sm text-muted-foreground mt-2 cursor-pointer">
              <input
                type="checkbox"
                checked={pending}
                onChange={(e) => setPending(e.target.checked)}
              />
              {t.pending}
            </label>
          </div>
          <Button
            size="lg"
            disabled={
              busy ||
              command.locked ||
              !model ||
              !surname ||
              !givenName ||
              !phone ||
              !imei ||
              !serial ||
              !amount ||
              (!pending && !photo)
            }
            onClick={() => void save()}
          >
            {t.save}
          </Button>
          <Button
            size="lg"
            variant="outline"
            disabled={command.locked}
            onClick={() => setShow(false)}
          >
            {t.cancel}
          </Button>
        </div>
      )}
      {error && <p role="alert">{error}</p>}
      <NativeCommandStatus command={command} />
      {rows
        .filter((r) => r["store_id"] === store)
        .map((r) => (
          <p key={String(r["phone_id"])}>
            {String(r["surname"])} {String(r["given_name"])} · {String(r["phone"])}
            {role === "SUPER_ADMIN" && r["amount_minor"]
              ? ` · ${(Number(r["amount_minor"]) / 100).toFixed(2)} DZD`
              : ""}
          </p>
        ))}
    </section>
  );
}
