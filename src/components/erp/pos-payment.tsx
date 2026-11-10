import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { BankMethod, PaymentMode } from "@/domain/pos-settlement";
import { useErp } from "./context";
export interface PosPaymentValue {
  credit: string;
  dueDate: string;
  mode: PaymentMode;
  cash: string;
  bank: string;
  received: string;
  method: BankMethod | "";
  discount: string;
}
export const emptyPosPayment: PosPaymentValue = {
  credit: "",
  dueDate: "",
  mode: "Cash",
  cash: "",
  bank: "",
  received: "",
  method: "",
  discount: "",
};
export function PosPaymentFields({
  value,
  onChange,
  limit,
  disabled = false,
}: {
  value: PosPaymentValue;
  onChange: (v: PosPaymentValue) => void;
  limit: string;
  disabled?: boolean;
}) {
  const { t } = useErp();
  const patch = (v: Partial<PosPaymentValue>) => onChange({ ...value, ...v });
  return (
    <section className="payment-panel grid gap-3 my-4">
      <label>
        {t("cc.amount")}
        <Input
          aria-label={t("cc.amount")}
          value={value.credit}
          disabled={disabled}
          inputMode="decimal"
          onChange={(e) => patch({ credit: e.target.value })}
        />
      </label>
      {value.credit && value.credit !== "0" && (
        <label>
          {t("cc.due")}
          <Input
            aria-label={t("cc.due")}
            type="date"
            value={value.dueDate}
            disabled={disabled}
            onChange={(e) => patch({ dueDate: e.target.value })}
          />
        </label>
      )}
      <div className="flex flex-wrap gap-2">
        {(["Cash", "Bank", "Split"] as const).map((mode) => (
          <Button
            type="button"
            key={mode}
            disabled={disabled}
            variant={value.mode === mode ? "secondary" : "outline"}
            aria-pressed={value.mode === mode}
            onClick={() => patch({ mode })}
          >
            {t(mode === "Cash" ? "pos.cash" : mode === "Bank" ? "pos.bank" : "pc.split")}
          </Button>
        ))}
      </div>
      {value.mode === "Split" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <label>
            {t("pc.cash")}
            <Input
              aria-label={t("pc.cash")}
              value={value.cash}
              disabled={disabled}
              onChange={(e) => patch({ cash: e.target.value })}
            />
          </label>
          <label>
            {t("pc.bank")}
            <Input
              aria-label={t("pc.bank")}
              value={value.bank}
              disabled={disabled}
              onChange={(e) => patch({ bank: e.target.value })}
            />
          </label>
        </div>
      )}
      {value.mode !== "Bank" && (
        <label>
          {t("pc.received")}
          <Input
            aria-label={t("pc.received")}
            value={value.received}
            disabled={disabled}
            onChange={(e) => patch({ received: e.target.value })}
          />
        </label>
      )}
      {value.mode !== "Cash" && (
        <label>
          {t("pc.method")}
          <select
            aria-label={t("pc.method")}
            value={value.method}
            disabled={disabled}
            onChange={(e) => patch({ method: e.target.value as BankMethod | "" })}
          >
            <option value="">—</option>
            <option value="VIREMENT">{t("pc.transfer")}</option>
            <option value="CCP_BARIDIMOB">{t("pc.ccp")}</option>
          </select>
        </label>
      )}
      {limit ? (
        <label>
          {t("pc.discount")}
          <Input
            aria-label={t("pc.discount")}
            value={value.discount}
            disabled={disabled}
            onChange={(e) => patch({ discount: e.target.value })}
          />
        </label>
      ) : (
        <p className="field-hint">
          {t("pc.discount")} · {t("pc.configure")}
        </p>
      )}
    </section>
  );
}
