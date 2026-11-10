export type ScanTarget = "imei1" | "imei2" | "serial" | "barcode";
export interface ScanPayload {
  raw: string;
  assignments: Partial<Record<ScanTarget, string>>;
  ambiguous: boolean;
}
/** Only explicit identifier tags are interpreted. Unlabelled content is kept verbatim. */
export function parseScanPayload(input: string): ScanPayload {
  const raw = input.trim();
  const assignments: ScanPayload["assignments"] = {};
  let ambiguous = false;
  const put = (key: ScanTarget, value: string) => {
    if (assignments[key] && assignments[key] !== value) ambiguous = true;
    else assignments[key] = value;
  };
  const tags: Record<string, ScanTarget> = {
    IMEI: "imei1",
    IMEI1: "imei1",
    IMEI2: "imei2",
    SERIAL: "serial",
    SN: "serial",
  };
  try {
    const object = JSON.parse(raw);
    if (object && typeof object === "object" && !Array.isArray(object))
      for (const [key, value] of Object.entries(object)) {
        const tag = tags[key.toUpperCase().replace(/[ _-]/g, "")];
        if (tag && typeof value === "string" && value.trim()) put(tag, value.trim());
      }
  } catch {
    /* plain text */
  }
  const re = /(?:^|[\s;,|])\b(IMEI\s*[12]?|SERIAL|S\/N|SN)\s*[:=]\s*([A-Za-z0-9-]+)/gi;
  for (const match of raw.matchAll(re)) {
    const key = match[1]?.toUpperCase().replace(/\s|\//g, "");
    const value = match[2];
    if (key && value && tags[key]) put(tags[key], value);
  }
  if (!Object.keys(assignments).length && /\s|[;,|]/.test(raw)) ambiguous = true;
  return { raw, assignments, ambiguous };
}
export function stopScanTracks(stream: Pick<MediaStream, "getTracks"> | null | undefined) {
  stream?.getTracks().forEach((track) => track.stop());
}
