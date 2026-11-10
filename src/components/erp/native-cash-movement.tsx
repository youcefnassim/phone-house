import { nativeDailyError } from "@/locales/native-daily";
import { TransportError } from "@/data/native-repository";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createNativeRepository } from "@/data/native-repository";

import { permits } from "@/domain/permissions";

import { useNativeTransport } from "./native-transport";
import { useErp } from "./context";
import type { StoreId } from "@/domain/erp";
import { useNativeCommand } from "./use-native-command";
import { NativeCommandStatus } from "./native-command-status";
export function NativeCashMovement({
  store,
  shiftId,
  onReadback,
}: {
  store: StoreId;
  shiftId: string;
  onReadback: () => Promise<unknown>;
}) {
  const mutation = useNativeCommand();
  const transport = useNativeTransport(),
    repository = useMemo(() => createNativeRepository(transport), [transport]);
  const [reasons, setReasons] = useState<string[]>([]),
    [allowed, setAllowed] = useState(false);
  useEffect(() => {
    let live = true;
    void Promise.all([repository.status(), repository.settings(store)])
      .then(([s, settings]) => {
        if (live) {
          setAllowed(
            s.verified &&
              (s.memberships ?? []).some((m) => permits(m.role, m.store, store, "cash.movement")),
          );
          setReasons(settings["cash.movementReasons"]);
        }
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [repository, store]);
  if (!allowed) return null;
  return (
    <>
      <fieldset disabled={mutation.locked}>
        <MovementForm
          key={mutation.state === "IDLE" ? "ready" : "pending"}
          reasons={reasons}
          submit={async (v) => {
            await mutation.send("cash.movement", { store, shiftId, ...v }, async () => {
              await onReadback();
            });
          }}
        />
      </fieldset>
      <NativeCommandStatus command={mutation} />
    </>
  );
}
function MovementForm({
  reasons,
  submit,
}: {
  reasons: string[];
  submit: (v: {
    direction: "IN" | "OUT";
    amount: string;
    reason: string;
    note: string;
  }) => Promise<void>;
}) {
  const { t, lang } = useErp(),
    [direction, setDirection] = useState<"IN" | "OUT">("IN"),
    [amount, setAmount] = useState(""),
    [reason, setReason] = useState(""),
    [note, setNote] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  if (!reasons.length)
    return (
      <p>
        {t("cc.movements")} · {t("pc.configure")}
      </p>
    );
  return (
    <form
      className="grid gap-3 my-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (busy) return;
        setBusy(true);
        let unknown = false;
        void submit({ direction, amount, reason, note })
          .then(() => {
            setAmount("");
            setNote("");
            setMessage(t("cc.save"));
          })
          .catch((e) => {
            setMessage(
              nativeDailyError(
                lang,
                e instanceof TransportError ? e.code : e instanceof Error ? e.message : "REJECTED",
              ),
            );
            unknown =
              e instanceof TransportError &&
              (e.code === "OUTCOME_UNKNOWN" || e.code === "READBACK_FAILED");
          })
          .finally(() => {
            if (!unknown) setBusy(false);
          });
      }}
    >
      <h2>{t("cc.movements")}</h2>
      <div className="flex gap-2">
        {(["IN", "OUT"] as const).map((d) => (
          <Button
            type="button"
            disabled={busy}
            key={d}
            variant={direction === d ? "secondary" : "outline"}
            onClick={() => setDirection(d)}
          >
            {t(d === "IN" ? "cc.in" : "cc.out")}
          </Button>
        ))}
      </div>
      <label>
        {t("cash.movementAmount")}
        <Input
          aria-label={t("cash.movementAmount")}
          required
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          disabled={busy}
        />
      </label>
      <label>
        {t("cc.reason")}
        <select
          aria-label={t("cc.reason")}
          required
          value={reason}
          disabled={busy}
          onChange={(e) => setReason(e.target.value)}
        >
          <option value="">—</option>
          {reasons.map((r) => (
            <option key={r} value={r}>
              {r === "Autre" ? t("cc.other") : r}
            </option>
          ))}
        </select>
      </label>
      <label>
        {t("cc.note")}
        <Input
          aria-label={t("cc.note")}
          required={reason === "Autre"}
          value={note}
          disabled={busy}
          onChange={(e) => setNote(e.target.value)}
        />
      </label>
      <Button disabled={busy}>{t("cc.save")}</Button>
      {message && <p role="status">{message}</p>}
    </form>
  );
}
