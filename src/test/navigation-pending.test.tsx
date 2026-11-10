import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { Shell } from "@/components/erp/shell";

const route = vi.hoisted(() => ({ pathname: "/cash", pending: true }));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to, ...props }: { children: ReactNode; to: string }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
  useLocation: () => ({ pathname: route.pathname }),
  useRouterState: ({ select }: { select: (state: unknown) => unknown }) =>
    select({
      status: route.pending ? "pending" : "idle",
      location: { pathname: route.pathname },
      resolvedLocation: { pathname: route.pending ? "/" : route.pathname },
    }),
}));
vi.mock("@/components/erp/context", () => ({
  useErp: () => ({
    scope: "ALL",
    setScope: vi.fn(),
    dark: false,
    toggleTheme: vi.fn(),
    lang: "en",
    setLang: vi.fn(),
    t: (key: string, params?: Record<string, string>) =>
      params ? key + ":" + Object.values(params).join(",") : key,
  }),
}));
afterEach(cleanup);
describe("Pending workspace navigation regression", () => {
  it("never presents the old overview as cash content while the cash module downloads", () => {
    route.pathname = "/cash";
    route.pending = true;
    render(
      <Shell>
        <h1>Executive overview</h1>
      </Shell>,
    );
    expect(screen.queryByRole("heading", { name: "Executive overview" })).toBeNull();
    expect(screen.getByRole("main")).toHaveAttribute("aria-busy", "true");
  });
  it("never presents the old overview as facility content while the facility module downloads", () => {
    route.pathname = "/facility";
    route.pending = true;
    render(
      <Shell>
        <h1>Executive overview</h1>
      </Shell>,
    );
    expect(screen.queryByRole("heading", { name: "Executive overview" })).toBeNull();
    expect(screen.getByRole("main")).toHaveAttribute("aria-busy", "true");
  });
  it("renders resolved workspace children after navigation completes", () => {
    route.pathname = "/cash";
    route.pending = false;
    render(
      <Shell>
        <h1>Resolved cash workflow</h1>
      </Shell>,
    );
    expect(screen.getByRole("heading", { name: "Resolved cash workflow" })).toBeInTheDocument();
  });
});
