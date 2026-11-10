import { useState } from "react";
import { useErp } from "./context";
import { Button } from "@/components/ui/button";
import { useSession } from "@/data/session-store";
import {
  receivingSuppliers,
  ownerSupplierName,
  provenanceCorrections,
} from "@/data/supplier-provenance";
import { reviewActor, correctSupplierProvenance, useTestWorkspace } from "@/data/test-workspace";
export function IntakeSupplier() {
  useSession();
  const { t } = useErp();
  const [query, setQuery] = useState("");
  const [id, setId] = useState("");
  return (
    <details className="retail-details">
      <summary>{t("prov.supplier")}</summary>
      <label>
        {t("prov.search")}
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label={t("prov.search")}
        />
      </label>
      <label>
        {t("prov.supplier")}
        <select
          name="supplierId"
          value={id}
          onChange={(e) => setId(e.target.value)}
          aria-label={t("prov.supplier")}
        >
          <option value="">{t("prov.missing")}</option>
          {receivingSuppliers()
            .filter((s) => s.id === id || s.name.toLowerCase().includes(query.toLowerCase()))
            .map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
        </select>
      </label>
      {!id && (
        <label>
          {t("prov.new")}
          <input name="newSupplierName" aria-label={t("prov.new")} />
        </label>
      )}
    </details>
  );
}
export function OwnerProvenance({
  kind,
  id,
  supplierId,
  reference,
  at,
  operator,
}: {
  kind: "phone" | "receipt";
  id: string;
  supplierId?: string | undefined;
  reference?: string | undefined;
  at?: string | undefined;
  operator?: string | undefined;
}) {
  const { t } = useErp();
  useTestWorkspace();
  useSession();
  const [error, setError] = useState("");
  if (reviewActor()?.role !== "SUPER_ADMIN") return null;
  const edits = provenanceCorrections(id);
  let effective = supplierId;
  if (edits[0]) {
    try {
      effective = JSON.parse(edits[0].detail).new;
    } catch {
      effective = supplierId;
    }
  }
  return (
    <section>
      <dl className="detail-list">
        <dt>{t("prov.supplier")}</dt>
        <dd>{ownerSupplierName(effective) ?? t("prov.missing")}</dd>
        <dt>{t("prov.reference")}</dt>
        <dd>{reference || t("prov.missing")}</dd>
        <dt>{t("prov.receipt")}</dt>
        <dd>
          {operator || t("prov.missing")} · {at || t("prov.missing")}
        </dd>
      </dl>
      <details className="retail-details">
        <summary>{t("prov.save")}</summary>
        <form
          className="draft-form"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            try {
              correctSupplierProvenance(
                kind,
                id,
                String(f.get("supplier")),
                String(f.get("reason")),
              );
              setError("");
            } catch {
              setError(t("op.checkFields"));
            }
          }}
        >
          <label>
            {t("prov.supplier")}
            <select name="supplier" defaultValue={effective ?? ""}>
              <option value="">{t("prov.missing")}</option>
              {receivingSuppliers().map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t("prov.reason")}
            <input name="reason" required />
          </label>
          <Button type="submit">{t("prov.save")}</Button>
          {error && <p role="alert">{error}</p>}
        </form>
        {edits.map((e) => (
          <p key={e.id}>
            <bdi>{e.at}</bdi> · {e.detail}
          </p>
        ))}
      </details>
    </section>
  );
}
