import { routeAllowed } from "@/domain/permissions";
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useRouterState } from "@tanstack/react-router";
import { Menu, Moon, Sun, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createNativeRepository, type NativeTransportStatus } from "@/data/native-repository";
import type { NativeRoute } from "@/domain/native-repository";
import { ErpContext } from "./ui-context";
import { useErp } from "./context";
import { useNativeTransport } from "./native-transport";
import { NativeDailyPage } from "./native-daily-page";
import { NativePage } from "./native-page";
import { NativeIntakeSettings } from "./native-intake-settings";
import { BrandLogo } from "./brand-logo";
import { languages } from "@/i18n";
import { NativeOwnerDashboard, NativeWaitingList } from "./native-owner-dashboard";
import { ownerDashboardText } from "@/locales/owner-dashboard";

const daily = ["/pos", "/stock/phones", "/stock/accessories", "/cash", "/sales"];
const names: Record<NativeRoute, string> = {
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
/** Native application shell has no workspace subscription, fake actor, local search or KPI. */
export function NativeShell() {
  const ui = useErp();
  const { t } = ui;
  const notConnected = ownerDashboardText(ui.lang).disconnected;
  const { pathname } = useLocation();
  const transitioning = useRouterState({
    select: (s) => s.status === "pending" && s.location.pathname !== s.resolvedLocation?.pathname,
  });
  const transport = useNativeTransport();
  const repository = useMemo(() => createNativeRepository(transport), [transport]);
  const [status, setStatus] = useState<NativeTransportStatus | null>(null);
  const [store, setStore] = useState<"M01" | "M02">("M01");
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<{ id: string; name: string; barcode: string }[]>([]);
  useEffect(() => {
    let active = true;
    void repository
      .status()
      .then((s) => {
        if (!active) return;
        setStatus(s);
        if (
          !s.memberships?.some((m) => m.store === "GLOBAL") &&
          s.memberships?.some((m) => m.store === "M02")
        )
          setStore("M02");
      })
      .catch(() => {
        if (active) setStatus({ connected: false, verified: false });
      });
    return () => {
      active = false;
    };
  }, [repository]);
  const owner =
    status?.memberships?.some((m) => m.role === "SUPER_ADMIN" && m.store === "GLOBAL") === true;
  const allowed =
    status?.connected === true &&
    status.verified === true &&
    !status.synthetic &&
    routeAllowed(status.memberships ?? [], store, pathname);
  const nav = (Object.keys(names) as NativeRoute[]).filter((path) =>
    routeAllowed(status?.memberships ?? [], store, path),
  );
  useEffect(() => {
    if (ui.scope === "M01" || ui.scope === "M02") setStore(ui.scope);
  }, [ui.scope]);
  useEffect(() => {
    setOpen(false);
  }, [pathname]);
  useEffect(() => {
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, []);
  return (
    <ErpContext.Provider
      value={{
        ...ui,
        scope: store,
        setScope: (s) => {
          if (s === "M01" || s === "M02") {
            setStore(s);
            setResults([]);
          }
        },
      }}
    >
      <div className="erp-layout native-layout">
        <aside className={`sidebar ${open ? "sidebar-open" : ""}`}>
          <Link to={owner ? "/" : "/pos"} className="brand">
            <BrandLogo />
          </Link>
          <Button
            variant="ghost"
            size="icon"
            className="mobile-close"
            aria-label={t("shell.closeNav")}
            onClick={() => setOpen(false)}
          >
            <X />
          </Button>
          <nav aria-label={t("retail.daily")}>
            {nav
              .filter((r) => daily.includes(r))
              .map((r) => (
                <Link
                  key={r}
                  to={r}
                  className={`nav-item flex items-center ${pathname === r ? "nav-active" : ""}`}
                  onClick={() => setOpen(false)}
                >
                  {t(names[r] as Parameters<typeof t>[0])}
                </Link>
              ))}
          </nav>
          <details className="mt-4">
            <summary className="nav-item">{t("nav.group.administration")}</summary>
            <nav>
              {nav
                .filter((r) => !daily.includes(r))
                .map((r) => (
                  <Link
                    key={r}
                    to={r}
                    className={`nav-item flex items-center ${pathname === r ? "nav-active" : ""}`}
                    onClick={() => setOpen(false)}
                  >
                    {r === "/waiting"
                      ? ownerDashboardText(ui.lang).waiting
                      : t(names[r] as Parameters<typeof t>[0])}
                  </Link>
                ))}
            </nav>
          </details>
        </aside>
        {open && <div className="mobile-shade" onClick={() => setOpen(false)} aria-hidden="true" />}
        <div className="erp-main min-w-0">
          <header className="topbar native-topbar">
            <Button
              className="mobile-menu"
              variant="ghost"
              size="icon"
              aria-label={t("shell.openNav")}
              onClick={() => setOpen(true)}
            >
              <Menu />
            </Button>
            <form
              className="native-header-search flex min-w-0 gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (allowed)
                  void repository
                    .posSearch({ store, search })
                    .then((r) => setResults(r.items))
                    .catch(() => {
                      setResults([]);
                      setStatus(null);
                    });
              }}
            >
              <Input
                className="min-w-0"
                aria-label={t("shell.findPage")}
                maxLength={80}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                disabled={!allowed}
              />
              <Button
                size="icon"
                variant="ghost"
                type="submit"
                disabled={!allowed}
                aria-label={t("shell.findPage")}
              >
                <Search />
              </Button>
            </form>
            <div className="topbar-actions">
              <select
                aria-label={t("shell.storeScope")}
                value={store}
                disabled={!owner}
                onChange={(e) => {
                  setStore(e.target.value === "M02" ? "M02" : "M01");
                  setResults([]);
                }}
              >
                <option value="M01">Magasin 1 (M01)</option>
                <option value="M02">Magasin 2 (M02)</option>
              </select>
              <select
                aria-label={t("shell.language")}
                value={ui.lang}
                onChange={(e) => {
                  const language = languages.find((l) => l.code === e.target.value);
                  if (language) ui.setLang(language.code);
                }}
              >
                {languages.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.label}
                  </option>
                ))}
              </select>
              <Button
                variant="ghost"
                size="icon"
                aria-label={t(ui.dark ? "shell.lightTheme" : "shell.darkTheme")}
                onClick={ui.toggleTheme}
              >
                {ui.dark ? <Sun /> : <Moon />}
              </Button>
            </div>
          </header>
          <main aria-busy={transitioning}>
            {results.length > 0 && (
              <div className="mb-4 border-b border-border">
                {results.map((r) => (
                  <Link className="block py-2" to="/pos" key={r.id} onClick={() => setResults([])}>
                    {r.name} · <bdi>{r.barcode}</bdi>
                  </Link>
                ))}
              </div>
            )}
            {transitioning ? (
              <p role="status">{t("shell.loading")}</p>
            ) : !allowed ? (
              <p role="alert">{status?.connected ? t("native.forbidden") : notConnected}</p>
            ) : pathname === "/" && owner ? (
              <NativeOwnerDashboard />
            ) : pathname === "/waiting" && owner ? (
              <NativeWaitingList />
            ) : daily.includes(pathname) ? (
              <NativeDailyPage
                key={`${store}:${pathname}`}
                route={pathname}
                store={store}
                owner={owner}
              />
            ) : pathname === "/settings" ? (
              <>
                <NativeIntakeSettings key={store} store={store} owner={owner} />
                <NativePage pathname={pathname} />
              </>
            ) : (
              <NativePage pathname={pathname} />
            )}
          </main>
        </div>
      </div>
    </ErpContext.Provider>
  );
}
