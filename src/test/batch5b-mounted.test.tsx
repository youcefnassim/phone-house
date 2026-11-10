// @vitest-environment node
import { JSDOM } from "jsdom";
import { it, expect, vi, afterAll, afterEach } from "vitest";
import { localD1AdapterHarness } from "./local-d1-adapter-harness";
const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost:8080",
});
for (const name of [
  "window",
  "document",
  "navigator",
  "HTMLElement",
  "HTMLInputElement",
  "HTMLSelectElement",
  "HTMLButtonElement",
  "SVGElement",
  "Element",
  "Node",
  "NodeFilter",
  "DocumentFragment",
  "MutationObserver",
  "CustomEvent",
  "Event",
  "KeyboardEvent",
  "MouseEvent",
])
  vi.stubGlobal(name, Reflect.get(dom.window, name));
vi.stubGlobal("getComputedStyle", dom.window.getComputedStyle.bind(dom.window));
vi.stubGlobal("requestAnimationFrame", (fn: () => void) => setTimeout(fn, 0));
vi.stubGlobal("cancelAnimationFrame", clearTimeout);
vi.stubGlobal("self", dom.window);
vi.stubGlobal("Image", dom.window["Image"]);
vi.stubGlobal("scrollTo", () => {});
const { render, fireEvent, waitFor, cleanup } = await import("@testing-library/react");
const { QueryClient, QueryClientProvider } = await import("@tanstack/react-query");
const { ErpContext } = await import("@/components/erp/ui-context");
const { NativeTransportProvider } = await import("@/components/erp/native-transport");
const { translate } = await import("@/i18n");
const { NativeOwnerDashboard } = await import("@/components/erp/native-owner-dashboard");
const { NativeShell } = await import("@/components/erp/native-shell");
const { NativeStaff } = await import("@/components/erp/native-staff");
const { NativeTransfers } = await import("@/components/erp/native-transfers");
const { createRouter, createRootRoute, createRoute, createMemoryHistory, RouterProvider } =
  await import("@tanstack/react-router");
type H = Awaited<ReturnType<typeof localD1AdapterHarness>>;
async function mount(
  h: H,
  user: string,
  child: React.ReactNode,
  store: "M01" | "M02" = "M01",
  lang: "en" | "fr-DZ" | "ar-DZ" = "en",
) {
  const { transport } = await h.repository(user);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <ErpContext.Provider
        value={{
          scope: store,
          setScope() {},
          dark: false,
          toggleTheme() {},
          lang,
          setLang() {},
          t: (k, a) => translate(lang, k, a),
        }}
      >
        <NativeTransportProvider
          transport={transport}
          activation={{
            ownerApproved: true,
            environmentVerified: true,
            schemaVerified: true,
            providerConfigured: true,
          }}
        >
          {child}
        </NativeTransportProvider>
      </ErpContext.Provider>
    </QueryClientProvider>,
  );
}
afterEach(cleanup);
afterAll(() => {
  dom.window.close();
  vi.unstubAllGlobals();
});

it.each(["en", "fr-DZ", "ar-DZ"] as const)(
  "signed %s owner home reads cash and stock from D1 and follows the list link",
  async (lang) => {
    const h = await localD1AdapterHarness();
    try {
      await h.db.exec(
        "INSERT INTO drawers VALUES('drawer','M01'); INSERT INTO shifts VALUES('shift','M01','drawer','owner','OPEN',12345,NULL); INSERT INTO catalog VALUES('a','accessory','ACC','Owner stock','{\"lowStockThreshold\":3}'); INSERT INTO accessory_balances VALUES('M02','a',2);",
      );
      const root = createRootRoute({ component: () => <NativeShell /> });
      const routes = [
        "/",
        "/stock/accessories",
        "/cash",
        "/sales",
        "/debts",
        "/waiting",
        "/pos",
      ].map((path) => createRoute({ getParentRoute: () => root, path, component: () => null }));
      const router = createRouter({
        routeTree: root.addChildren(routes),
        history: createMemoryHistory({ initialEntries: ["/"] }),
      });
      const v = await mount(h, "owner", <RouterProvider router={router} />, "M01", lang);
      await waitFor(
        () => expect(v.container.querySelector("main")?.textContent).toContain("123.45 DZD"),
        { timeout: 15000 },
      );
      expect(v.container.querySelectorAll("article")).toHaveLength(5);
      const stock = await v.findByRole("link", { name: /Owner stock/ });
      fireEvent.click(stock);
      await waitFor(() => expect(router.state.location.pathname).toBe("/stock/accessories"));
      await waitFor(() =>
        expect(v.getByLabelText(translate(lang, "shell.storeScope"))).toHaveValue("M02"),
      );
      expect(h.calls).toContain("/api/native/owner/dashboard");
    } finally {
      cleanup();
      await h.dispose();
    }
  },
  60000,
);

