import { getTestState, commitTest, assertReviewStore } from "./test-workspace";
export function resolveLocalTransfer(
  id: string,
  itemId: string,
  outcome: "RETURN" | "WRITE_OFF",
  reason: string,
) {
  const ws = getTestState(),
    t = ws.transfers.find((x) => x.id === id),
    d = t?.discrepancyLines?.find((x) => x.id === itemId);
  if (!t || !d || d.outcome || !reason.trim()) throw new Error("REJECTED");
  assertReviewStore(t.from, "transfer.resolve");
  const line = t.lines.find((l) => l.id === itemId);
  if (!line) throw new Error("NOT_FOUND");
  const phones = ws.phones.map((p) =>
    p.id === itemId
      ? {
          ...p,
          store: t.from,
          status: outcome === "RETURN" ? ("Available" as const) : ("Inspection" as const),
        }
      : p,
  );
  const accessories = ws.accessories.map((a) =>
    a.id === itemId && outcome === "RETURN" ? { ...a, quantity: a.quantity + d.quantity } : a,
  );
  commitTest({
    ...ws,
    phones,
    accessories,
    transfers: ws.transfers.map((x) =>
      x.id === id
        ? {
            ...x,
            discrepancyLines: (x.discrepancyLines ?? []).map((v) =>
              v.id === itemId ? { ...v, outcome, reason } : v,
            ),
          }
        : x,
    ),
  });
}
export function cancelLocalTransfer(id: string, reason: string) {
  const ws = getTestState(),
    t = ws.transfers.find((x) => x.id === id);
  if (!t || t.cancelled || !["IN_TRANSIT", "RECEIPT"].includes(t.stage) || !reason.trim())
    throw new Error("REJECTED");
  assertReviewStore(t.from, "transfer.cancel");
  const phones = ws.phones.map((p) =>
    t.lines.some((l) => l.id === p.id && l.kind === "phone")
      ? { ...p, store: t.from, status: "Available" as const }
      : p,
  );
  const accessories = ws.accessories.map((a) => {
    const l = t.lines.find((l) => l.id === a.id && l.kind === "accessory");
    return l ? { ...a, quantity: a.quantity + l.quantity } : a;
  });
  commitTest({
    ...ws,
    phones,
    accessories,
    transfers: ws.transfers.map((x) =>
      x.id === id
        ? {
            ...x,
            cancelled: true,
            stage: "COMPLETED",
            history: [...x.history, `CANCEL · ${reason}`],
          }
        : x,
    ),
  });
}
