import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { batch4bText } from "@/locales/batch4b";
import { useErp } from "./context";
export function SavActions({
  approve,
  manufacturer,
  closed,
  onCommand,
}: {
  approve: boolean;
  manufacturer: boolean;
  closed: boolean;
  onCommand: (op: "sav.track" | "sav.outcome", payload: Record<string, unknown>) => Promise<void>;
}) {
  const { lang } = useErp(),
    t = batch4bText(lang),
    [note, setNote] = useState(""),
    [status, setStatus] = useState("IN_HOUSE"),
    [need, setNeed] = useState(false),
    [outcome, setOutcome] = useState("REPAIR_RETURN"),
    [method, setMethod] = useState<"Cash" | "Bank">("Cash"),
    [bank, setBank] = useState("VIREMENT"),
    [shift, setShift] = useState(""),
    [amount, setAmount] = useState(""),
    [declined, setDeclined] = useState(false),
    [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const run = (op: "sav.track" | "sav.outcome", payload: Record<string, unknown>) => {
    setBusy(true);
    void onCommand(op, payload)
      .then(() => setError(""))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setBusy(false));
  };
  if (closed) return null;
  return (
    <div className="grid gap-3 mt-4">
      <label>
        {t.note}
        <Input value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      <label>
        {t.status}
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          {(
            [
              "IN_HOUSE",
              "EXTERNAL",
              "IN_REPAIR",
              "READY",
              ...(manufacturer ? ["SENT_DISTRIBUTOR", "RETURNED"] : []),
            ] as (keyof typeof t)[]
          ).map((s) => (
            <option key={s} value={s}>
              {t[s]}
            </option>
          ))}
        </select>
      </label>
      <label className="flex gap-2">
        <input type="checkbox" checked={need} onChange={(e) => setNeed(e.target.checked)} />
        {t.need}
      </label>
      <Button
        size="lg"
        disabled={busy || !note}
        onClick={() => run("sav.track", { status, note, paidRepairNeeded: need })}
      >
        {t.save}
      </Button>
      {approve && (
        <>
          <label>
            {t.outcome}
            <select value={outcome} onChange={(e) => setOutcome(e.target.value)}>
              {(["REPAIR_RETURN", "REFUND", "REFUSAL"] as const).map((s) => (
                <option key={s} value={s}>
                  {t[s]}
                </option>
              ))}
            </select>
          </label>
          {outcome === "REFUND" && (
            <label className="flex gap-2">
              <input
                type="checkbox"
                checked={declined}
                onChange={(e) => setDeclined(e.target.checked)}
              />
              {t.refundDeclined}
            </label>
          )}
          {outcome === "REFUND" && declined && (
            <label>
              {t.declineReason}
              <Input value={reason} onChange={(e) => setReason(e.target.value)} />
            </label>
          )}
          {outcome === "REFUND" && !declined && (
            <>
              <label>
                {t.amount}
                <Input
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </label>
              <select
                aria-label={t.cash}
                value={method}
                onChange={(e) => setMethod(e.target.value === "Cash" ? "Cash" : "Bank")}
              >
                <option value="Cash">{t.Cash}</option>
                <option value="Bank">{t.Bank}</option>
              </select>
              {method === "Cash" ? (
                <label>
                  {t.cash}
                  <Input
                    aria-label="Shift"
                    value={shift}
                    onChange={(e) => setShift(e.target.value)}
                  />
                </label>
              ) : (
                <select value={bank} onChange={(e) => setBank(e.target.value)}>
                  <option value="VIREMENT">Virement</option>
                  <option value="CCP_BARIDIMOB">CCP / BaridiMob</option>
                </select>
              )}
              <label>
                {t.remainderReason}
                <Input value={reason} onChange={(e) => setReason(e.target.value)} />
              </label>
            </>
          )}
          <Button
            size="lg"
            disabled={busy || !note || (outcome === "REFUND" && declined && !reason.trim())}
            onClick={() =>
              run("sav.outcome", {
                outcome,
                note,
                ...(outcome === "REFUND" && declined
                  ? { refundDeclined: true, declineReason: reason.trim() }
                  : {}),
                ...(outcome === "REFUND" && !declined && amount
                  ? {
                      amount,
                      method,
                      ...(method === "Cash" ? { shiftId: shift } : { bankMethod: bank }),
                      ...(reason.trim() ? { declineReason: reason.trim() } : {}),
                    }
                  : {}),
              })
            }
          >
            {t.outcome}
          </Button>
        </>
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
