import { useEffect, useRef, useState } from "react";
import type { BrowserMultiFormatReader } from "@zxing/library";
import { Camera, ScanLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { parseScanPayload, stopScanTracks, type ScanTarget } from "@/domain/scan-payload";
import { useErp } from "./context";

/** Browser-only decoder is imported after a human camera action, never during SSR. */
export function Scanner({
  target,
  onAssign,
  onClose,
}: {
  target: ScanTarget;
  onAssign: (values: Partial<Record<ScanTarget, string>>) => void;
  onClose: () => void;
}) {
  const { t } = useErp();
  const [raw, setRaw] = useState("");
  const [error, setError] = useState("");
  const [running, setRunning] = useState(false);
  const [pending, setPending] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const reader = useRef<BrowserMultiFormatReader | null>(null);
  const generation = useRef(0);
  const stop = () => {
    generation.current++;
    reader.current?.reset();
    reader.current = null;
    stopScanTracks(stream.current);
    stream.current = null;
    setRunning(false);
    setPending(false);
  };
  useEffect(
    () => () => {
      generation.current++;
      reader.current?.reset();
      stopScanTracks(stream.current);
    },
    [],
  );
  const accept = (text: string) => {
    stop();
    setRaw(text.trim());
    setError("");
  };
  const start = async () => {
    stop();
    const token = generation.current;
    setError("");
    setPending(true);
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setError(t("scan.unavailable"));
      setPending(false);
      return;
    }
    try {
      const media = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      if (token !== generation.current) {
        stopScanTracks(media);
        return;
      }
      stream.current = media;
      const { BrowserMultiFormatReader, DecodeHintType, BarcodeFormat } =
        await import("@zxing/library");
      if (token !== generation.current) {
        stopScanTracks(media);
        return;
      }
      const hints = new Map();
      hints.set(DecodeHintType.POSSIBLE_FORMATS, [
        BarcodeFormat.QR_CODE,
        BarcodeFormat.CODE_128,
        BarcodeFormat.EAN_13,
        BarcodeFormat.EAN_8,
        BarcodeFormat.CODE_39,
        BarcodeFormat.UPC_A,
        BarcodeFormat.UPC_E,
        BarcodeFormat.ITF,
      ]);
      const decoder = new BrowserMultiFormatReader(hints, 250);
      reader.current = decoder;
      const element = video.current;
      if (!element) {
        stop();
        return;
      }
      setRunning(true);
      setPending(false);
      await decoder.decodeFromStream(media, element, (result) => {
        if (result && token === generation.current) accept(result.getText());
      });
    } catch (e) {
      if (token !== generation.current) return;
      stop();
      setError(
        t(
          e instanceof DOMException && e.name === "NotAllowedError"
            ? "scan.denied"
            : "scan.unavailable",
        ),
      );
    }
  };
  const parsed = parseScanPayload(raw);
  const tagged = Object.keys(parsed.assignments).length > 0 && !parsed.ambiguous;
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) {
          stop();
          onClose();
        }
      }}
    >
      <DialogContent className="operation-dialog">
        <DialogTitle>
          {t("scan.title")} ·{" "}
          {target === "imei1"
            ? "IMEI 1"
            : target === "imei2"
              ? "IMEI 2"
              : target === "serial"
                ? t("inv.fSerial")
                : t("inv.fBarcode")}
        </DialogTitle>
        <DialogDescription>{t("scan.fallback")}</DialogDescription>
        <video
          ref={video}
          autoPlay
          muted
          playsInline
          className="scan-video"
          hidden={!running}
          aria-label={t("scan.camera")}
        />
        <div className="form-actions">
          <Button type="button" onClick={() => void start()} disabled={pending || running}>
            <Camera />
            {t("scan.camera")}
          </Button>
          {(running || pending) && (
            <Button type="button" variant="outline" onClick={stop}>
              {t("scan.stop")}
            </Button>
          )}
        </div>
        {error && (
          <p role="alert" className="error-text">
            {error}
          </p>
        )}
        <form
          className="draft-form"
          onSubmit={(e) => {
            e.preventDefault();
            accept(raw);
          }}
        >
          <label>
            {t("scan.content")}
            <input
              autoFocus
              value={raw}
              dir="ltr"
              onChange={(e) => setRaw(e.target.value)}
              aria-label={t("scan.content")}
            />
          </label>
          <Button type="submit" variant="outline">
            <ScanLine />
            {t("scan.read")}
          </Button>
        </form>
        {raw && (
          <>
            <p role="status" className="field-hint">
              {t(tagged ? "scan.tagged" : "scan.choose")}
            </p>
            {tagged && (
              <>
                <dl className="detail-list">
                  {Object.entries(parsed.assignments).map(([key, value]) => (
                    <div className="policy-row" key={key}>
                      <dt>{key === "serial" ? t("inv.fSerial") : key.toUpperCase()}</dt>
                      <dd>
                        <bdi>{value}</bdi>
                      </dd>
                    </div>
                  ))}
                </dl>
                <Button
                  type="button"
                  onClick={() => {
                    stop();
                    onAssign(parsed.assignments);
                    onClose();
                  }}
                >
                  {t("scan.assign")}
                </Button>
              </>
            )}
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                stop();
                onAssign({ [target]: raw });
                onClose();
              }}
            >
              {t("scan.useTarget")}
            </Button>
          </>
        )}
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            stop();
            onClose();
          }}
        >
          {t("shared.cancel")}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