it.each(["/users", "/transfers", "/sav", "/suppliers", "/reports", "/"])(
  "signed seller direct navigation %s cannot render protected page",
  async (path) => {
    const h = await localD1AdapterHarness();
    try {
      const root = createRootRoute({ component: () => <NativeShell /> });
      const route = createRoute({
        getParentRoute: () => root,
        path,
        component: () => <p>Private route content</p>,
      });
      const router = createRouter({
        routeTree: root.addChildren([route]),
        history: createMemoryHistory({ initialEntries: [path] }),
      });
      const v = await mount(h, "s1", <RouterProvider router={router} />);
      await v.findByText(translate("en", "native.forbidden"), {}, { timeout: 15000 });
      expect(v.queryByText("Private route content")).toBeNull();
      expect(h.calls.filter((c) => !c.endsWith("/status"))).toHaveLength(0);
      const links = Array.from(v.container.querySelectorAll("aside a")).map((a) =>
        a.getAttribute("href"),
      );
      expect(links).toContain("/pos");
      expect(links).not.toContain("/users");
      expect(links).not.toContain("/transfers");
    } finally {
      cleanup();
      await h.dispose();
    }
  },
  60000,
);

it.each([
  {
    user: "s1",
    store: "M01" as const,
    paths: [
      "/",
      "/waiting",
      "/transfers",
      "/sav",
      "/debts",
      "/suppliers",
      "/purchases",
      "/expenses",
      "/audit",
      "/users",
      "/reports",
      "/facility",
      "/unregistered",
    ],
  },
  {
    user: "m2",
    store: "M02" as const,
    paths: ["/", "/waiting", "/users", "/reports", "/facility", "/unregistered"],
  },
])(
  "signed $user cannot render any restricted direct URL or owner cards",
  async ({ user, store, paths }) => {
    const h = await localD1AdapterHarness();
    try {
      for (const path of paths) {
        const root = createRootRoute({ component: () => <NativeShell /> });
        const route = createRoute({
          getParentRoute: () => root,
          path,
          component: () => <p>Restricted content</p>,
        });
        const router = createRouter({
          routeTree: root.addChildren([route]),
          history: createMemoryHistory({ initialEntries: [path] }),
        });
        h.calls.length = 0;
        const v = await mount(h, user, <RouterProvider router={router} />, store);
        await v.findByText(translate("en", "native.forbidden"), {}, { timeout: 15000 });
        expect(v.queryByText("Restricted content")).toBeNull();
        expect(v.container.querySelectorAll("article")).toHaveLength(0);
        expect(h.calls.filter((c) => !c.endsWith("/status"))).toEqual([]);
        cleanup();
      }
    } finally {
      cleanup();
      await h.dispose();
    }
  },
  60000,
);

it.each(["s1", "m2"])(
  "signed %s directly mounted owner home never reads or displays owner data",
  async (user) => {
    const h = await localD1AdapterHarness();
    try {
      const v = await mount(h, user, <NativeOwnerDashboard />, user === "m2" ? "M02" : "M01");
      await waitFor(() => expect(h.calls).toContain("/api/native/status"));
      expect(v.container.querySelectorAll("article")).toHaveLength(0);
      expect(h.calls).not.toContain("/api/native/owner/dashboard");
    } finally {
      cleanup();
      await h.dispose();
    }
  },
  60000,
);

it.each(["staff", "transfers"])(
  "signed native %s pagination reaches row 101 and returns to page one",
  async (kind) => {
    const h = await localD1AdapterHarness();
    try {
      const ids = Array.from({ length: 105 }, (_, i) => `page-${String(i).padStart(3, "0")}`);
      if (kind === "staff") {
        await h.db.exec(
          `INSERT INTO accounts VALUES ${ids.map((id) => `('${id}',1)`).join(",")}; INSERT INTO memberships VALUES ${ids.map((id) => `('${id}','M01','SELLER')`).join(",")};`,
        );
      } else {
        await h.db.exec(
          `INSERT INTO transfers VALUES ${ids.map((id) => `('${id}','M01','M02','APPROVALS')`).join(",")};`,
        );
      }
      const v = await mount(
        h,
        "owner",
        kind === "staff" ? <NativeStaff store="M01" /> : <NativeTransfers store="M01" />,
      );
      const pageRows = () =>
        kind === "staff"
          ? v.container.querySelectorAll("section > div > bdi")
          : v.container.querySelectorAll("select option[value^='page-']");
      await waitFor(() => expect(pageRows()).toHaveLength(100), { timeout: 15000 });
      expect(v.getByRole("button", { name: /^Previous$/ })).toBeDisabled();
      fireEvent.click(v.getByRole("button", { name: /^Next$/ }));
      await waitFor(() => expect(pageRows().length).toBe(kind === "staff" ? 7 : 5), {
        timeout: 15000,
      });
      expect(v.container.textContent).toContain("page-104");
      expect(v.getByRole("button", { name: /^Next$/ })).toBeDisabled();
      fireEvent.click(v.getByRole("button", { name: /^Previous$/ }));
      await waitFor(() => expect(pageRows()).toHaveLength(100), { timeout: 15000 });
      expect(v.container.textContent).toContain("page-000");
    } finally {
      cleanup();
      await h.dispose();
    }
  },
  60000,
);
