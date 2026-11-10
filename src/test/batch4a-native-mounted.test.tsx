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
const { render, fireEvent, waitFor, cleanup } = await import("@testing-library/react");
const { StockCount } = await import("@/components/erp/stock-count");
const { ErpContext } = await import("@/components/erp/ui-context");
const { NativeTransportProvider } = await import("@/components/erp/native-transport");
const { translate } = await import("@/i18n");
afterEach(cleanup);
afterAll(() => {
  dom.window.close();
  vi.unstubAllGlobals();
});
it("signed HTTP/D1 seller blind count -> difference -> adjustment; owner reads PENDING and reviews OK", async () => {
  const h = await localD1AdapterHarness();
  try {
    await h.db.exec(
      "INSERT INTO catalog VALUES('acc','accessory','ACC','Cable','{}');INSERT INTO accessory_balances VALUES('M01','acc',10);INSERT INTO prices VALUES('M01','acc',500);",
    );
    const { transport, repository } = await h.repository("s1");
    const view = render(
      <ErpContext.Provider
        value={{
          scope: "M01",
          setScope() {},
          dark: false,
          toggleTheme() {},
          lang: "en",
          setLang() {},
          t: (k, a) => translate("en", k, a),
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
          <StockCount native store="M01" />
        </NativeTransportProvider>
      </ErpContext.Provider>,
    );
    fireEvent.click(view.getByRole("button", { name: "Monthly count" }));
    fireEvent.change(view.getByLabelText("Month"), { target: { value: "2026-11" } });
    fireEvent.click(view.getByRole("button", { name: "Start" }));
    await view.findByRole("button", { name: "Submit count" }, { timeout: 15000 });
    expect(view.queryByRole("columnheader", { name: "Expected" })).toBeNull();
    fireEvent.change(view.getByLabelText("Scan / code"), { target: { value: "ACC" } });
    fireEvent.change(view.getByLabelText("Counted"), { target: { value: "8" } });
    fireEvent.click(view.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(view.getByRole("cell", { name: "8" })).toBeTruthy(), {
      timeout: 15000,
    });
    fireEvent.click(view.getByRole("button", { name: "Submit count" }));
    await view.findByRole("cell", { name: "-2" }, { timeout: 15000 });
    fireEvent.change(view.getByLabelText("Reason"), { target: { value: "Monthly count" } });
    fireEvent.click(view.getByRole("button", { name: "Adjust" }));
    await waitFor(
      async () =>
        expect(
          (
            await h.db
              .prepare("SELECT quantity FROM accessory_balances WHERE store_id='M01'")
              .first<{ quantity: number }>()
          )?.quantity,
        ).toBe(8),
      { timeout: 15000 },
    );
    const countId = (await h.db.prepare("SELECT id FROM stock_counts").first<{ id: string }>())?.id;
    if (!countId) throw new Error("count");
    expect((await repository.stockCount("M01", countId)).adjustments?.[0]?.outcome).toBe("PENDING");
    const { repository: owner } = await h.repository("owner"),
      data = await owner.stockCount("M01", countId),
      adjustment = data.adjustments?.[0];
    if (!adjustment) throw new Error("adjustment");
    await owner.execute({
      version: "native-2026-11-06",
      key: "batch4a-owner-review",
      operation: "stock.review",
      payload: { store: "M01", adjustmentId: adjustment.id, outcome: "OK", note: "Checked" },
    });
    expect((await owner.stockCount("M01", countId)).adjustments?.[0]?.outcome).toBe("OK");
  } finally {
    cleanup();
    await h.dispose();
  }
}, 60000);
