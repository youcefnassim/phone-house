import { NativeReports, NativeSav } from "./native-batch4b";
import { NativeCustomers } from "./native-customers";
import { NativeStaff } from "./native-staff";
import { NativeUsedPurchase } from "./native-used-purchase";
import { NativeTransfers } from "./native-transfers";
import { permits } from "@/domain/permissions";
import { NativeSupplierPayables } from "./supplier-payables";
import { NativeCreditList } from "./native-credit-list";
import { useMemo, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createNativeRepository, TransportError } from "@/data/native-repository";
import { nativeRouteModules, type NativeRoute } from "@/domain/native-repository";
import {
  nativePayloads,
  type NativeCommandResult,
  type NativeOperation,
} from "@/domain/native-commands";
import {
  formatMinor,
  operationFields,
  productionModules,
  type FieldSpec,
} from "@/domain/production-modules";
import { productionText } from "@/locales/production";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useErp } from "./context";
import { useNativeTransport } from "./native-transport";
import { documentText } from "@/locales/warranty-documents";
const navKey: Record<NativeRoute, string> = {
  "/waiting": "nav.overview",
  "/": "nav.overview",
  "/pos": "nav.pos",
  "/sales": "sale.title",
  "/cash": "nav.cash",
  "/stock/phones": "nav.phones",
  "/stock/accessories": "nav.accessories",
  "/catalog": "nav.catalog",
  "/transfers": "nav.transfers",
  "/customers": "nav.customers",
  "/debts": "nav.debts",
  "/suppliers": "nav.suppliers",
  "/purchases": "nav.purchases",
  "/expenses": "nav.expenses",
  "/facility": "nav.facility",
  "/sav": "nav.sav",
  "/reports": "nav.reports",
  "/users": "nav.users",
  "/audit": "nav.audit",
  "/settings": "nav.settings",
};
const PAGE = 25;
type Store = "M01" | "M02";
function useP() {
  const { lang } = useErp();
  return (key: string, params?: Record<string, string>) => productionText(lang, key, params);
}
function newKey() {
  return `cmd-${crypto.randomUUID()}`;
}
function newId() {
  return crypto.randomUUID().slice(0, 8).toUpperCase();
}

