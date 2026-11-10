import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  boxStates,
  buildCheckUrl,
  settingSchemas,
  type AppSettings,
  type BoxState,
  type SettingKey,
} from "@/domain/intake";
import { intakeText, type IntakeKey } from "@/locales/intake";
import { useErp } from "./context";

export function useIntakeText() {
  const { lang } = useErp();
  return (k: IntakeKey) => intakeText(lang, k);
}

/** Opens the owner's check page; hidden (with a Settings hint) while the template is empty. */
export function VerifyButton({
  template,
  serial,
  imei,
}: {
  template: string;
  serial?: string;
  imei?: string;
}) {
  const x = useIntakeText();
  if (!template.trim())
    return (
      <small className="block" data-testid="verify-hint">
        {x("verify")}: {x("configureHint")}
      </small>
    );
  const url = buildCheckUrl(template, { serial: serial ?? "", imei: imei ?? "" });
  return url ? (
    <Button asChild size="lg" variant="outline">
      <a href={url} target="_blank" rel="noopener noreferrer" title={x("verifyHint")}>
        <ExternalLink />
        {x("verify")}
      </a>
    </Button>
  ) : (
    <Button type="button" size="lg" variant="outline" disabled title={x("verifyHint")}>
      <ExternalLink />
      {x("verify")}
    </Button>
  );
}

export function BoxStatePicker({
  value,
  onChange,
  disabled,
}: {
  value: BoxState | "";
  onChange: (v: BoxState) => void;
  disabled?: boolean;
}) {
  const x = useIntakeText();
  return (
    <div role="group" aria-label={x("boxState")} className="grid gap-1">
      <span className="form-label">{x("boxState")}</span>
      <div className="grid grid-cols-3 gap-2">
        {boxStates.map((s) => (
          <Button
            key={s}
            type="button"
            size="lg"
            aria-pressed={value === s}
            variant={value === s ? "default" : "outline"}
            disabled={disabled}
            onClick={() => onChange(s)}
          >
            {x(s)}
          </Button>
        ))}
      </div>
    </div>
  );
}

/** Owner settings form ("Intake"). Staff see values read-only. */
export function IntakeSettingsForm({
  settings,
  canEdit,
  onSave,
}: {
  settings: AppSettings;
  canEdit: boolean;
  onSave: <K extends SettingKey>(key: K, value: AppSettings[K]) => Promise<unknown> | unknown;
}) {
  const x = useIntakeText();
  const [url, setUrl] = useState(settings["intake.checkUrlTemplate"]);
  const [boxes, setBoxes] = useState(settings["intake.boxTrackedModels"]);
  const [cats, setCats] = useState(settings["intake.accessoryCategories"].join("\n"));
  const [w, setW] = useState(String(settings["labels.sizeMm"]?.width ?? ""));
  const [h, setH] = useState(String(settings["labels.sizeMm"]?.height ?? ""));
  const [status, setStatus] = useState("");
  useEffect(() => {
    setUrl(settings["intake.checkUrlTemplate"]);
    setBoxes(settings["intake.boxTrackedModels"]);
    setCats(settings["intake.accessoryCategories"].join("\n"));
    setW(String(settings["labels.sizeMm"]?.width ?? ""));
    setH(String(settings["labels.sizeMm"]?.height ?? ""));
  }, [settings]);
  const save = async () => {
    setStatus("");
    try {
      const categories = cats
        .split("\n")
        .map((c) => c.trim())
        .filter(Boolean);
      const size = w.trim() || h.trim() ? { width: Number(w), height: Number(h) } : null;
      const rows = boxes.filter((b) => b.brand.trim());
      const checks = [
        settingSchemas["intake.checkUrlTemplate"].safeParse(url),
        settingSchemas["intake.boxTrackedModels"].safeParse(rows),
        settingSchemas["intake.accessoryCategories"].safeParse(categories),
        settingSchemas["labels.sizeMm"].safeParse(size),
      ];
      if (checks.some((c) => !c.success)) throw new Error("invalid");
      await onSave("intake.checkUrlTemplate", url.trim());
      await onSave("intake.boxTrackedModels", rows);
      await onSave("intake.accessoryCategories", categories);
      await onSave("labels.sizeMm", size);
      setStatus(x("saved"));
    } catch {
      setStatus("!");
    }
  };
  return (
    <section aria-label={x("section")}>
      <h2>{x("section")}</h2>
      <p>{x("sectionText")}</p>
      {!canEdit && <p role="note">{x("ownerOnly")}</p>}
      <form
        className="draft-form"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <label className="form-label">
          {x("checkUrl")}
          <Input
            dir="ltr"
            value={url}
            disabled={!canEdit}
            placeholder="https://…/{serial}"
            onChange={(e) => setUrl(e.target.value)}
          />
        </label>
        <fieldset className="grid gap-2">
          <legend className="form-label">{x("boxTracked")}</legend>
          {boxes.map((b, i) => (
            <div className="grid grid-cols-[1fr_1fr_auto] gap-2" key={i}>
              <Input
                aria-label={x("brand")}
                value={b.brand}
                disabled={!canEdit}
                onChange={(e) =>
                  setBoxes(boxes.map((r, j) => (j === i ? { ...r, brand: e.target.value } : r)))
                }
              />
              <Input
                aria-label={x("series")}
                placeholder={x("series")}
                value={b.series}
                disabled={!canEdit}
                onChange={(e) =>
                  setBoxes(boxes.map((r, j) => (j === i ? { ...r, series: e.target.value } : r)))
                }
              />
              <Button
                type="button"
                variant="outline"
                disabled={!canEdit}
                onClick={() => setBoxes(boxes.filter((_, j) => j !== i))}
              >
                {x("remove")}
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            disabled={!canEdit}
            onClick={() => setBoxes([...boxes, { brand: "", series: "" }])}
          >
            {x("addRow")}
          </Button>
        </fieldset>
        <label className="form-label">
          {x("categories")}
          <textarea
            rows={7}
            value={cats}
            disabled={!canEdit}
            onChange={(e) => setCats(e.target.value)}
          />
        </label>
        <fieldset className="grid grid-cols-2 gap-2">
          <legend className="form-label">{x("labelSize")}</legend>
          <Input
            aria-label={x("width")}
            placeholder={x("width")}
            inputMode="numeric"
            value={w}
            disabled={!canEdit}
            onChange={(e) => setW(e.target.value)}
          />
          <Input
            aria-label={x("height")}
            placeholder={x("height")}
            inputMode="numeric"
            value={h}
            disabled={!canEdit}
            onChange={(e) => setH(e.target.value)}
          />
        </fieldset>
        {canEdit && (
          <Button size="lg" type="submit">
            {x("save")}
          </Button>
        )}
        {status && <p role="status">{status}</p>}
      </form>
    </section>
  );
}
