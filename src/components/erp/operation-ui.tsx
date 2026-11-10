import { localizeMessage } from "@/locales/messages";
import { displayName } from "@/locales/display";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { z } from "zod";
import { Plus, LockKeyhole, Barcode, ScanLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { storeLabel, type StoreId } from "@/domain/erp";
import { useErp } from "./context";
import { Scanner } from "./scanner";
import type { ScanTarget } from "@/domain/scan-payload";
import { IntakeProgress } from "./visual-feedback";

export interface DraftField {
  scan?: ScanTarget;
  name: string;
  label: string;
  options?: string[];
  optionLabels?: Record<string, string>;
  suggestions?: string[];
  type?: string;
  hint?: string;
  readOnly?: boolean;
  suggestionsFor?: (values: Record<string, string>) => string[];
}
export function OperationDraftForm<T>({
  title,
  fields,
  schema,
  defaults,
  onSave,
  onCancel,
  extraValidate,
  optionalFields = [],
  submitLabel,
  onScan,
  onFieldChange,
  children,
}: {
  title: string;
  fields: DraftField[];
  schema: z.ZodType<T, z.ZodTypeDef, unknown>;
  defaults?: Record<string, string>;
  onSave: (value: T) => void;
  onCancel: () => void;
  extraValidate?: (value: T) => string | undefined;
  optionalFields?: string[];
  submitLabel?: string;
  onScan?: (values: Partial<Record<ScanTarget, string>>) => void;
  onFieldChange?: (name: string, value: string) => void;
  children?: ReactNode;
}) {
  const { t, lang } = useErp();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [values, setValues] = useState<Record<string, string>>(defaults ?? {});
  const busy = useRef(false);
  const [saving, setSaving] = useState(false);
  const [scan, setScan] = useState<ScanTarget | null>(null);
  const visibleOptional = optionalFields.filter(
    (name) =>
      name !== "serial" || !fields.some((f) => f.name === "imei1") || Boolean(values["imei1"]),
  );
  const formRef = useRef<HTMLFormElement>(null);
  const optionalRef = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const first = Object.keys(errors).find((key) => key !== "form");
    if (first) {
      if (optionalFields.includes(first) && optionalRef.current) optionalRef.current.open = true;
      const control = formRef.current?.elements.namedItem(first);
      if (control instanceof HTMLElement) control.focus();
    }
  }, [errors, optionalFields]);
  const renderField = (field: DraftField) => (
    <label key={field.name}>
      <span className="scan-field-heading">
        {field.label}
        {field.scan && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            aria-label={`${t("scan.title")} ${field.label}`}
            onClick={() => setScan(field.scan ?? null)}
          >
            <ScanLine />
            {t("scan.title")}
          </Button>
        )}
      </span>
      {field.options && !field.readOnly ? (
        <select
          aria-label={field.label}
          name={field.name}
          defaultValue={defaults?.[field.name] ?? ""}
          aria-invalid={!!errors[field.name]}
          aria-describedby={`${title}-${field.name}-hint`}
        >
          <option value="">{t("op.select")}</option>
          {field.options.map((value) => (
            <option key={value} value={value}>
              {field.optionLabels?.[value] ??
                (value === "M01" || value === "M02"
                  ? storeLabel(value as StoreId)
                  : displayName(lang, localizeMessage(lang, value)).replaceAll("_", " "))}
            </option>
          ))}
        </select>
      ) : (
        <input
          aria-label={field.label}
          name={field.name}
          type={field.type ?? "text"}
          list={field.suggestions ? `suggest-${field.name}` : undefined}
          dir={
            [
              "imei1",
              "imei2",
              "serial",
              "barcode",
              "salePrice",
              "amount",
              "quantity",
              "battery",
              "sku",
            ].includes(field.name)
              ? "ltr"
              : undefined
          }
          readOnly={field.readOnly}
          defaultValue={defaults?.[field.name] ?? ""}
          aria-invalid={!!errors[field.name]}
          aria-describedby={`${title}-${field.name}-hint`}
          inputMode={
            ["quantity", "imei1", "imei2", "battery"].includes(field.name)
              ? "numeric"
              : ["amount", "salePrice"].includes(field.name)
                ? "decimal"
                : undefined
          }
        />
      )}
      {field.suggestions && (
        <datalist id={`suggest-${field.name}`}>
          {(field.suggestionsFor?.(values) ?? field.suggestions).map((value) => (
            <option key={value} value={value} />
          ))}
        </datalist>
      )}
      <small
        id={`${title}-${field.name}-hint`}
        className={errors[field.name] ? "error-text" : "field-hint"}
      >
        {errors[field.name] ? localizeMessage(lang, errors[field.name] ?? "") : (field.hint ?? "")}
      </small>
    </label>
  );
  return (
    <>
      <form
        ref={formRef}
        className="draft-form operation-form"
        noValidate
        onChange={(event) => {
          const target = event.target;
          if (!(target instanceof HTMLInputElement) && !(target instanceof HTMLSelectElement))
            return;
          const name = target.name;
          setValues((v) => ({ ...v, [name]: target.value }));
          setErrors((previous) =>
            Object.fromEntries(
              Object.entries(previous).filter(([key]) => key !== name && key !== "form"),
            ),
          );
          onFieldChange?.(name, target.value);
        }}
        onSubmit={(event) => {
          event.preventDefault();
          if (busy.current) return;
          const data = Object.fromEntries(new FormData(event.currentTarget));
          const result = schema.safeParse(data);
          if (!result.success) {
            setErrors(
              Object.fromEntries(
                result.error.issues.map((issue) => [issue.path.join("."), issue.message]),
              ),
            );
            return;
          }
          const extra = extraValidate?.(result.data);
          if (extra) {
            setErrors({ form: localizeMessage(lang, extra) });
            return;
          }
          busy.current = true;
          setSaving(true);
          try {
            onSave(result.data);
          } catch (error) {
            setErrors({
              form: localizeMessage(lang, error instanceof Error ? error.message : String(error)),
            });
            busy.current = false;
            setSaving(false);
            return;
          }
          busy.current = false;
          setSaving(false);
          setErrors({});
        }}
        aria-label={title}
      >
        {fields.some((f) => f.name === "imei1" || f.name === "sku") && (
          <IntakeProgress
            current={
              !values["brand"] && !values["name"] && !values["model"]
                ? 0
                : !values["imei1"] && !values["sku"]
                  ? 1
                  : 2
            }
            labels={[
              t("nav.catalog"),
              fields.some((f) => f.name === "imei1") ? "IMEI" : "SKU",
              submitLabel ?? title,
            ]}
          />
        )}
        <div className="operation-form-grid">
          {fields.filter((field) => !visibleOptional.includes(field.name)).map(renderField)}
        </div>
        {fields.some((field) => visibleOptional.includes(field.name)) && (
          <details ref={optionalRef} className="retail-details">
            <summary>{t("retail.optional")}</summary>
            <div className="operation-form-grid">
              {fields.filter((field) => visibleOptional.includes(field.name)).map(renderField)}
            </div>
          </details>
        )}
        {children}
        {Object.keys(errors).length > 0 && (
          <p role="alert" className="error-text">
            {errors["form"] ?? t("op.checkFields")}
          </p>
        )}
        <div className="form-actions">
          <Button type="button" variant="outline" onClick={onCancel}>
            {t("shared.cancel")}
          </Button>
          <Button type="submit" disabled={saving} aria-busy={saving}>
            <Plus />
            {submitLabel ?? t("shared.addDraft")}
          </Button>
        </div>
      </form>
      {scan && (
        <Scanner
          target={scan}
          onClose={() => setScan(null)}
          onAssign={(assigned) => {
            for (const [key, value] of Object.entries(assigned)) {
              const element = formRef.current?.elements.namedItem(key);
              if (element instanceof HTMLInputElement) {
                element.value = value ?? "";
                element.dispatchEvent(new Event("input", { bubbles: true }));
                if (optionalFields.includes(key) && optionalRef.current)
                  optionalRef.current.open = true;
              }
            }
            setValues((v) => ({
              ...v,
              ...Object.fromEntries(
                Object.entries(assigned).filter(
                  (entry): entry is [string, string] => typeof entry[1] === "string",
                ),
              ),
            }));
            setErrors({});
            onScan?.(assigned);
          }}
        />
      )}
    </>
  );
}
export function OperationDialog({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const { t } = useErp();
  // Controlled dialogs have no Radix trigger, so remember the element that had focus when opening and restore it on close.
  const opener = useRef<HTMLElement | null>(null);
  if (
    open &&
    !opener.current &&
    typeof document !== "undefined" &&
    document.activeElement instanceof HTMLElement &&
    document.activeElement !== document.body
  )
    opener.current = document.activeElement;
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!value) onClose();
      }}
    >
      <DialogContent
        className="operation-dialog"
        onCloseAutoFocus={(event) => {
          const el = opener.current;
          opener.current = null;
          if (el && el.isConnected) {
            event.preventDefault();
            el.focus();
          }
        }}
      >
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription className="sr-only">{t("op.dialogDescription")}</DialogDescription>
        {children}
      </DialogContent>
    </Dialog>
  );
}
export function BarcodePreview({ value }: { value: string }) {
  const { t, lang } = useErp();
  const ref = useRef<SVGSVGElement>(null);
  const [error, setError] = useState("");
  const [decoded, setDecoded] = useState("");
  useEffect(() => {
    let active = true;
    setError("");
    setDecoded("");
    Promise.all([import("jsbarcode"), import("@zxing/library")])
      .then(([{ default: encode }, { BrowserBarcodeReader }]) => {
        if (!active || !ref.current) return;
        try {
          encode(ref.current, value, {
            format: "CODE128",
            displayValue: true,
            width: 2,
            height: 48,
            margin: 12,
          });
          const image = new Image();
          const xml = new XMLSerializer().serializeToString(ref.current);
          image.onload = () => {
            if (!active) return;
            try {
              const result = new BrowserBarcodeReader().decode(image);
              if (result.getText() !== value) throw new Error("Mismatch");
              setDecoded(result.getText());
            } catch {
              setError(t("op.barcodeDecodeError"));
            }
          };
          image.onerror = () => {
            if (active) setError(t("op.barcodeImageError"));
          };
          image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;
        } catch {
          setError(t("op.barcodeEncodeError"));
        }
      })
      .catch(() => {
        if (active) setError(t("op.barcodeToolsError"));
      });
    return () => {
      active = false;
    };
  }, [value, t]);
  return (
    <div className="encoded-label">
      <span>
        <Barcode size={16} />
        CODE128 · DEMO
      </span>
      <svg ref={ref} role="img" aria-label={t("a11y.barcode", { value })} />
      {error ? (
        <p role="alert" className="error-text">
          {error}
        </p>
      ) : (
        <small role="status">
          {decoded ? t("op.barcodeDecoded", { value: decoded }) : t("op.barcodeChecking")}
        </small>
      )}
      <small>{t("op.barcodeFoot")}</small>
    </div>
  );
}
