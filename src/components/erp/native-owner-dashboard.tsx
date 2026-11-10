import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { createNativeRepository } from "@/data/native-repository";
import { formatMinor } from "@/domain/production-modules";
import { ownerDashboardText } from "@/locales/owner-dashboard";
import { useErp } from "./ui-context";
import { useNativeTransport } from "./native-transport";
import { AnimatedAmount } from "./visual-feedback";
import { routeAllowed } from "@/domain/permissions";

export function NativeOwnerDashboard() {
  const { lang, setScope } = useErp(),
    t = ownerDashboardText(lang);
  const transport = useNativeTransport();
  const repo = useMemo(() => createNativeRepository(transport), [transport]);
  const status = useQuery({
    queryKey: ["native-owner-status", transport],
    queryFn: () => repo.status(),
    retry: false,
  });
  const allowed =
    !!status.data?.connected &&
    !!status.data.verified &&
    !status.data.synthetic &&
    routeAllowed(status.data.memberships ?? [], "M01", "/");
  const q = useQuery({
    queryKey: ["native-owner-dashboard", transport],
    queryFn: () => repo.ownerDashboard(),
    retry: false,
    enabled: allowed,
  });
  const cards = [
    { key: "sales" as const, to: "/sales" as const },
    { key: "drawers" as const, to: "/cash" as const },
    { key: "lowStock" as const, to: "/stock/accessories" as const },
    { key: "lateCredits" as const, to: "/debts" as const },
    { key: "waiting" as const, to: "/waiting" as const },
  ];
  if (!allowed) return null;
  return (
    <section className="page-enter owner-home">
      <div className="page-heading">
        <h1>{t.title}</h1>
        <bdi>{q.data?.day}</bdi>
      </div>
      {q.isError && <p role="alert">{t.error}</p>}
      <div className="owner-bento">
        {cards.map(({ key, to }) => (
          <article key={key} className={`owner-card ${key === "sales" ? "owner-sales" : ""}`}>
            <div className="flex items-center gap-3 mb-4">
              <h2 className="text-lg font-medium">{t[key]}</h2>
              {key === "waiting" && !!q.data?.waiting.length && (
                <span className="attention-dot ph-attention-dot" />
              )}
            </div>
            {q.isPending ? (
              <div role="status" className="kpi-skeleton" aria-label={t.loading}>
                <span />
                <span />
              </div>
            ) : q.data && q.data[key].length === 0 ? (
              <p className="text-muted-foreground">{t.empty}</p>
            ) : null}
            {q.data &&
              key === "sales" &&
              q.data.sales.map((r) => (
                <Link
                  key={r.store}
                  to="/sales"
                  onClick={() => setScope(r.store)}
                  className="owner-row"
                >
                  <bdi>{r.store}</bdi>
                  <bdi className="owner-num">{r.count}</bdi>
                  <span className="owner-amount">
                    <AnimatedAmount minor={r.amountMinor} />
                  </span>
                </Link>
              ))}
            {q.data &&
              key === "drawers" &&
              q.data.drawers.map((r) => (
                <Link
                  key={`${r.store}:${r.id}`}
                  to="/cash"
                  onClick={() => setScope(r.store)}
                  className="owner-row"
                >
                  <bdi>{r.store}</bdi>
                  <bdi className="owner-meta">{r.id}</bdi>
                  <bdi className="owner-amount">{formatMinor(r.amountMinor)}</bdi>
                </Link>
              ))}
            {q.data &&
              key === "lowStock" &&
              q.data.lowStock.map((r) => (
                <Link
                  key={`${r.store}:${r.id}`}
                  to="/stock/accessories"
                  onClick={() => setScope(r.store)}
                  className="owner-row"
                >
                  <span>{r.name}</span>
                  <bdi className="owner-meta">{r.store}</bdi>
                  <bdi className="owner-amount">
                    {r.quantity} / {r.threshold}
                  </bdi>
                </Link>
              ))}
            {q.data &&
              key === "lateCredits" &&
              q.data.lateCredits.map((r) => (
                <Link
                  key={r.id}
                  to="/debts"
                  onClick={() => setScope(r.store)}
                  className="owner-row"
                >
                  <bdi>
                    {r.store} {r.id}
                  </bdi>
                  <bdi className="owner-meta">{r.due}</bdi>
                  <bdi className="owner-amount">{formatMinor(r.balanceMinor)}</bdi>
                </Link>
              ))}
            {q.data &&
              key === "waiting" &&
              q.data.waiting.map((r) => (
                <Link
                  key={`${r.kind}:${r.id}`}
                  to={
                    r.kind === "cash"
                      ? "/cash"
                      : r.kind === "adjustment"
                        ? "/stock/accessories"
                        : r.kind === "sav"
                          ? "/sav"
                          : "/transfers"
                  }
                  onClick={() => setScope(r.store)}
                  className="owner-row"
                >
                  <span>{t[r.kind]}</span>
                  <bdi className="owner-meta">{r.store}</bdi>
                  <bdi className="owner-amount">{r.id}</bdi>
                </Link>
              ))}
            <Button asChild variant="outline" className="mt-4 w-full">
              <Link to={to}>{t.open}</Link>
            </Button>
          </article>
        ))}
      </div>
    </section>
  );
}

export function NativeWaitingList() {
  const { lang, setScope } = useErp(),
    t = ownerDashboardText(lang);
  const transport = useNativeTransport();
  const repo = useMemo(() => createNativeRepository(transport), [transport]);
  const q = useQuery({
    queryKey: ["native-owner-dashboard", transport],
    queryFn: () => repo.ownerDashboard(),
    retry: false,
  });
  return (
    <section>
      <div className="page-heading">
        <h1>{t.waiting}</h1>
      </div>
      {q.isPending && <p role="status">{t.loading}</p>}
      {q.isError && <p role="alert">{t.error}</p>}
      {q.data?.waiting.length === 0 && <p>{t.empty}</p>}
      {q.data?.waiting.map((r) => (
        <Button
          asChild
          size="lg"
          variant="outline"
          key={`${r.kind}:${r.id}`}
          className="w-full justify-between mb-3 h-auto min-h-12 whitespace-normal"
        >
          <Link
            to={
              r.kind === "cash"
                ? "/cash"
                : r.kind === "adjustment"
                  ? "/stock/accessories"
                  : r.kind === "sav"
                    ? "/sav"
                    : "/transfers"
            }
            onClick={() => setScope(r.store)}
          >
            {t[r.kind]} ·{" "}
            <bdi>
              {r.store} · {r.countId ?? r.id}
            </bdi>
          </Link>
        </Button>
      ))}
    </section>
  );
}
