import { warrantyRule } from "@/domain/warranty-documents";
import { documentText } from "@/locales/warranty-documents";
import { testSettings, useTestWorkspace } from "@/data/test-workspace";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useErp } from "./context";
import { projectSnapshot } from "@/data/business-demo";
import { buyerOfCustomer } from "@/data/pos-customers";
import { useSession } from "@/data/session-store";
import { WALK_IN } from "@/data/test-workspace";
import type { TestBuyer } from "@/domain/test-documents";
import type { StoreId } from "@/domain/erp";
import type { WarrantyChoice } from "@/domain/sales-review";
export function PosBuyer({
  store,
  customer,
  required,
  onSelect,
  onDraft,
}: {
  store: StoreId;
  customer: string;
  required: boolean;
  onSelect: (id: string, buyer?: TestBuyer) => void;
  onDraft: (buyer: TestBuyer) => void;
}) {
  const { t } = useErp();
  useSession();
  const [query, setQuery] = useState("");
  const [surname, setSurname] = useState("");
  const [givenName, setGiven] = useState("");
  const [contact, setContact] = useState("");
  const [match, setMatch] = useState("");
  const [error, setError] = useState("");
  const rows = projectSnapshot(store).customers.filter(
    (c) =>
      c.id === customer || `${c.name} ${c.contact}`.toLowerCase().includes(query.toLowerCase()),
  );
  const choose = (id: string) => {
    try {
      onSelect(id, id === WALK_IN ? undefined : buyerOfCustomer(id, store));
      setMatch("");
      setError("");
    } catch {
      setError(t("doc.namesRequired"));
    }
  };
  const draft = (patch: Partial<TestBuyer>) => {
    const b = { surname, givenName, contact, ...patch };
    setSurname(b.surname);
    setGiven(b.givenName);
    setContact(b.contact);
    setMatch("");
    onDraft(b);
  };
  return (
    <section className="draft-form">
      <h3>{t("pos.customer")}</h3>
      {required && <p className="field-hint">{t("sale.required")}</p>}
      <label>
        {t("sale.customerSearch")}
        <input
          aria-label={t("sale.customerSearch")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      <select
        aria-label={t("sale.select")}
        value={customer}
        onChange={(e) => choose(e.target.value)}
      >
        <option value={WALK_IN}>{required ? "—" : t("pos.walkIn")}</option>
        {rows.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name} · {c.contact}
          </option>
        ))}
      </select>
      {customer === WALK_IN && (
        <div className="operation-form-grid">
          <label>
            {t("doc.surname")}
            <input
              required
              aria-label={t("doc.surname")}
              value={surname}
              onChange={(e) => draft({ surname: e.target.value })}
            />
          </label>
          <label>
            {t("doc.given")}
            <input
              required
              aria-label={t("doc.given")}
              value={givenName}
              onChange={(e) => draft({ givenName: e.target.value })}
            />
          </label>
          <label>
            {t("doc.contact")}
            <input
              aria-label={t("doc.contact")}
              value={contact}
              onChange={(e) => draft({ contact: e.target.value })}
            />
          </label>
        </div>
      )}
      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}
    </section>
  );
}
export function PhoneWarrantyChoices({
  phones,
  choices,
  onChange,
}: {
  phones: {
    id: string;
    name: string;
    brand?: string | undefined;
    model?: string | undefined;
    condition?: string | undefined;
  }[];
  choices: WarrantyChoice[];
  onChange: (choices: WarrantyChoice[]) => void;
}) {
  const { t, lang } = useErp();
  const workspace = useTestWorkspace();
  const settings = testSettings(workspace);
  const x = documentText[lang];
  const change = (id: string, patch: Partial<WarrantyChoice>) => {
    const c = choices.find((c) => c.itemId === id) ?? {
      itemId: id,
      requested: false,
      duration: "",
      start: "",
      end: "",
    };
    onChange([...choices.filter((c) => c.itemId !== id), { ...c, ...patch }]);
  };
  return (
    <>
      {phones.map((p) => {
        const c = choices.find((c) => c.itemId === p.id);
        const rule = warrantyRule(settings, {
          brand: p.brand ?? "",
          model: p.model ?? p.name,
          condition: p.condition ?? "",
        });
        return (
          <section className="draft-form" key={p.id}>
            <h3>
              {p.name} · {t("sale.warranty")}
            </h3>
            {!c && rule && (
              <Button
                onClick={() =>
                  change(p.id, { requested: true, provider: rule.provider, months: rule.months })
                }
              >
                {x.confirm} · {rule.provider === "SHOP" ? x.shop : x.manufacturer} · {rule.months}{" "}
                {t("sale.months")}
              </Button>
            )}
            <div className="form-actions">
              <Button
                variant={c?.requested === false ? "secondary" : "outline"}
                aria-pressed={c?.requested === false}
                onClick={() =>
                  change(p.id, {
                    requested: false,
                    months: undefined,
                    duration: "",
                    start: "",
                    end: "",
                  })
                }
              >
                {t("sale.no")}
              </Button>
              <Button
                variant={c?.requested === true ? "secondary" : "outline"}
                aria-pressed={c?.requested === true}
                onClick={() =>
                  change(p.id, {
                    requested: true,
                    provider: rule?.provider ?? "SHOP",
                    ...(rule ? { months: rule.months } : {}),
                  })
                }
              >
                {t("sale.yes")}
              </Button>
            </div>
            {c?.requested && (
              <>
                <label>
                  {x.provider}
                  <select
                    aria-label={`${x.provider} · ${p.name}`}
                    value={c.provider ?? "SHOP"}
                    onChange={(e) =>
                      change(p.id, { provider: e.target.value as "SHOP" | "MANUFACTURER" })
                    }
                  >
                    <option value="SHOP">{x.shop}</option>
                    <option value="MANUFACTURER">{x.manufacturer}</option>
                  </select>
                </label>
                <label>
                  {t("sale.duration")}
                  <select
                    aria-label={`${t("sale.duration")} · ${p.name}`}
                    value={c.months ?? ""}
                    onChange={(e) =>
                      change(p.id, { months: e.target.value ? Number(e.target.value) : undefined })
                    }
                  >
                    <option value="">—</option>
                    {[1, 3, 6, 12].map((m) => (
                      <option key={m} value={m}>
                        {m} {t("sale.months")}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            )}
          </section>
        );
      })}
    </>
  );
}
