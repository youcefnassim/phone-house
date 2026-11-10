/** True blind count (owner decision 2026-11-09): only SUPER_ADMIN sees movements of OPEN shifts. */
export function visibleCashMovements<
  M extends { shiftId?: string | undefined; reference?: string; reason?: string },
  S extends { id: string; status: string },
>(movements: readonly M[], shifts: readonly S[], role: string | undefined): M[] {
  if (role === "SUPER_ADMIN") return [...movements];
  return movements.filter(
    (m) =>
      m.reference !== "Paiement fournisseur" &&
      m.reason !== "Paiement fournisseur" &&
      m.reference !== "USED_PURCHASE" &&
      m.reason !== "USED_PURCHASE" &&
      shifts.find((s) => s.id === m.shiftId)?.status === "CLOSED",
  );
}
