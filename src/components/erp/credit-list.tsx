import { nativeDailyError } from "@/locales/native-daily";
import { TransportError } from "@/data/native-repository";
import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createNativeRepository } from "@/data/native-repository";
import {
  useTestWorkspace,
  reviewActor,
  localCreditBalance,
  recordLocalRepayment,
  reverseLocalRepayment,
} from "@/data/test-workspace";
import { creditIsLate, canFollowCredit } from "@/domain/credit";
import { minorUnits, decimalValue, type StoreId } from "@/domain/erp";
import { useNativeTransport } from "./native-transport";
import { useErp } from "./context";
import { useNativeCommand } from "./use-native-command";
import { NativeCommandStatus } from "./native-command-status";
import type { NativeOperation } from "@/domain/native-commands";
type Row = {
  id: string;
  customer: string;
  store: StoreId;
  balance: string;
  due: string | null;
  state: string;
  payments: { id: string; amount: string; reversed: boolean }[];
};
export function LocalCreditList({ alertsOnly = false }: { alertsOnly?: boolean }) {
  const { scope } = useErp(),
    ws = useTestWorkspace(),
    a = reviewActor(ws);
  const rows: Row[] = ws.sales
    .filter((s) => s.creditAmount && (scope === "ALL" || scope === s.store))
    .map((s) => ({
      id: s.id,
      customer: s.customer,
      store: s.store,
      balance: localCreditBalance(s, ws),
      due: s.dueDate ?? null,
      state: minorUnits(localCreditBalance(s, ws)) === 0n ? "PAID" : "OPEN",
      payments: (ws.creditPayments ?? [])
        .filter((p) => p.saleId === s.id)
        .map((p) => ({
          id: p.id,
          amount: p.amount,
          reversed: !!ws.creditReversals?.some((r) => r.paymentId === p.id),
        })),
    }));
  return (
    <CreditRows
      rows={rows}
      alertsOnly={alertsOnly}
      owner={a?.role === "SUPER_ADMIN"}
      follow={(store) =>
        !!a &&
        canFollowCredit(
          a.role,
          a.role === "SUPER_ADMIN" ? "GLOBAL" : a.stores.includes(store) ? store : "",
          store,
        )
      }
      repay={async (r, amount, method, bankMethod) => {
        recordLocalRepayment(r.id, amount, method, bankMethod);
      }}
      reverse={async (id, reason) => {
        reverseLocalRepayment(id, reason);
      }}
    />
  );
}
export function NativeCreditList({
  store,
  alertsOnly = false,
}: {
  store: StoreId;
  alertsOnly?: boolean;
}) {
  const mutation = useNativeCommand();
  const transport = useNativeTransport(),
    repo = useMemo(() => createNativeRepository(transport), [transport]),
    [rows, setRows] = useState<Row[]>([]),
    [members, setMembers] = useState<{ role: string; store: string }[]>([]),
    [notice, setNotice] = useState("");
  const load = async () => {
    const [status, d] = await Promise.all([
      repo.status(),
      repo.debtList({ store, limit: 200, offset: 0 }),
    ]);
    setMembers(status.verified ? (status.memberships ?? []) : []);
    setRows(
      d.debts.map((r) => ({
        id: r.id,
        customer: r.customerName ?? "",
        store,
        balance: decimalValue(BigInt(r.balanceMinor ?? r.amountMinor)),
        due: r.dueDate ?? null,
        state: r.state,
        payments: r.repayments.map((p) => ({
          id: p.id,
          amount: decimalValue(BigInt(p.amountMinor)),
          reversed: p.state === "REVERSED",
        })),
      })),
    );
  };
  useEffect(() => {
    void load().catch(() => setNotice("—"));
  }, [repo, store]);
  const command = async (operation: string, payload: Record<string, unknown>) => {
    await mutation.send(operation as NativeOperation, { store, ...payload }, load);
  };
  const shift = async () =>
    (await repo.cashLedger({ store, limit: 100, offset: 0 })).shifts.find((s) => s.state === "OPEN")
      ?.id;
  return (
    <>
      {notice && <p role="status">{notice}</p>}
      <fieldset disabled={mutation.locked}>
        <CreditRows
          key={mutation.state === "IDLE" ? rows.map((r) => r.balance).join(":") : "pending"}
          rows={rows}
          owner={members.some((m) => m.role === "SUPER_ADMIN" && m.store === "GLOBAL")}
          alertsOnly={alertsOnly}
          follow={(s) => members.some((m) => canFollowCredit(m.role, m.store, s))}
          repay={async (r, amount, method, bankMethod) => {
            await command("repayment.record", {
              debtId: r.id,
              amount,
              method,
              ...(method === "Cash" ? { shiftId: await shift() } : { bankMethod }),
            });
          }}
          reverse={async (repaymentId, reason) => {
            await command("repayment.reverse", { repaymentId, reason, shiftId: await shift() });
          }}
        />
      </fieldset>
      <NativeCommandStatus command={mutation} />
    </>
  );
}
function CreditRows({
  rows,
  owner,
  follow,
  repay,
  reverse,
  alertsOnly,
}: {
  rows: Row[];
  owner: boolean;
  follow: (s: StoreId) => boolean;
  alertsOnly: boolean;
  repay: (
    r: Row,
    amount: string,
    method: "Cash" | "Bank",
    bankMethod: "VIREMENT" | "CCP_BARIDIMOB",
  ) => Promise<void>;
  reverse: (id: string, reason: string) => Promise<void>;
}) {
  const { t, lang } = useErp(),
    [selected, setSelected] = useState(""),
    [amount, setAmount] = useState(""),
    [method, setMethod] = useState<"Cash" | "Bank">("Cash"),
    [bank, setBank] = useState<"VIREMENT" | "CCP_BARIDIMOB">("VIREMENT"),
    [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  const late = rows.filter((r) => follow(r.store) && creditIsLate(r.due, minorUnits(r.balance)));
  const action = (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    let unknown = false;
    void fn()
      .then(() => {
        setNotice(t("cc.save"));
        setSelected("");
        setAmount("");
      })
      .catch((e) => {
        setNotice(
          nativeDailyError(
            lang,
            e instanceof TransportError ? e.code : e instanceof Error ? e.message : "REJECTED",
          ),
        );
        if (
          e instanceof TransportError &&
          (e.code === "OUTCOME_UNKNOWN" || e.code === "READBACK_FAILED")
        ) {
          unknown = true;
          return;
        }
        setBusy(false);
      })
      .then(() => {
        if (!unknown) setBusy(false);
      });
  };
  if (alertsOnly)
    return late.length ? (
      <section>
        <h2>{t("cc.follow")}</h2>
        <Button asChild variant="outline">
          <Link to="/debts">
            {t("cc.late")} · {late.length}
          </Link>
        </Button>
      </section>
    ) : null;
  return (
    <section className="grid gap-4">
      <h2>{t("cc.credit")}</h2>
      {late.length > 0 && (
        <p role="alert">
          {t("cc.late")} · {late.length}
        </p>
      )}
      {rows.map((r) => (
        <article className="border-b border-border py-3" key={r.id}>
          <strong>
            {r.customer} · {r.id}
          </strong>
          <p>
            {t("cc.balance")} · {r.balance} DZD · {r.state}
          </p>
          <p>
            {t("cc.due")} · {r.due ?? "—"}
          </p>
          {follow(r.store) && creditIsLate(r.due, minorUnits(r.balance)) && (
            <p role="alert">{t("cc.late")}</p>
          )}
          {r.state === "OPEN" && minorUnits(r.balance) > 0n && (
            <Button disabled={busy} onClick={() => setSelected(r.id)}>
              {t("cc.repay")}
            </Button>
          )}
          {r.payments.map((p) => (
            <div key={p.id}>
              <span>
                {p.amount} DZD · {p.reversed ? "↶" : t("cc.repay")}
              </span>
              {owner && !p.reversed && (
                <>
                  <Input
                    aria-label={t("cc.reason")}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                  <Button
                    disabled={busy || !reason.trim()}
                    variant="outline"
                    onClick={() => action(() => reverse(p.id, reason))}
                  >
                    {t("cc.reverse")}
                  </Button>
                </>
              )}
            </div>
          ))}
          {selected === r.id && (
            <form
              className="grid gap-3 my-3"
              onSubmit={(e) => {
                e.preventDefault();
                action(() => repay(r, amount, method, bank));
              }}
            >
              <Input
                required
                aria-label={t("debt.fRepayAmount")}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              <div className="flex gap-2">
                {(["Cash", "Bank"] as const).map((m) => (
                  <Button
                    type="button"
                    key={m}
                    variant={method === m ? "secondary" : "outline"}
                    onClick={() => setMethod(m)}
                  >
                    {t(m === "Cash" ? "pos.cash" : "pos.bank")}
                  </Button>
                ))}
              </div>
              {method === "Bank" && (
                <select
                  aria-label={t("pc.method")}
                  value={bank}
                  onChange={(e) => setBank(e.target.value as typeof bank)}
                >
                  <option value="VIREMENT">{t("pc.transfer")}</option>
                  <option value="CCP_BARIDIMOB">{t("pc.ccp")}</option>
                </select>
              )}
              <Button disabled={busy}>{t("cc.save")}</Button>
            </form>
          )}
        </article>
      ))}
      {notice && <p role="status">{notice}</p>}
    </section>
  );
}
