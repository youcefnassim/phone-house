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
const { QueryClient, QueryClientProvider } = await import("@tanstack/react-query");
const { NativeStaff } = await import("@/components/erp/native-staff");
const { NativeTransfers } = await import("@/components/erp/native-transfers");
const { NativeUsedPurchase } = await import("@/components/erp/native-used-purchase");
const { NativeIntakeSettings } = await import("@/components/erp/native-intake-settings");
const { NativeCustomers } = await import("@/components/erp/native-customers");
const { NativeSav } = await import("@/components/erp/native-batch4b");
const { ErpContext } = await import("@/components/erp/ui-context");
const { NativeTransportProvider } = await import("@/components/erp/native-transport");
const { translate } = await import("@/i18n");
const { nativeCompletenessText } = await import("@/locales/native-completeness");
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
  "signed %s owner adds/deactivates/reactivates staff and reads role/store back",
  async (lang) => {
    const h = await localD1AdapterHarness();
    try {
      const t = nativeCompletenessText(lang),
        v = await mount(h, "owner", <NativeStaff store="M01" />, "M01", lang);
      await v.findByRole("button", { name: t.add }, { timeout: 15000 });
      fireEvent.change(v.getByLabelText(t.user), { target: { value: "batch5a-staff" } });
      fireEvent.click(v.getByRole("button", { name: t.add }));
      await v.findByText("batch5a-staff", { selector: "bdi" }, { timeout: 15000 });
      fireEvent.click(
        v
          .getByText("batch5a-staff", { selector: "bdi" })
          .parentElement?.querySelector("button:last-child") as HTMLElement,
      );
      await waitFor(
        async () =>
          expect(
            (
              await h.db
                .prepare("SELECT active FROM accounts WHERE id='batch5a-staff'")
                .first<{ active: number }>()
            )?.active,
          ).toBe(0),
        { timeout: 15000 },
      );
      await waitFor(() => expect(v.queryByText(t.loading)).toBeNull(), { timeout: 15000 });
      fireEvent.change(v.getByLabelText(t.user), { target: { value: "batch5a-staff" } });
      fireEvent.change(v.getByLabelText(t.role), { target: { value: "MANAGER" } });
      fireEvent.click(v.getByRole("button", { name: `${t.activate} / ${t.save}` }));
      await waitFor(
        async () =>
          expect(
            await h.db
              .prepare(
                "SELECT active,role FROM accounts JOIN memberships ON user_id=id WHERE id='batch5a-staff'",
              )
              .first(),
          ).toMatchObject({ active: 1, role: "MANAGER" }),
        { timeout: 15000 },
      );
    } finally {
      cleanup();
      await h.dispose();
    }
  },
  60000,
);
it("signed owner settings hydrate saved values; unknown response locks then recovers without second write", async () => {
  const h = await localD1AdapterHarness();
  try {
    await h.db.exec(`INSERT INTO app_settings VALUES('pos.discountLimitDzd','"17.25"',1000)`);
    const v = await mount(h, "owner", <NativeIntakeSettings store="M01" owner />);
    const input = await v.findByLabelText(translate("en", "pc.limit"), {}, { timeout: 15000 });
    expect((input as HTMLInputElement).value).toBe("17.25");
    await new Promise((r) => setTimeout(r, 200));
    fireEvent.change(input, { target: { value: "19.50" } });
    h.loseNextResponse();
    fireEvent.click(input.closest("section")?.querySelector("button") as HTMLElement);
    await v.findByRole("button", { name: "Check transaction" }, { timeout: 15000 });
    const before = h.calls.filter((c) => c.endsWith("/command")).length;
    fireEvent.click(v.getByRole("button", { name: "Check transaction" }));
    await waitFor(() => expect(v.queryByRole("button", { name: "Check transaction" })).toBeNull(), {
      timeout: 15000,
    });
    expect(h.calls.filter((c) => c.endsWith("/command")).length).toBe(before);
    expect(
      (
        await h.db
          .prepare("SELECT value_json FROM app_settings WHERE key='pos.discountLimitDzd'")
          .first<{ value_json: string }>()
      )?.value_json,
    ).toBe('"19.50"');
  } finally {
    cleanup();
    await h.dispose();
  }
}, 60000);
it("signed customer screen searches and reads linked sale history", async () => {
  const h = await localD1AdapterHarness();
  try {
    await h.db.exec(
      "INSERT INTO catalog VALUES('22222222-2222-4222-8222-222222222222','accessory','ACC','Cable','{}');INSERT INTO accessory_balances VALUES('M01','22222222-2222-4222-8222-222222222222',3);INSERT INTO prices VALUES('M01','22222222-2222-4222-8222-222222222222',500);INSERT INTO drawers VALUES('d','M01');INSERT INTO shifts VALUES('sh','M01','d','s1','OPEN',0,NULL);INSERT INTO customers VALUES('buyer','M01','Buyer Name','REF');INSERT INTO customer_details VALUES('buyer','M01','Buyer','Name','0555','buyer name','0555');",
    );
    const { repository } = await h.repository("s1");
    await h.db.exec(
      "INSERT INTO commands VALUES('history-key','s1','M01','pos.checkout','hash','DONE','history-sale','{}',1000);INSERT INTO sales(id,command_key,store_id,shift_id,seller_id,customer_id,total_minor,tender,tendered_minor,change_minor) VALUES('history-sale','history-key','M01','sh','s1','buyer',500,'Cash',500,0);INSERT INTO receipt_snapshots VALUES('history-sale',1000,'{}')",
    );
    const v = await mount(h, "s1", <NativeCustomers store="M01" />);
    await v.findByRole("option", { name: "Buyer Name · 0555" }, { timeout: 15000 });
    fireEvent.change(v.getByLabelText("Customer"), { target: { value: "buyer" } });
    await v.findByText("5.00 DZD", {}, { timeout: 15000 });
    expect(v.getByRole("heading", { name: "Customer history · Buyer Name" })).toBeTruthy();
  } finally {
    cleanup();
    await h.dispose();
  }
}, 60000);
it("signed native transfer stock picker -> approvals/scans -> partial receive -> owner cancel preserves arrived balance", async () => {
  const h = await localD1AdapterHarness();
  try {
    await h.db.exec(
      "INSERT INTO catalog VALUES('acc','accessory','ACC','Cable','{}');INSERT INTO accessory_balances VALUES('M01','acc',10);INSERT INTO prices VALUES('M01','acc',500)",
    );
    let v = await mount(h, "owner", <NativeTransfers store="M01" />);
    await v.findByRole("option", { name: "Cable · ACC" }, { timeout: 15000 });
    fireEvent.change(v.getByLabelText("Product"), { target: { value: "acc" } });
    fireEvent.change(v.getByLabelText("Quantity"), { target: { value: "4" } });
    await waitFor(
      () =>
        expect(v.getByRole("button", { name: "Add line" }).hasAttribute("disabled")).toBe(false),
      { timeout: 15000 },
    );
    fireEvent.click(v.getByRole("button", { name: "Add line" }));
    fireEvent.click(v.getByRole("button", { name: "Create transfer" }));
    await v.findByRole("button", { name: "Approve · Super Admin" }, { timeout: 15000 });
    fireEvent.click(v.getByRole("button", { name: "Approve · Super Admin" }));
    await waitFor(
      () => expect(v.queryByRole("button", { name: "Approve · Super Admin" })).toBeNull(),
      { timeout: 15000 },
    );
    const row = await h.db.prepare("SELECT id FROM transfers").first<{ id: string }>();
    if (!row) throw new Error("transfer");
    const { repository: m2 } = await h.repository("m2");
    await m2.execute({
      version: "native-2026-11-06",
      key: "batch5a-approval-m2",
      operation: "transfer.approve",
      payload: { store: "M02", transferId: row.id, approval: "M02_MANAGER" },
    });
    fireEvent.change(v.getByLabelText("Scan"), { target: { value: "ACC" } });
    fireEvent.change(v.getAllByLabelText("Quantity").at(-1) as HTMLElement, {
      target: { value: "4" },
    });
    fireEvent.click(v.getByRole("button", { name: "Scan" }));
    await waitFor(() => expect(v.queryByText("Loading…")).toBeNull(), { timeout: 15000 });
    fireEvent.change(v.getByLabelText("Carrier"), { target: { value: "Carrier Name" } });
    fireEvent.change(v.getByLabelText("Note"), { target: { value: "Manifest" } });
    fireEvent.click(v.getByRole("button", { name: "Dispatch" }));
    await waitFor(() => expect(v.queryByRole("button", { name: "Dispatch" })).toBeNull(), {
      timeout: 15000,
    });
    v.unmount();
    v = await mount(h, "m2", <NativeTransfers store="M02" />, "M02");
    await v.findByRole("option", { name: new RegExp(row.id) }, { timeout: 15000 });
    fireEvent.change(v.getByLabelText("Transfer"), { target: { value: row.id } });
    await v.findByLabelText("Scan", {}, { timeout: 15000 });
    fireEvent.change(v.getByLabelText("Scan"), { target: { value: "ACC" } });
    fireEvent.change(v.getAllByLabelText("Quantity").at(-1) as HTMLElement, {
      target: { value: "2" },
    });
    fireEvent.click(v.getByRole("button", { name: "Scan" }));
    await waitFor(() => expect(v.queryByText("Loading…")).toBeNull(), { timeout: 15000 });
    fireEvent.change(v.getByLabelText("Note"), { target: { value: "Two arrived" } });
    fireEvent.click(v.getByRole("button", { name: "Receive arrived goods" }));
    await waitFor(
      async () =>
        expect(
          (
            await h.db
              .prepare("SELECT quantity FROM accessory_balances WHERE store_id='M02'")
              .first<{ quantity: number }>()
          )?.quantity,
        ).toBe(2),
      { timeout: 15000 },
    );
    v.unmount();
    v = await mount(h, "owner", <NativeTransfers store="M01" />);
    await v.findByRole("option", { name: new RegExp(row.id) }, { timeout: 15000 });
    fireEvent.change(v.getByLabelText("Transfer"), { target: { value: row.id } });
    await v.findByLabelText("Reason", {}, { timeout: 15000 });
    fireEvent.change(v.getByLabelText("Reason"), { target: { value: "Return missing" } });
    fireEvent.click(v.getByRole("button", { name: "Cancel transfer" }));
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
    expect(
      (
        await h.db
          .prepare("SELECT quantity FROM accessory_balances WHERE store_id='M02'")
          .first<{ quantity: number }>()
      )?.quantity,
    ).toBe(2);
  } finally {
    cleanup();
    await h.dispose();
  }
}, 90000);
it("signed native used acquisition reads private identity back and uncertain result recovers only original key", async () => {
  const h = await localD1AdapterHarness();
  try {
    await h.db.exec(
      `INSERT INTO catalog VALUES('used','phone','USED','Used model','{"condition":"USED"}');INSERT INTO drawers VALUES('d2','M02');INSERT INTO shifts VALUES('sh2','M02','d2','m2','OPEN',10000,NULL)`,
    );
    const v = await mount(h, "m2", <NativeUsedPurchase store="M02" owner={false} />, "M02");
    await v.findByRole("button", { name: "Buy used phone" }, { timeout: 15000 });
    fireEvent.click(v.getByRole("button", { name: "Buy used phone" }));
    await v.findByRole("option", { name: "Used model" }, { timeout: 15000 });
    fireEvent.change(v.getByLabelText("Model"), { target: { value: "used" } });
    for (const [label, value] of [
      ["Surname", "PrivateSurname"],
      ["Given name", "PrivateName"],
      ["Phone", "0555123456"],
      ["IMEI", "356938035643809"],
      ["Serial", "SN-USED"],
      ["Amount", "20"],
      ["Cash", "sh2"],
    ])
      fireEvent.change(v.getByLabelText(label as string), { target: { value } });
    fireEvent.click(v.getByRole("checkbox"));
    h.loseNextResponse();
    fireEvent.click(v.getByRole("button", { name: "Save" }));
    await v.findByRole("button", { name: "Check transaction" }, { timeout: 15000 });
    const before = h.calls.filter((c) => c.endsWith("/command")).length;
    fireEvent.click(v.getByRole("button", { name: "Check transaction" }));
    await v.findByText(/PrivateSurname PrivateName/, {}, { timeout: 15000 });
    expect(h.calls.filter((c) => c.endsWith("/command")).length).toBe(before);
    expect(v.container.textContent).not.toContain("20.00 DZD");
  } finally {
    cleanup();
    await h.dispose();
  }
}, 60000);
