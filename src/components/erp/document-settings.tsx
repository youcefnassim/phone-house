import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { settingSchemas, type AppSettings, type SettingKey } from "@/domain/intake";
import { legalChecklist } from "@/domain/warranty-documents";
import { documentText } from "@/locales/warranty-documents";
import { useErp } from "./context";
import { nativeCompletenessText } from "@/locales/native-completeness";

const fields: [SettingKey, string][] = [
  ["company.legalName", "legalName"],
  ["company.legalForm", "legalForm"],
  ["company.storeAddress", "address"],
  ["company.rc", "RC"],
  ["company.nif", "NIF"],
  ["company.nis", "NIS"],
  ["company.ai", "AI"],
  ["company.contacts", "contacts"],
  ["warranty.conditions", "conditions"],
];
export function DocumentSettingsForm({
  settings,
  canEdit,
  onSave,
}: {
  settings: AppSettings;
  canEdit: boolean;
  onSave: (key: SettingKey, value: unknown) => void | Promise<void>;
}) {
  const { lang, t } = useErp();
  const x = documentText[lang];
  const labels = nativeCompletenessText(lang);
  const [draft, setDraft] = useState(settings);
  useEffect(() => setDraft(settings), [settings]);
  const [error, setError] = useState("");
  const save = async (key: SettingKey) => {
    const value = settingSchemas[key].safeParse(draft[key]);
    if (!value.success) {
      setError(x.configure);
      return;
    }
    try {
      await onSave(key, value.data);
      setError("");
    } catch {
      setError(x.configure);
    }
  };
  const patch = (key: SettingKey, value: unknown) => setDraft((s) => ({ ...s, [key]: value }));
  return (
    <>
      <section>
        <h3>{t("pc.limit")}</h3>
        <input
          aria-label={t("pc.limit")}
          disabled={!canEdit}
          value={draft["pos.discountLimitDzd"]}
          onChange={(e) => patch("pos.discountLimitDzd", e.target.value)}
        />
        {canEdit && <Button onClick={() => void save("pos.discountLimitDzd")}>{x.save}</Button>}
      </section>
      <section>
        <h2>{x.section}</h2>
        {(["M01", "M02"] as const).map((store) => {
          const checks = legalChecklist(draft, store);
          return (
            <div key={store}>
              <h3>
                {store} · {x.ready} : {checks.filter((c) => c.ready).length} / 7
              </h3>
              <ul>
                {checks.map((c) => (
                  <li key={c.key}>
                    {c.ready ? "✓" : "—"} {c.label}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </section>
      {fields.map(([key, labelKey]) => {
        const label = labels[labelKey as keyof typeof labels] ?? labelKey;
        return (
          <section key={key}>
            <h3>{label}</h3>
            {typeof draft[key] === "string" ? (
              <input
                aria-label={label}
                disabled={!canEdit}
                value={String(draft[key])}
                onChange={(e) => patch(key, e.target.value)}
              />
            ) : (
              Object.entries(draft[key] ?? {}).map(([part, value]) => (
                <label key={part}>
                  {part}
                  <textarea
                    aria-label={`${label} ${part}`}
                    disabled={!canEdit}
                    value={String(value)}
                    onChange={(e) =>
                      patch(key, { ...(draft[key] as object), [part]: e.target.value })
                    }
                  />
                </label>
              ))
            )}
            {canEdit && (
              <Button className="mt-2" onClick={() => void save(key)}>
                {x.save}
              </Button>
            )}
          </section>
        );
      })}
      <section>
        <h3>{labels.numbering}</h3>
        <select
          aria-label={labels.numbering}
          disabled={!canEdit}
          value={draft["documents.invoiceNumbering"]}
          onChange={(e) => patch("documents.invoiceNumbering", e.target.value)}
        >
          <option value="LEGAL_SEQUENCE">FA — {labels.sequence}</option>
          <option value="PUBLIC_REF">PH — {labels.publicRef}</option>
        </select>
        {canEdit && (
          <Button className="mt-2" onClick={() => void save("documents.invoiceNumbering")}>
            {x.save}
          </Button>
        )}
      </section>
      <section>
        <h3>{x.rules}</h3>
        {draft["warranty.rules"].map((rule, i) => {
          const change = (v: object) =>
            patch(
              "warranty.rules",
              draft["warranty.rules"].map((r, n) => (n === i ? { ...r, ...v } : r)),
            );
          return (
            <div className="operation-form-grid mb-4" key={i}>
              <label>
                {x.brand}
                <input
                  disabled={!canEdit}
                  value={rule.brand}
                  onChange={(e) => change({ brand: e.target.value })}
                />
              </label>
              <label>
                {x.series}
                <input
                  disabled={!canEdit}
                  value={rule.series}
                  onChange={(e) => change({ series: e.target.value })}
                />
              </label>
              <label>
                {x.provider}
                <select
                  disabled={!canEdit}
                  value={rule.provider}
                  onChange={(e) => change({ provider: e.target.value })}
                >
                  <option value="SHOP">{x.shop}</option>
                  <option value="MANUFACTURER">{x.manufacturer}</option>
                </select>
              </label>
              <label>
                {x.months}
                <select
                  disabled={!canEdit}
                  value={rule.months}
                  onChange={(e) => change({ months: Number(e.target.value) })}
                >
                  {[1, 3, 6, 12].map((m) => (
                    <option key={m}>{m}</option>
                  ))}
                </select>
              </label>
              {canEdit && (
                <Button
                  variant="outline"
                  onClick={() =>
                    patch(
                      "warranty.rules",
                      draft["warranty.rules"].filter((_, n) => n !== i),
                    )
                  }
                >
                  {x.remove}
                </Button>
              )}
            </div>
          );
        })}
        {canEdit && (
          <div className="form-actions">
            <Button
              variant="outline"
              onClick={() =>
                patch("warranty.rules", [
                  ...draft["warranty.rules"],
                  { brand: "", series: "", provider: "SHOP", months: 12 },
                ])
              }
            >
              {x.add}
            </Button>
            <Button onClick={() => void save("warranty.rules")}>{x.save}</Button>
          </div>
        )}
      </section>
      <section className="grid gap-3 my-6">
        <h2>{t("cc.reasons")}</h2>
        <textarea
          aria-label={t("cc.reasons")}
          disabled={!canEdit}
          value={draft["cash.movementReasons"].join("\n")}
          onChange={(e) =>
            patch("cash.movementReasons", e.target.value.split("\n").filter(Boolean))
          }
        />
        {canEdit && <Button onClick={() => void save("cash.movementReasons")}>{x.save}</Button>}
      </section>
      {error && <p role="alert">{error}</p>}
    </>
  );
}