export function NativePage({ pathname }: { pathname: string }) {
  const { t } = useErp();
  if (!(pathname in nativeRouteModules)) return <p role="alert">{t("native.error")}</p>;
  return <RegisteredNativePage route={pathname as NativeRoute} />;
}
function RegisteredNativePage({ route }: { route: NativeRoute }) {
  const { scope, t } = useErp();
  const p = useP();
  const transport = useNativeTransport();
  const repository = useMemo(() => createNativeRepository(transport), [transport]);
  const module = productionModules[route];
  const store: Store | null = scope === "M01" || scope === "M02" ? scope : null;
  const status = useQuery({
    queryKey: ["native-status", transport],
    queryFn: () => repository.status(),
    retry: false,
  });
  const ready = status.data?.connected === true && status.data.verified === true && store !== null;
  const label = status.isPending
    ? "native.loading"
    : !status.data?.connected
      ? "native.notConnected"
      : !status.data.verified
        ? "native.unauthorized"
        : null;
  return (
    <section aria-labelledby="native-title">
      <div className="page-heading">
        <div>
          <p className="eyebrow">{t("native.title")}</p>
          <h1 id="native-title">{t(navKey[route] as Parameters<typeof t>[0])}</h1>
          <p role="status">{label ? t(label) : store ? "" : p("ui.storeRequired")}</p>
        </div>
        {status.data?.synthetic && (
          <Badge
            variant="outline"
            className="border-destructive text-destructive"
            data-testid="synthetic-banner"
          >
            {p("ui.synthetic")}
          </Badge>
        )}
      </div>
      {module.checkoutNote && (
        <p className="mb-4 text-sm text-muted-foreground">{p("ui.checkout")}</p>
      )}
      {module.statusPanel && (
        <StatusPanel connected={!!status.data?.connected} verified={!!status.data?.verified} />
      )}
      {store && ready && (route === "/debts" || route === "/") && (
        <NativeCreditList store={store} alertsOnly={route === "/"} />
      )}
      {store && ready && route === "/reports" && (
        <NativeReports
          store={store}
          owner={
            !!status.data?.memberships?.some(
              (m) => m.role === "SUPER_ADMIN" && m.store === "GLOBAL",
            )
          }
        />
      )}
      {store && ready && route === "/sav" && (
        <NativeSav
          store={store}
          owner={
            !!status.data?.memberships?.some(
              (m) => m.role === "SUPER_ADMIN" && m.store === "GLOBAL",
            )
          }
          approve={
            !!status.data?.memberships?.some((m) => permits(m.role, m.store, store, "sav.outcome"))
          }
        />
      )}
      {store && ready && route === "/purchases" && (
        <NativeUsedPurchase
          store={store}
          owner={
            !!status.data?.memberships?.some(
              (m) => m.role === "SUPER_ADMIN" && m.store === "GLOBAL",
            )
          }
        />
      )}
      {store && ready && route === "/customers" && <NativeCustomers store={store} />}
      {store && ready && route === "/users" && <NativeStaff store={store} />}
      {store && route !== "/reports" && (
        <RecordsTable route={route} store={store} repository={repository} enabled={ready} />
      )}
      {(route !== "/debts" || !ready) &&
        (route !== "/sav" || !ready) &&
        (route !== "/users" || !ready) &&
        (route !== "/transfers" || !ready) &&
        module.operations.length > 0 && (
          <CommandPanel
            operations={module.operations.filter(
              (op) =>
                (route !== "/suppliers" || !["supplier.cost", "supplier.payment"].includes(op)) &&
                (status.data?.memberships?.some((m) => permits(m.role, m.store, store ?? "", op)) ??
                  !status.data?.memberships),
            )}
            store={store}
            ready={ready}
            repository={repository}
            route={route}
          />
        )}
      {route === "/transfers" && store && ready && <NativeTransfers store={store} />}
      {route === "/suppliers" &&
        store &&
        ready &&
        status.data?.memberships?.some((m) => m.role === "SUPER_ADMIN" && m.store === "GLOBAL") && (
          <NativeSupplierPayables store={store} />
        )}
      {module.ownerFinance &&
        store &&
        ready &&
        (status.data?.synthetic ||
          !status.data?.memberships ||
          status.data.memberships.some(
            (m) => m.role === "SUPER_ADMIN" && m.store === "GLOBAL",
          )) && <FinancePanel store={store} repository={repository} />}
    </section>
  );
}
function StatusPanel({ connected, verified }: { connected: boolean; verified: boolean }) {
  const p = useP();
  return (
    <div className="mb-6 rounded-md border border-border bg-card p-4 text-sm">
      <h2 className="font-semibold mb-2">{p("ui.statusPanel")}</h2>
      <dl className="grid grid-cols-2 gap-2">
        <dt>{p("ui.connected")}</dt>
        <dd>{p(connected ? "ui.yes" : "ui.no")}</dd>
        <dt>{p("ui.verified")}</dt>
        <dd>{p(verified ? "ui.yes" : "ui.no")}</dd>
      </dl>
      <p className="mt-2 text-muted-foreground">{p("ui.target")}</p>
    </div>
  );
}
function Cell({ column, value }: { column: string; value: unknown }) {
  const { lang } = useErp();
  if (column === "warranty_provider")
    return (
      <>
        {value === "MANUFACTURER"
          ? documentText[lang].send
          : value === "SHOP"
            ? documentText[lang].shop
            : "—"}
      </>
    );
  if (value === null || value === undefined) return <>—</>;
  if (column.endsWith("_minor") && typeof value === "number")
    return <span dir="ltr">{formatMinor(value)}</span>;
  if (column === "state" || column === "stage" || column === "role")
    return <Badge variant="secondary">{String(value)}</Badge>;
  return (
    <span dir={/_id$|^id$|barcode|sku|key/.test(column) ? "ltr" : undefined}>{String(value)}</span>
  );
}
function RecordsTable({
  route,
  store,
  repository,
  enabled,
}: {
  route: NativeRoute;
  store: Store;
  repository: ReturnType<typeof createNativeRepository>;
  enabled: boolean;
}) {
  const { t } = useErp();
  const p = useP();
  const [offset, setOffset] = useState(0);
  const [search, setSearch] = useState("");
  const [applied, setApplied] = useState("");
  const q = useQuery({
    queryKey: ["native-read", route, store, offset, applied, repository],
    queryFn: () =>
      repository.read(route, store, { limit: PAGE, offset, search: applied || undefined }),
    retry: false,
    enabled,
  });
  if (!enabled) return null;
  const columns = productionModules[route].columns;
  const data = q.data;
  const stateLabel = q.isPending
    ? "native.loading"
    : data?.state === "FORBIDDEN"
      ? "native.forbidden"
      : data?.state === "UNAUTHORIZED"
        ? "native.unauthorized"
        : data?.state === "ERROR" || q.isError
          ? "native.error"
          : data?.state === "NOT_CONNECTED"
            ? "native.notConnected"
            : null;
  return (
    <div className="mb-6 rounded-md border border-border bg-card">
      <form
        className="flex flex-wrap items-center gap-2 p-3 border-b border-border"
        onSubmit={(e) => {
          e.preventDefault();
          setOffset(0);
          setApplied(search.trim());
        }}
      >
        <h2 className="font-semibold text-sm me-auto">{p("ui.serverRecords")}</h2>
        <Input
          aria-label={p("ui.search")}
          placeholder={p("ui.search")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          maxLength={80}
          className="w-48"
        />
        <Button type="submit" variant="outline" size="sm">
          {p("ui.search")}
        </Button>
      </form>
      {stateLabel ? (
        <p role="status" className="p-4 text-sm">
          {t(stateLabel)}
        </p>
      ) : (
        data?.state === "READY" &&
        (data.projection.rows.length === 0 ? (
          <p role="status" className="p-4 text-sm">
            {t("native.empty")}
          </p>
        ) : (
          <div className="table-wrap overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  {columns.map((c) => (
                    <th key={c} className="p-2 text-start">
                      {p(`c.${c}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.projection.rows.map((r, i) => (
                  <tr key={String(r["id"] ?? i)} className="border-t border-border">
                    {columns.map((c) => (
                      <td key={c} className="p-2">
                        <Cell column={c} value={r[c]} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))
      )}
      {data?.state === "READY" && (
        <div className="flex items-center justify-end gap-2 p-3 border-t border-border text-xs">
          <span>
            {p("ui.page", {
              from: String(offset + 1),
              to: String(offset + data.projection.rows.length),
            })}
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={offset === 0}
            onClick={() => setOffset(Math.max(0, offset - PAGE))}
          >
            {p("ui.prev")}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!data.projection.page?.hasMore}
            onClick={() => setOffset(offset + PAGE)}
          >
            {p("ui.next")}
          </Button>
        </div>
      )}
    </div>
  );
}
/** Converts form strings into the strict payload; schema validation is the gate. */
export function buildPayload(
  operation: NativeOperation,
  store: Store,
  values: Record<string, string>,
) {
  const payload: Record<string, unknown> = {
    store: operation.startsWith("facility.") ? "M01" : store,
  };
  for (const f of operationFields[operation]) {
    const raw = (values[f.name] ?? "").trim();
    if (f.kind === "int") payload[f.name] = raw === "" ? undefined : Number(raw);
    else if (f.kind === "optionalMoney") payload[f.name] = raw === "" ? null : raw;
    else if (f.kind === "json") {
      if (raw === "") {
        if (f.name === "phones") payload[f.name] = [];
        else if (f.name === "attributes") payload[f.name] = {};
      } else {
        try {
          payload[f.name] = JSON.parse(raw) as unknown;
        } catch {
          payload[f.name] = Symbol("invalid-json");
        }
      }
    } else payload[f.name] = raw === "" ? undefined : raw;
  }
  return payload;
}
type Outcome =
  | { kind: "result"; result: NativeCommandResult }
  | { kind: "unknown"; key: string }
  | { kind: "notFound" }
  | { kind: "error"; code: string };
function CommandPanel({
  operations,
  store,
  ready,
  repository,
  route,
}: {
  operations: NativeOperation[];
  store: Store | null;
  ready: boolean;
  repository: ReturnType<typeof createNativeRepository>;
  route: NativeRoute;
}) {
  const p = useP();
  const qc = useQueryClient();
  const [operation, setOperation] = useState<NativeOperation>(operations[0] ?? "customer.save");
  const [values, setValues] = useState<Record<string, string>>({});
  const [key, setKey] = useState(newKey);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const locked = outcome?.kind === "unknown";
  const reset = (op = operation) => {
    setOperation(op);
    setValues({});
    setErrors([]);
    setOutcome(null);
    setKey(newKey());
  };
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!store || !ready || busy) return;
    const parsed = nativePayloads[operation].safeParse(buildPayload(operation, store, values));
    if (!parsed.success) {
      setErrors(parsed.error.issues.map((i) => String(i.path[0] ?? "_")));
      setOutcome(null);
      return;
    }
    setErrors([]);
    setBusy(true);
    try {
      const result = await repository.execute({
        version: "native-2026-11-06",
        key,
        operation,
        payload: parsed.data,
      });
      setOutcome({ kind: "result", result });
      void qc.invalidateQueries({ queryKey: ["native-read", route] });
    } catch (error) {
      const code = error instanceof TransportError ? error.code : "OUTCOME_UNKNOWN";
      setOutcome(code === "OUTCOME_UNKNOWN" ? { kind: "unknown", key } : { kind: "error", code });
    } finally {
      setBusy(false);
    }
  };
  const check = async () => {
    setBusy(true);
    try {
      const r = await repository.outcome(key);
      setOutcome(r ? { kind: "result", result: r } : { kind: "notFound" });
      if (r) void qc.invalidateQueries({ queryKey: ["native-read", route] });
    } catch {
      setOutcome({ kind: "unknown", key });
    } finally {
      setBusy(false);
    }
  };
  const statusText = (s: NativeCommandResult["status"]) =>
    p(s === "POLICY_BLOCKED" ? "ui.policy" : s === "DRAFT" ? "ui.draft" : "ui.recorded");
  return (
    <div className="mb-6 rounded-md border border-border bg-card p-4">
      <h2 className="font-semibold text-sm mb-3">{p("ui.commands")}</h2>
      {!ready && (
        <p role="note" className="mb-3 text-sm text-muted-foreground">
          {store ? p("ui.disabled") : p("ui.storeRequired")}
        </p>
      )}
      <div className="flex flex-wrap gap-2 mb-4" role="tablist" aria-label={p("ui.operation")}>
        {operations.map((op) => (
          <Button
            key={op}
            type="button"
            role="tab"
            size="lg"
            aria-selected={op === operation}
            variant={op === operation ? "default" : "outline"}
            disabled={locked}
            onClick={() => reset(op)}
          >
            {p(`op.${op}`)}
          </Button>
        ))}
      </div>
      <form
        onSubmit={submit}
        className="grid gap-3 sm:grid-cols-2"
        aria-label={p(`op.${operation}`)}
      >
        {operationFields[operation].map((f) => (
          <Field
            key={`${operation}-${f.name}`}
            spec={f}
            value={values[f.name] ?? ""}
            invalid={errors.includes(f.name)}
            disabled={locked || !ready}
            onChange={(v) => setValues((s) => ({ ...s, [f.name]: v }))}
          />
        ))}
        <div className="sm:col-span-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <span>
            {p("ui.key")}: <code dir="ltr">{key}</code>
          </span>
        </div>
        {errors.length > 0 && (
          <p role="alert" className="sm:col-span-2 text-sm text-destructive">
            {p("ui.invalid")}
          </p>
        )}
        <div className="sm:col-span-2 flex gap-2">
          <Button
            size="lg"
            type="submit"
            disabled={!ready || busy || locked || outcome?.kind === "result"}
          >
            {busy ? p("ui.submitting") : p("ui.submit")}
          </Button>
          {(outcome?.kind === "result" || outcome?.kind === "error") && (
            <Button type="button" variant="outline" onClick={() => reset()}>
              {p("ui.newKey")}
            </Button>
          )}
        </div>
      </form>
      {outcome?.kind === "result" && (
        <div
          role="status"
          aria-label={p("ui.receipt")}
          className="mt-4 rounded border border-border p-3 text-sm"
        >
          <strong>{p("ui.receipt")}</strong>
          <p>{statusText(outcome.result.status)}</p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3" dir="ltr">
            <dt>{p("ui.status")}</dt>
            <dd>{outcome.result.status}</dd>
            <dt>{p("ui.tx")}</dt>
            <dd>{outcome.result.transactionId}</dd>
            <dt>{p("ui.key")}</dt>
            <dd>{outcome.result.key}</dd>
          </dl>
        </div>
      )}
      {outcome?.kind === "unknown" && (
        <div role="alert" className="mt-4 rounded border border-destructive p-3 text-sm">
          <p>{p("ui.unknown")}</p>
          <Button
            type="button"
            size="sm"
            className="mt-2"
            disabled={busy}
            onClick={() => void check()}
          >
            {p("ui.check")}
          </Button>
        </div>
      )}
      {outcome?.kind === "notFound" && (
        <p role="status" className="mt-4 text-sm">
          {p("ui.notFound")}
        </p>
      )}
      {outcome?.kind === "error" && (
        <p role="alert" className="mt-4 text-sm text-destructive">
          {p(
            outcome.code === "FORBIDDEN"
              ? "ui.forbiddenCmd"
              : outcome.code === "BAD_REQUEST"
                ? "ui.badRequest"
                : "ui.error",
          )}
        </p>
      )}
    </div>
  );
}
function Field({
  spec,
  value,
  invalid,
  disabled,
  onChange,
}: {
  spec: FieldSpec;
  value: string;
  invalid: boolean;
  disabled: boolean;
  onChange: (v: string) => void;
}) {
  const p = useP();
  const id = `pf-${spec.name}`;
  const label = p(`f.${spec.name}`);
  if (typeof spec.kind === "object")
    return (
      <label className="grid gap-1 text-sm" htmlFor={id}>
        {label}
        <select
          id={id}
          aria-invalid={invalid}
          disabled={disabled}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-2"
        >
          <option value="">—</option>
          {spec.kind.options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </label>
    );
  if (spec.kind === "json")
    return (
      <label className="grid gap-1 text-sm sm:col-span-2" htmlFor={id}>
        {label}
        <textarea
          id={id}
          dir="ltr"
          aria-invalid={invalid}
          disabled={disabled}
          value={value}
          placeholder={spec.example}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          className="rounded-md border border-input bg-background p-2 font-mono text-xs"
        />
      </label>
    );
  return (
    <label className="grid gap-1 text-sm" htmlFor={id}>
      {label}
      <span className="flex gap-1">
        <Input
          id={id}
          dir="ltr"
          aria-invalid={invalid}
          disabled={disabled}
          value={value}
          inputMode={
            spec.kind === "money" ||
            spec.kind === "optionalMoney" ||
            spec.kind === "int" ||
            spec.kind === "imei"
              ? "decimal"
              : undefined
          }
          placeholder={spec.kind === "money" || spec.kind === "optionalMoney" ? "0.00" : undefined}
          onChange={(e) => onChange(e.target.value)}
        />
        {spec.kind === "newId" && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={disabled}
            onClick={() => onChange(newId())}
          >
            {p("ui.generate")}
          </Button>
        )}
      </span>
    </label>
  );
}
function FinancePanel({
  store,
  repository,
}: {
  store: Store;
  repository: ReturnType<typeof createNativeRepository>;
}) {
  const p = useP();
  const q = useQuery({
    queryKey: ["native-finance", store, repository],
    queryFn: () => repository.finance(store),
    retry: false,
  });
  return (
    <div className="rounded-md border border-border bg-card p-4 text-sm">
      <h2 className="font-semibold mb-2">{p("ui.finance")}</h2>
      {q.data?.state === "READY" ? (
        <table className="w-full">
          <thead>
            <tr>
              {["purchase_id", "cost_minor", "obligation_minor"].map((c) => (
                <th key={c} className="text-start p-1">
                  {p(`c.${c}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {q.data.data.rows.map((r) => (
              <tr key={r.purchase_id}>
                <td className="p-1" dir="ltr">
                  {r.purchase_id}
                </td>
                <td className="p-1">
                  {r.cost_minor === null ? p("ui.unknownCost") : formatMinor(r.cost_minor)}
                </td>
                <td className="p-1">
                  {r.obligation_minor === null
                    ? p("ui.unknownCost")
                    : formatMinor(r.obligation_minor)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : q.data?.state === "FORBIDDEN" ? (
        <p role="status">{p("ui.financeForbidden")}</p>
      ) : q.isPending ? null : (
        <p role="status">{p("ui.error")}</p>
      )}
    </div>
  );
}
