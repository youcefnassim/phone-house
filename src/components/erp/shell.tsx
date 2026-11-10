import { Link, useLocation, useRouterState } from "@tanstack/react-router";
import { useState, useEffect, type ReactNode } from "react";
import {
  LayoutDashboard,
  ScanLine,
  Wallet,
  Smartphone,
  Headphones,
  Shapes,
  Users,
  ReceiptText,
  Truck,
  PackagePlus,
  ArrowLeftRight,
  Landmark,
  Wrench,
  ChartNoAxesCombined,
  Settings,
  ShieldCheck,
  History,
  Moon,
  Sun,
  ChevronDown,
  Menu,
  X,
  ArrowUpRight,
  Bell,
  Search,
  PanelLeftClose,
  Languages,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { BrandLogo } from "./brand-logo";
import { NativeShell } from "./native-shell";
import { useNativeRequested } from "./native-transport";
import { useErp } from "./context";
import {
  useTestWorkspace,
  reviewActor,
  setReviewActor,
  workspaceIdentities,
} from "@/data/test-workspace";
import { permits, routeOperation, routeAllowed } from "@/domain/permissions";
import { ledgerView } from "@/data/ledger-view";
import { displayName } from "@/locales/display";
import type { Scope } from "@/domain/erp";
import { languages, type Language, type MessageKey } from "@/i18n";
type NavPath =
  | "/"
  | "/pos"
  | "/sales"
  | "/cash"
  | "/stock/phones"
  | "/stock/accessories"
  | "/catalog"
  | "/transfers"
  | "/customers"
  | "/debts"
  | "/suppliers"
  | "/purchases"
  | "/expenses"
  | "/facility"
  | "/sav"
  | "/reports"
  | "/users"
  | "/audit"
  | "/settings";
interface NavItem {
  key: MessageKey;
  path: NavPath;
  icon: typeof LayoutDashboard;
}
export const navigation: { labelKey: MessageKey; items: NavItem[] }[] = [
  {
    labelKey: "retail.daily",
    items: [
      { key: "nav.overview", path: "/", icon: LayoutDashboard },
      { key: "nav.pos", path: "/pos", icon: ScanLine },
      { key: "nav.phones", path: "/stock/phones", icon: Smartphone },
      { key: "nav.accessories", path: "/stock/accessories", icon: Headphones },
      { key: "nav.cash", path: "/cash", icon: Wallet },
    ],
  },
  {
    labelKey: "retail.stock",
    items: [
      { key: "sale.title", path: "/sales", icon: ReceiptText },
      { key: "nav.catalog", path: "/catalog", icon: Shapes },
      { key: "nav.transfers", path: "/transfers", icon: ArrowLeftRight },
    ],
  },
  {
    labelKey: "retail.management",
    items: [
      { key: "nav.customers", path: "/customers", icon: Users },
      { key: "nav.debts", path: "/debts", icon: ReceiptText },
      { key: "nav.suppliers", path: "/suppliers", icon: Truck },
      { key: "nav.purchases", path: "/purchases", icon: PackagePlus },
      { key: "nav.expenses", path: "/expenses", icon: Wallet },
      { key: "nav.facility", path: "/facility", icon: Landmark },
      { key: "nav.sav", path: "/sav", icon: Wrench },
      { key: "nav.reports", path: "/reports", icon: ChartNoAxesCombined },
    ],
  },
  {
    labelKey: "retail.admin",
    items: [
      { key: "nav.users", path: "/users", icon: ShieldCheck },
      { key: "nav.audit", path: "/audit", icon: History },
      { key: "nav.settings", path: "/settings", icon: Settings },
    ],
  },
];
export function Shell({ children }: { children: ReactNode }) {
  const native = useNativeRequested();
  return native ? <NativeShell /> : <LocalShell>{children}</LocalShell>;
}
function LocalShell({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const transitioning = useRouterState({
    select: (state) =>
      state.status === "pending" && state.location.pathname !== state.resolvedLocation?.pathname,
  });
  const { scope, setScope, dark, toggleTheme, lang, setLang, t } = useErp();
  const ws = useTestWorkspace();
  const actor = reviewActor(ws);
  const visibleNavigation = navigation.map((group) => ({
    ...group,
    items: group.items.filter(
      (item) =>
        actor &&
        permits(
          actor.role,
          actor.role === "SUPER_ADMIN" ? "GLOBAL" : (actor.stores[0] ?? ""),
          scope === "ALL" ? (actor.stores[0] ?? "M01") : scope,
          routeOperation(item.path),
        ),
    ),
  }));
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [notifications, setNotifications] = useState(false);
  const ledger = ledgerView(ws, scope);
  const needle = search.trim().toLocaleLowerCase();
  const matches = needle
    ? [
        ...ws.phones
          .filter(
            (p) =>
              (scope === "ALL" || p.store === scope) &&
              [p.name, p.code, p.imei, p.imei2, p.draft?.serial]
                .join(" ")
                .toLocaleLowerCase()
                .includes(needle),
          )
          .map((p) => ({
            id: p.id,
            name: p.name,
            detail: p.code ?? p.imei,
            path: "/stock/phones" as const,
          })),
        ...ws.accessories
          .filter(
            (p) =>
              (scope === "ALL" || p.store === scope) &&
              [p.name, p.code, p.id, p.detail].join(" ").toLocaleLowerCase().includes(needle),
          )
          .map((p) => ({
            id: p.id,
            name: p.name,
            detail: p.code ?? p.id,
            path: "/stock/accessories" as const,
          })),
        ...ws.sales
          .filter(
            (p) =>
              (scope === "ALL" || p.store === scope) &&
              [p.customer, p.id].join(" ").toLocaleLowerCase().includes(needle),
          )
          .map((p) => ({ id: p.id, name: p.customer, detail: p.id, path: "/sales" as const })),
      ].slice(0, 8)
    : [];
  const title = navigation.flatMap((g) => g.items).find((i) => i.path === pathname);
  const titleText = title ? t(title.key) : t("shell.workspace");
  const allowed =
    actor &&
    routeAllowed(
      [
        {
          role: actor.role,
          store: actor.role === "SUPER_ADMIN" ? "GLOBAL" : (actor.stores[0] ?? ""),
        },
      ],
      scope === "ALL" ? (actor.stores[0] ?? "M01") : scope,
      pathname,
    );
  useEffect(() => {
    setOpen(false);
  }, [pathname]);
  useEffect(() => {
    if (transitioning) document.title = `${titleText} | Phone House Maghnia`;
  }, [transitioning, titleText]);
  return (
    <div className="erp-layout">
      <aside className={`sidebar ${open ? "sidebar-open" : ""}`}>
        <Link to="/" className="brand">
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
          {visibleNavigation.map((group, index) => {
            const links = group.items.map((item) => (
              <Button
                key={item.path}
                asChild
                variant="ghost"
                className={`nav-item ${pathname === item.path ? "nav-active" : ""}`}
              >
                <Link
                  to={item.path}
                  aria-current={pathname === item.path ? "page" : undefined}
                  onClick={() => setOpen(false)}
                >
                  <item.icon />
                  <span>{t(item.key)}</span>
                </Link>
              </Button>
            ));
            return index === 0 ? (
              <div className="nav-group" key={group.labelKey}>
                <div className="nav-label">{t(group.labelKey)}</div>
                {links}
              </div>
            ) : (
              <details
                className="nav-group nav-disclosure"
                key={`${group.labelKey}-${group.items.some((i) => i.path === pathname)}`}
                open={group.items.some((i) => i.path === pathname) || undefined}
              >
                <summary>
                  {t(group.labelKey)}
                  <ChevronDown size={15} />
                </summary>
                {links}
              </details>
            );
          })}
        </nav>
        <div className="sidebar-bottom">
          <Button variant="ghost" asChild className="operator">
            <Link to="/auth">
              <span className="avatar">DO</span>
              <span>
                {t("review.operator")}
                <small>{t("review.about")}</small>
              </span>
              <ArrowUpRight />
            </Link>
          </Button>
        </div>
      </aside>
      {open && <div className="mobile-shade" onClick={() => setOpen(false)} />}
      <div className="erp-main">
        <header className="topbar">
          <div className="breadcrumb">
            <Button
              variant="ghost"
              size="icon"
              aria-label={t("shell.openNav")}
              onClick={() => setOpen(!open)}
            >
              <Menu className="mobile-menu" />
              <PanelLeftClose className="desktop-menu" />
            </Button>
            <strong>{titleText}</strong>
          </div>
          <div className="toolbar-search">
            <label>
              <Search size={17} />
              <input
                aria-label={t("design.search")}
                placeholder={t("design.search")}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <button
                type="button"
                className="quick-palette-trigger"
                onClick={() => {
                  const event = new KeyboardEvent("keydown", { key: "k", ctrlKey: true });
                  document.dispatchEvent(event);
                }}
                title="Palette de commandes (Ctrl+K)"
              >
                <kbd>Ctrl K</kbd>
              </button>
            </label>
            {needle && (
              <div className="search-results">
                {matches.map((m) => (
                  <Link key={m.id} to={m.path} onClick={() => setSearch("")}>
                    <strong>{m.name}</strong>
                    <small>
                      <bdi>{m.detail}</bdi>
                    </small>
                  </Link>
                ))}
                {navigation
                  .flatMap((g) => g.items)
                  .filter((i) => t(i.key).toLocaleLowerCase().includes(needle))
                  .map((i) => (
                    <Link key={i.path} to={i.path} onClick={() => setSearch("")}>
                      {t(i.key)}
                    </Link>
                  ))}
                {matches.length === 0 && (
                  <Button variant="link" asChild>
                    <Link to="/pos" onClick={() => setSearch("")}>
                      {t("nav.pos")}
                    </Link>
                  </Button>
                )}
              </div>
            )}
          </div>
          <div className="topbar-actions">
            <label className="store-select">
              <Languages size={15} />
              <select
                aria-label={t("shell.language")}
                value={lang}
                onChange={(e) => setLang(e.target.value as Language)}
              >
                {languages.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.label}
                  </option>
                ))}
              </select>
              <ChevronDown size={13} />
            </label>
            <label className="store-select">
              <select
                aria-label={t("staff.operatorPreview")}
                value={actor?.id ?? "U-OWN"}
                onChange={(e) => setReviewActor(e.target.value)}
              >
                {workspaceIdentities(ws)
                  .filter((u) => u.active)
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      {displayName(lang, u.name)}
                    </option>
                  ))}
              </select>
            </label>
            <label className="store-select">
              <Landmark size={15} />
              <select
                aria-label={t("shell.storeScope")}
                value={scope}
                disabled={actor?.role !== "SUPER_ADMIN"}
                onChange={(e) => setScope(e.target.value as Scope)}
              >
                <option value="ALL">{t("shell.allStores")}</option>
                <option value="M01">{t("shell.store1")}</option>
                <option value="M02">{t("shell.store2")}</option>
              </select>
              <ChevronDown size={13} />
            </label>
            <Button
              variant="ghost"
              size="icon"
              aria-label={dark ? t("shell.lightTheme") : t("shell.darkTheme")}
              title={dark ? t("shell.lightTheme") : t("shell.darkTheme")}
              onClick={toggleTheme}
            >
              {dark ? <Sun /> : <Moon />}
            </Button>
            <Button variant="ghost" size="icon" asChild>
              <Link to="/settings" aria-label={t("nav.settings")} title={t("nav.settings")}>
                <Settings />
              </Link>
            </Button>
            <div className="notification-wrap">
              <Button
                variant="ghost"
                size="icon"
                aria-label={t("design.notifications")}
                title={t("design.notifications")}
                aria-expanded={notifications}
                onClick={() => setNotifications(!notifications)}
              >
                <Bell />
              </Button>
              {notifications && (
                <div className="notification-panel">
                  <strong>{t("design.alerts")}</strong>
                  <p>
                    <Link to="/stock/accessories" onClick={() => setNotifications(false)}>
                      {t("inv.accTitle")} · {ledger.lowStock}
                    </Link>
                  </p>
                  <p>
                    <Link to="/cash" onClick={() => setNotifications(false)}>
                      {t("cash.reviewPending")} · {ledger.pendingReviews}
                    </Link>
                  </p>
                </div>
              )}
            </div>
            <span className="avatar top-avatar">
              {actor?.role === "SUPER_ADMIN" ? "SA" : actor?.role === "MANAGER" ? "M2" : "S"}
            </span>
          </div>
        </header>
        <main aria-busy={transitioning}>
          {transitioning ? (
            <div className="page-heading" role="status">
              <div>
                <h1>
                  {titleText}
                  <span className="heading-dot">.</span>
                </h1>
                <p>{t("shell.loading")}</p>
              </div>
            </div>
          ) : !allowed ? (
            <p role="alert">{t("native.forbidden")}</p>
          ) : (
            children
          )}
        </main>
        <footer className="page-footer">
          <span>
            PHONE HOUSE MAGHNIA <span> / </span>
          </span>
          <span>
            <Link to="/settings">{t("review.about")}</Link>
          </span>
        </footer>
      </div>
    </div>
  );
}
