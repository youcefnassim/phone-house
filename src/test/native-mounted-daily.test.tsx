// @vitest-environment node
import { JSDOM } from "jsdom";
import { afterAll, afterEach, expect, it, vi } from "vitest";
import { localD1AdapterHarness } from "./local-d1-adapter-harness";
import type { Language } from "@/i18n";
import { translate } from "@/i18n";
import { nativeDailyText } from "@/locales/native-daily";

// Deliberately retain Node WebCrypto/fetch/Request for the signed Worker bridge.
// Only DOM globals are supplied to the exact React components used by the app.
const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost:8080",
});
for (const name of [
  "window",
  "document",
  "navigator",
  "HTMLElement",
  "HTMLInputElement",
  "HTMLImageElement",
  "HTMLCanvasElement",
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
// Text metrics only; barcode bars still come from genuine JsBarcode encoding.
dom.window.HTMLCanvasElement.prototype.getContext = (() => ({
  measureText: (value: string) => ({ width: value.length * 8 }),
})) as unknown as typeof dom.window.HTMLCanvasElement.prototype.getContext;
dom.window.matchMedia = () => ({
  matches: false,
  addListener() {},
  removeListener() {},
  addEventListener() {},
  removeEventListener() {},
  dispatchEvent: () => false,
  media: "",
  onchange: null,
});
const { render, fireEvent, waitFor, cleanup, configure } = await import("@testing-library/react");
configure({
  asyncUtilTimeout: 15000,
  getElementError: (message, container) =>
    new Error(`${message}\n${(container.innerHTML ?? "").slice(-6000)}`),
});
const { ErpContext } = await import("@/components/erp/ui-context");
const { NativeTransportProvider } = await import("@/components/erp/native-transport");
const { NativeDailyPage } = await import("@/components/erp/native-daily-page");
const { createRouter, createRootRoute, createRoute, createMemoryHistory, RouterProvider } =
  await import("@tanstack/react-router");
const { Shell } = await import("@/components/erp/shell");
const phoneModel = "11111111-1111-4111-8111-111111111111";
const accessory = "22222222-2222-4222-8222-222222222222";
type Harness = Awaited<ReturnType<typeof localD1AdapterHarness>>;
const activation = {
  ownerApproved: true,
  environmentVerified: true,
  schemaVerified: true,
  providerConfigured: true,
};
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
afterAll(() => {
  dom.window.close();
  vi.unstubAllGlobals();
});
async function setup() {
  const h = await localD1AdapterHarness();
  await h.db.exec(
    `INSERT INTO catalog VALUES('${phoneModel}','phone','MODEL','Local phone','{}'),('${accessory}','accessory','CABLE','Local cable','{"barcode":"CABLE-1","variant":"USB-C"}'); INSERT INTO prices VALUES('M01','${phoneModel}',10000),('M01','${accessory}',500),('M02','${accessory}',500); INSERT INTO drawers VALUES('drawer1','M01'),('drawer2','M02');`,
  );
  return h;
}
async function mount(
  h: Harness,
  user: string,
  route: string,
  store: "M01" | "M02" = "M01",
  lang: Language = "en",
) {
  const { transport } = await h.repository(user);
  const view = render(
    <ErpContext.Provider
      value={{
        scope: store,
        setScope() {},
        dark: lang === "ar-DZ",
        toggleTheme() {},
        lang,
        setLang() {},
        t: (k, args) => translate(lang, k, args),
      }}
    >
      <NativeTransportProvider transport={transport} activation={activation}>
        <NativeDailyPage route={route} store={store} owner={user === "owner"} />
      </NativeTransportProvider>
    </ErpContext.Provider>,
  );
  const p = (k: Parameters<typeof nativeDailyText>[1]) => nativeDailyText(lang, k);
  await waitFor(() => expect(view.container.querySelector('[aria-busy="true"]')).toBeNull(), {
    timeout: 15000,
  });
  await waitFor(() => expect(view.container.querySelector("form")).not.toBeNull(), {
    timeout: 15000,
  });
  await waitFor(() => expect(view.container.querySelector('[aria-busy="true"]')).toBeNull(), {
    timeout: 15000,
  });
  if (route === "/cash")
    await waitFor(
      () =>
        expect(
          view
            .getAllByRole("button")
            .some(
              (b) =>
                (b.textContent === p("open") || b.textContent === p("close")) &&
                !b.hasAttribute("disabled"),
            ),
        ).toBe(true),
      { timeout: 15000 },
    );
  await waitFor(
    () => expect(view.getAllByRole("button").some((b) => !b.hasAttribute("disabled"))).toBe(true),
    { timeout: 15000 },
  );
  await new Promise((resolve) => setTimeout(resolve, 100));
  await waitFor(() => expect(view.container.querySelector('[aria-busy="true"]')).toBeNull(), {
    timeout: 15000,
  });
  const fill = (name: string, value: string) =>
    fireEvent.change(view.getByLabelText(name, { selector: "input,select" }), {
      target: { value },
    });
  const click = (name: string) => fireEvent.click(view.getByRole("button", { name }));
  const ready = async () => {
    await new Promise((r) => setTimeout(r, 150));
    await waitFor(() => expect(view.container.querySelector('[aria-busy="true"]')).toBeNull(), {
      timeout: 15000,
    });
    await new Promise((r) => setTimeout(r, 150));
    await waitFor(() => expect(view.container.querySelector('[aria-busy="true"]')).toBeNull(), {
      timeout: 15000,
    });
  };
  return { ...view, p, fill, click, ready };
}
function submit(element: HTMLElement) {
  const form = element.closest("form");
  if (!form) throw new Error("FORM_MISSING");
  fireEvent.submit(form);
}
const count = (h: Harness, table: string) =>
  h.db.prepare(`SELECT count(*) FROM ${table}`).first("count(*)");

it("mounted signed HTTP/D1: owner catalog+price, seller receiving/Code128, second seller inline buyer+warranty Cash, immutable history/reprint, blind close and owner flag", async () => {
  const h = await setup();
  try {
    let v = await mount(h, "owner", "/stock/accessories");
    v.click(v.p("newSku"));
    v.fill(v.p("name"), "Created accessory");
    v.fill(v.p("sku"), "CREATED-SKU");
    v.fill(v.p("variant"), "Blue");
    submit(v.getByLabelText(v.p("name")));
    await waitFor(() => expect(v.queryByLabelText(v.p("price"))).not.toBeNull());
    await v.ready();
    await new Promise((r) => setTimeout(r, 150));
    await v.ready();
    v.fill(v.p("price"), "8.00");
    v.click(v.p("price"));
    await v.ready();
    await waitFor(async () => expect(await count(h, "prices")).toBe(4));
    cleanup();
    v = await mount(h, "s1", "/cash");
    v.fill(v.p("opening"), "20.00");
    v.click(v.p("open"));
    await waitFor(async () => expect(await count(h, "shifts")).toBe(1));
    await v.ready();
    cleanup();
    v = await mount(h, "s1", "/stock/phones");
    v.fill(v.p("product"), phoneModel);
    v.fill("IMEI 1", "490154203237518");
    v.fill(v.p("color"), "Black");
    v.fill(v.p("newSupplier"), "Source A");
    v.fill("Code128", "UNIT-1");
    v.click(v.p("receive"));
    await waitFor(async () => expect(await count(h, "phones")).toBe(1));
    await v.ready();
    await waitFor(() => expect(v.container.querySelector("svg[role=img] rect")).not.toBeNull());
    expect(
      await h.db
        .prepare("SELECT json_extract(attributes_json,'$.packaging') FROM phones")
        .first("json_extract(attributes_json,'$.packaging')"),
    ).toBe("NOT_TRACKED"); // owner 2026-11-09: untracked brands, no "unknown"
    expect(await count(h, "standalone_receipts")).toBe(1);
    cleanup();
    v = await mount(h, "s2", "/pos");
    v.fill(v.p("search"), "UNIT-1");
    submit(v.getByLabelText(v.p("search"), { selector: "input" }));
    await waitFor(() => expect(v.queryByLabelText(v.p("surname"))).not.toBeNull());
    v.fill(v.p("surname"), "Synthetic");
    v.fill(v.p("givenName"), "Buyer");
    v.click(v.p("confirm"));
    expect(v.getByRole("alert").textContent).toContain(v.p("invalid"));
    expect(await count(h, "sales")).toBe(0);
    v.fill(`${v.p("warranty")} UNIT-1`, "3");
    v.click(v.p("confirm"));
    await waitFor(
      () => expect(v.queryByRole("button", { name: "Print / Save as PDF" })).not.toBeNull(),
      { timeout: 15000 },
    );
    const stored = await h.db
      .prepare("SELECT snapshot_json FROM receipt_snapshots")
      .first<string>("snapshot_json");
    if (!stored) throw new Error("MISSING_RECEIPT");
    expect(JSON.parse(stored)).toMatchObject({
      operator: "s2",
      payment: "Cash",
      buyer: { surname: "Synthetic", givenName: "Buyer" },
      warranties: [{ months: 3, requested: true }],
    });
    const before = [
      await count(h, "sales"),
      await count(h, "audit_events"),
      await count(h, "cash_movements"),
    ];
    const print = vi.spyOn(dom.window, "print").mockImplementation(() => {
      expect(dom.window.document.body.classList.contains("printing-test-document")).toBe(true);
    });
    v.click("Print / Save as PDF");
    expect(v.getByRole("alert").textContent).toContain("Complete in Settings");
    expect(print).not.toHaveBeenCalled();
    v.click("Ticket");
    v.click("Print / Save as PDF");
    expect(print).toHaveBeenCalledTimes(1);
    expect([
      await count(h, "sales"),
      await count(h, "audit_events"),
      await count(h, "cash_movements"),
    ]).toEqual(before);
    cleanup();
    v = await mount(h, "s1", "/sales");
    await waitFor(() => expect(v.queryByText("Synthetic Buyer")).not.toBeNull());
    v.click(v.p("print"));
    await waitFor(() =>
      expect(v.queryByRole("button", { name: "Print / Save as PDF" })).not.toBeNull(),
    );
    cleanup();
    v = await mount(h, "s1", "/cash");
    v.fill(v.p("counted"), "119.00");
    v.click(v.p("close"));
    await waitFor(async () => expect(await count(h, "shift_closures")).toBe(1));
    await v.ready();
    const closed = await h.db.prepare("SELECT * FROM shift_closures").first();
    cleanup();
    v = await mount(h, "owner", "/cash");
    v.fill(v.p("review"), "FLAGGED");
    v.fill(v.p("note"), "Synthetic discrepancy review");
    v.click(v.p("review"));
    await waitFor(async () => expect(await count(h, "shift_reviews")).toBe(1));
    expect(await h.db.prepare("SELECT * FROM shift_closures").first()).toEqual(closed);
    expect(await h.db.prepare("SELECT quantity FROM accessory_balances").first()).toBeNull();
  } finally {
    cleanup();
    await h.dispose();
  }
}, 120000);

it("mounted M02 AR signed flow: distinct supplier lots, anonymous accessory Bank, no buyer/warranty/cash posting, manager direct close", async () => {
  const h = await setup();
  try {
    let v = await mount(h, "m2", "/cash", "M02", "ar-DZ");
    v.fill(v.p("opening"), "0.00");
    v.click(v.p("open"));
    await waitFor(async () => expect(await count(h, "shifts")).toBe(1));
    await v.ready();
    cleanup();
    v = await mount(h, "m2", "/stock/accessories", "M02", "ar-DZ");
    v.fill(v.p("product"), accessory);
    v.fill(v.p("quantity"), "2");
    v.fill(v.p("newSupplier"), "Supplier one");
    v.click(v.p("receive"));
    await waitFor(async () => expect(await count(h, "standalone_receipts")).toBe(1));
    // D1 commit precedes authorized readback and the form's new request key.
    // Wait for completed UI state rather than racing the first receipt insert.
    await waitFor(() => expect(v.queryByText(v.p("recorded"))).not.toBeNull());
    await v.ready();
    v.fill(v.p("quantity"), "1");
    v.fill(v.p("newSupplier"), "Supplier two");
    v.click(v.p("receive"));
    await waitFor(async () => expect(await count(h, "standalone_receipts")).toBe(2));
    await v.ready();
    expect(
      await h.db
        .prepare("SELECT quantity FROM accessory_balances WHERE store_id='M02'")
        .first("quantity"),
    ).toBe(3);
    cleanup();
    v = await mount(h, "m2", "/pos", "M02", "ar-DZ");
    v.fill(v.p("search"), "CABLE-1");
    submit(v.getByLabelText(v.p("search"), { selector: "input" }));
    await waitFor(() => expect(v.queryByLabelText(`${v.p("quantity")} CABLE-1`)).not.toBeNull(), {
      timeout: 15000,
    });
    await v.ready();
    expect(v.queryByLabelText(v.p("surname"))).toBeNull();
    v.click(translate("ar-DZ", "pos.bank"));
    v.fill(translate("ar-DZ", "pc.method"), "CCP_BARIDIMOB");
    v.click(v.p("confirm"));
    await waitFor(async () => expect(await count(h, "sales")).toBe(1));
    await v.ready();
    expect(await count(h, "customers")).toBe(0);
    expect(await count(h, "cash_movements")).toBe(0);
    expect(
      await h.db
        .prepare("SELECT quantity FROM accessory_balances WHERE store_id='M02'")
        .first("quantity"),
    ).toBe(2);
    cleanup();
    v = await mount(h, "m2", "/cash", "M02", "ar-DZ");
    v.fill(v.p("counted"), "0.00");
    v.click(v.p("close"));
    await waitFor(async () => expect(await count(h, "shift_closures")).toBe(1));
    expect(
      await h.db.prepare("SELECT expected_minor FROM shift_closures").first("expected_minor"),
    ).toBe(0);
  } finally {
    cleanup();
    await h.dispose();
  }
}, 60000);

it("mounted lost committed checkout keeps original key locked, explicit status recovery reads receipt without second checkout", async () => {
  const h = await setup();
  try {
    const { repository } = await h.repository("s1");
    await repository.execute({
      version: "native-2026-11-06",
      key: "setup-open-loss-001",
      operation: "cash.open",
      payload: { store: "M01", id: crypto.randomUUID(), drawerId: "drawer1", opening: "0.00" },
    });
    await repository.receive({
      key: "setup-receive-loss-01",
      store: "M01",
      itemId: accessory,
      quantity: 2,
    });
    const v = await mount(h, "s1", "/pos");
    v.fill(v.p("search"), "CABLE-1");
    submit(v.getByLabelText(v.p("search"), { selector: "input" }));
    await waitFor(() => expect(v.queryByLabelText(`${v.p("quantity")} CABLE-1`)).not.toBeNull(), {
      timeout: 15000,
    });
    await v.ready();
    // Lose the checkout response, not its preceding verified status probe.
    h.loseNextResponse();
    v.click(v.p("confirm"));
    await waitFor(() => expect(v.queryByText(v.p("pending"))).not.toBeNull(), { timeout: 15000 });
    expect(await count(h, "sales")).toBe(1);
    expect(v.getByRole("button", { name: v.p("confirm") })).toBeDisabled();
    const calls = h.calls.filter((c) => c.endsWith("/checkout")).length;
    v.click(v.p("recovery"));
    await waitFor(() =>
      expect(v.queryByRole("button", { name: "Print / Save as PDF" })).not.toBeNull(),
    );
    expect(h.calls.filter((c) => c.endsWith("/checkout")).length).toBe(calls);
    expect(await count(h, "sales")).toBe(1);
  } finally {
    cleanup();
    await h.dispose();
  }
}, 60000);

it("mounted source gate and verified shell never show local children; revoked and cross-store native reads deny", async () => {
  const h = await setup();
  try {
    const { transport, repository } = await h.repository("s1");
    const root = createRootRoute({
      component: () => (
        <Shell>
          <p>LOCAL PRIVATE RECORD MUST NOT RENDER</p>
        </Shell>
      ),
    });
    const pos = createRoute({ getParentRoute: () => root, path: "/pos", component: () => null });
    const router = createRouter({
      routeTree: root.addChildren([pos]),
      history: createMemoryHistory({ initialEntries: ["/pos"] }),
    });
    const v = render(
      <ErpContext.Provider
        value={{
          scope: "M01",
          setScope() {},
          dark: false,
          toggleTheme() {},
          lang: "en",
          setLang() {},
          t: (k, args) => translate("en", k, args),
        }}
      >
        <NativeTransportProvider
          transport={transport}
          activation={{ ...activation, schemaVerified: false }}
        >
          <RouterProvider router={router} />
        </NativeTransportProvider>
      </ErpContext.Provider>,
    );
    await waitFor(() =>
      expect(v.container.textContent).toContain(translate("en", "native.notConnected")),
    );
    expect(v.container.textContent).not.toContain("LOCAL PRIVATE RECORD");
    cleanup();
    await expect(repository.dailyResources("M02")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await h.db.exec("UPDATE sessions SET revoked=1 WHERE id='s1'");
    await expect(repository.dailyResources("M01")).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(await count(h, "sales")).toBe(0);
  } finally {
    cleanup();
    await h.dispose();
  }
}, 60000);

it.each<Language>(["en", "fr-DZ", "ar-DZ"])(
  "%s mounted NOT_RECORDED offers explicit same-key retry, not outcome recovery",
  async (lang) => {
    const h = await setup();
    try {
      const { repository } = await h.repository("s1");
      await repository.execute({
        version: "native-2026-11-06",
        key: "setup-error-open-001",
        operation: "cash.open",
        payload: { store: "M01", id: crypto.randomUUID(), drawerId: "drawer1", opening: "0.00" },
      });
      await repository.receive({
        key: "setup-error-receive-001",
        store: "M01",
        itemId: accessory,
        quantity: 2,
      });
      await h.db
        .prepare(
          // Batch 1d: simulate a non-constraint (unavailable backend) failure; constraint failures are REJECTED.
          "CREATE TRIGGER fail_sale BEFORE INSERT ON sales BEGIN INSERT INTO network_unavailable VALUES(1); END",
        )
        .run();
      const v = await mount(h, "s1", "/pos", "M01", lang);
      v.fill(v.p("search"), "CABLE-1");
      submit(v.getByLabelText(v.p("search"), { selector: "input" }));
      await waitFor(() => expect(v.queryByLabelText(`${v.p("quantity")} CABLE-1`)).not.toBeNull());
      await v.ready();
      v.click(v.p("confirm"));
      await waitFor(() => expect(v.queryByRole("button", { name: v.p("retry") })).not.toBeNull());
      expect(await count(h, "sales")).toBe(0);
      expect(v.queryByRole("button", { name: v.p("recovery") })).toBeNull();
      expect(v.getByRole("button", { name: v.p("confirm") })).toBeDisabled();
      expect(v.queryByRole("button", { name: v.p("cancel") })).not.toBeNull();
      const originalKey = v.container.querySelector("code")?.textContent;
      const calls = h.calls.filter((c) => c.endsWith("/checkout")).length;
      await h.db.exec("DROP TRIGGER fail_sale");
      v.click(v.p("retry"));
      await waitFor(async () => expect(await count(h, "sales")).toBe(1));
      await waitFor(() =>
        expect(v.queryByRole("button", { name: translate(lang, "doc.print") })).not.toBeNull(),
      );
      expect(await h.db.prepare("SELECT command_key FROM sales").first("command_key")).toBe(
        originalKey,
      );
      expect(h.calls.filter((c) => c.endsWith("/checkout"))).toHaveLength(calls + 1);
      expect(h.calls.filter((c) => c.endsWith("/outcome"))).toHaveLength(0);
    } finally {
      cleanup();
      await h.dispose();
    }
  },
  60000,
);

it("Batch 3a signed mounted split discount, park/resume without reservations, manager void and readback", async () => {
  const h = await setup();
  try {
    await h.db.exec(
      `INSERT INTO accessory_balances VALUES('M01','${accessory}',5);INSERT INTO shifts VALUES('33333333-3333-4333-8333-333333333333','M01','drawer1','s1','OPEN',0,NULL);INSERT INTO app_settings VALUES('pos.discountLimitDzd','"1.00"',1);`,
    );
    const v = await mount(h, "s1", "/pos");
    v.fill(v.p("search"), "CABLE-1");
    submit(v.getByLabelText(v.p("search"), { selector: "input" }));
    await waitFor(() => expect(v.queryByLabelText(`${v.p("quantity")} CABLE-1`)).not.toBeNull());
    await v.ready();
    v.click(translate("en", "pc.park"));
    expect(v.queryByLabelText(`${v.p("quantity")} CABLE-1`)).toBeNull();
    expect(await count(h, "sales")).toBe(0);
    expect(
      (
        await h.db
          .prepare(
            `SELECT quantity FROM accessory_balances WHERE store_id='M01' AND item_id='${accessory}'`,
          )
          .first<{ quantity: number }>()
      )?.quantity,
    ).toBe(5);
    v.click("Resume · 1");
    await v.ready();
    v.click(translate("en", "pc.split"));
    v.fill(translate("en", "pc.cash"), "2.00");
    v.fill(translate("en", "pc.bank"), "2.00");
    v.fill(translate("en", "pc.received"), "3.00");
    v.fill(translate("en", "pc.method"), "VIREMENT");
    await waitFor(() => expect(v.queryByLabelText(translate("en", "pc.discount"))).not.toBeNull());
    v.fill(translate("en", "pc.discount"), "1.00");
    v.click(v.p("confirm"));
    await waitFor(async () => expect(await count(h, "sales")).toBe(1));
    await v.ready();
    expect(
      await h.db
        .prepare("SELECT cash_minor,bank_minor,discount_minor FROM sale_settlements")
        .first(),
    ).toMatchObject({ cash_minor: 200, bank_minor: 200, discount_minor: 100 });
    cleanup();
    const manager = await mount(h, "owner", "/sales");
    await waitFor(() =>
      expect(manager.queryByRole("button", { name: translate("en", "pc.void") })).not.toBeNull(),
    );
    vi.spyOn(dom.window, "prompt").mockReturnValue("Correction");
    manager.click(translate("en", "pc.void"));
    await waitFor(async () => expect(await count(h, "sale_voids")).toBe(1));
    await waitFor(() => expect(manager.queryByText(translate("en", "pc.voided"))).not.toBeNull());
    expect(
      (
        await h.db
          .prepare(
            `SELECT quantity FROM accessory_balances WHERE store_id='M01' AND item_id='${accessory}'`,
          )
          .first<{ quantity: number }>()
      )?.quantity,
    ).toBe(5);
    expect(
      (
        await h.db
          .prepare("SELECT sum(amount_minor) n FROM effective_cash_movements")
          .first<{ n: number }>()
      )?.n,
    ).toBe(0);
  } finally {
    cleanup();
    await h.dispose();
  }
}, 120000);

it.each(["en", "fr-DZ", "ar-DZ"] as const)(
  "Batch 3b signed %s credit checkout and posted cash movement read back",
  async (lang) => {
    const h = await setup();
    try {
      await h.db.exec(
        `INSERT INTO accessory_balances VALUES('M01','${accessory}',5);INSERT INTO shifts VALUES('33333333-3333-4333-8333-333333333333','M01','drawer1','s1','OPEN',0,NULL);`,
      );
      const v = await mount(h, "owner", "/pos", "M01", lang);
      v.fill(v.p("search"), "CABLE-1");
      submit(v.getByLabelText(v.p("search"), { selector: "input" }));
      await waitFor(() => expect(v.queryByLabelText(`${v.p("quantity")} CABLE-1`)).not.toBeNull());
      await v.ready();
      v.fill(translate(lang, "cc.amount"), "3");
      v.fill(translate(lang, "cc.due"), "2026-11-08");
      v.fill(v.p("surname"), "Buyer");
      v.fill(v.p("givenName"), "Name");
      v.fill(v.p("contact"), "0550123456");
      v.fill(translate(lang, "pc.received"), "2");
      v.click(v.p("confirm"));
      await waitFor(async () => expect(await count(h, "sale_credits")).toBe(1));
      await v.ready();
      expect(
        await h.db.prepare("SELECT amount_minor FROM sale_credits").first("amount_minor"),
      ).toBe(300);
      expect(
        await h.db.prepare("SELECT cash_minor FROM sale_settlements").first("cash_minor"),
      ).toBe(200);
      cleanup();
      const c = await mount(h, "owner", "/cash", "M01", lang);
      await waitFor(() => expect(c.queryByLabelText(translate(lang, "cc.reason"))).not.toBeNull());
      c.fill(translate(lang, "cash.movementAmount"), "10");
      c.fill(translate(lang, "cc.reason"), "Autre");
      c.fill(translate(lang, "cc.note"), "Owner deposit");
      c.click(translate(lang, "cc.save"));
      await waitFor(async () => expect(await count(h, "cash_adjustments")).toBe(1));
      expect(
        await h.db.prepare("SELECT sum(amount_minor) n FROM effective_cash_movements").first("n"),
      ).toBe(1200);
    } finally {
      cleanup();
      await h.dispose();
    }
  },
  60000,
);
