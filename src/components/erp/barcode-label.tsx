import { useEffect, useRef, useState } from "react";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useErp } from "./context";
import { useIntakeText } from "./fast-intake";

/** Pure print projection. No workspace or audit commands are called. */
export function BarcodeLabel({
  value,
  name,
  store,
  sizeMm,
}: {
  value: string;
  name: string;
  /** Owner decision 2026-11-09: label = code + model + store, never price. */
  store?: string;
  /** labels.sizeMm owner setting; null/absent keeps the current layout and shows a Settings hint. */
  sizeMm?: { width: number; height: number } | null;
}) {
  const { t } = useErp();
  const x = useIntakeText();
  const svg = useRef<SVGSVGElement>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [size, setSize] = useState("60x40");
  useEffect(() => {
    let active = true;
    setReady(false);
    setError("");
    import("jsbarcode")
      .then(({ default: encode }) => {
        if (!active || !svg.current) return;
        try {
          encode(svg.current, value, {
            format: "CODE128",
            displayValue: true,
            width: 2,
            height: 55,
            margin: 16,
          });
          setReady(true);
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
  const print = () => {
    if (!ready || !svg.current) return;
    const root = document.createElement("div");
    root.className = "barcode-print-root";
    const label = document.createElement("section");
    label.className = "barcode-paper";
    const [w, h] = sizeMm ? [sizeMm.width, sizeMm.height] : size.split("x").map(Number);
    label.style.width = `${w}mm`;
    label.style.height = `${h}mm`;
    const brand = document.createElement("strong");
    brand.textContent = "PHONE HOUSE";
    const product = document.createElement("span");
    product.textContent = name;
    label.append(brand, product);
    if (store) {
      const where = document.createElement("span");
      where.textContent = store;
      label.append(where);
    }
    label.append(svg.current.cloneNode(true));
    root.append(label);
    const style = document.createElement("style");
    style.textContent = `@page{size:${w}mm ${h}mm;margin:0}`;
    root.append(style);
    document.body.append(root);
    document.body.classList.add("printing-barcode");
    const cleanup = () => {
      root.remove();
      document.body.classList.remove("printing-barcode");
      window.removeEventListener("afterprint", cleanup);
    };
    window.addEventListener("afterprint", cleanup, { once: true });
    try {
      window.print();
    } finally {
      cleanup();
    }
  };
  return (
    <div className="encoded-label">
      <strong>PHONE HOUSE</strong>
      <span>{name}</span>
      {store && <span data-testid="label-store">{store}</span>}
      <svg ref={svg} role="img" aria-label={t("a11y.barcode", { value })} />
      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}
      {sizeMm ? (
        <small data-testid="label-size">
          {sizeMm.width} × {sizeMm.height} mm
        </small>
      ) : (
        <>
          <small role="note">{x("labelSizeHint")}</small>
          <label className="form-label">
            {t("label.size")}
            <select
              value={size}
              onChange={(e) => setSize(e.target.value)}
              aria-label={t("label.size")}
            >
              {["60x40", "80x40", "100x50"].map((s) => (
                <option key={s} value={s}>
                  {s.replace("x", " × ")} mm
                </option>
              ))}
            </select>
          </label>
        </>
      )}
      <Button type="button" variant="outline" disabled={!ready} onClick={print}>
        <Printer />
        {t("label.print")}
      </Button>
      <small>{t("label.hardware")}</small>
    </div>
  );
}
