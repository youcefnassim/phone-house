// @vitest-environment node
import { JSDOM } from "jsdom";
import { describe, it, expect, vi, afterAll, afterEach } from "vitest";
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

const { StockCount } = await import("@/components/erp/stock-count");
const { NativeSupplierPayables } = await import("@/components/erp/supplier-payables");
const { NativeReports } = await import("@/components/erp/native-batch4b");
const { NativeDailyPage } = await import("@/components/erp/native-daily-page");
const phone = "11111111-1111-4111-8111-111111111111";
const replacement = "22222222-2222-4222-8222-222222222222";
const shift = "33333333-3333-4333-8333-333333333333";
async function seedSale(h: H, patch: Record<string, unknown> = {}) {
  await h.db.exec(
    `INSERT INTO catalog VALUES('model','phone','MODEL','Phone','{"condition":"NEW"}');INSERT INTO prices VALUES('M01','model',10000);INSERT INTO phones(id,store_id,catalog_id,barcode,state,attributes_json,serial) VALUES('${phone}','M01','model','UNIT','AVAILABLE','{}','SN'),('${replacement}','M01','model','NEXT','AVAILABLE','{}','SN2');INSERT INTO phone_identifiers VALUES('490154203237518','${phone}',1),('356938035643809','${replacement}',1);INSERT INTO drawers VALUES('d','M01');INSERT INTO shifts VALUES('${shift}','M01','d','s1','OPEN',100000,NULL)`,
  );
  const { repository } = await h.repository("owner");
  const receipt = await repository.checkout({
    contractVersion: "native-pos-2026-11-07",
    idempotencyKey: "original-sale-key",
    clientRequestId: crypto.randomUUID(),
    payload: {
      store: "M01",
      shiftId: shift,
      buyer: { surname: "Buyer", givenName: "Name", contact: "0555555555" },
      lines: [{ kind: "phone", itemId: phone, quantity: "1" }],
      tender: "Cash",
      tenderedAmount: "100",
      warranties: [{ itemId: phone, requested: true, provider: "MANUFACTURER", months: 12 }],
      ...patch,
    },
  });
  return { repository, receipt };
}
async function openedCase(h: H, patch: Record<string, unknown> = {}) {
  const seeded = await seedSale(h, patch);
  const v = await mount(h, "owner", <NativeSav store="M01" owner approve />);
  await v.findByRole("option", { name: /Buyer Name/ }, { timeout: 15000 });
  fireEvent.change(v.getByLabelText("Sale"), { target: { value: seeded.receipt.saleId } });
  fireEvent.click(await v.findByRole("button", { name: /Phone · 490154/ }));
  await waitFor(
    () =>
      expect(
        (v.getByLabelText("Replacement phone", { selector: "input" }) as HTMLInputElement).value,
      ).toBe(phone),
    { timeout: 15000 },
  );
  fireEvent.change(v.getByLabelText("Issue"), { target: { value: "Screen issue" } });
  fireEvent.click(v.getByRole("button", { name: "Open case" }));
  await v.findByRole("option", { name: /Screen issue/ }, { timeout: 15000 });
  const row = await h.db
    .prepare("SELECT id,sale_id,customer_id,phone_id FROM service_cases")
    .first<{ id: string; sale_id: string; customer_id: string; phone_id: string }>();
  if (!row) throw new Error("CASE_MISSING");
  expect(row).toMatchObject({
    sale_id: seeded.receipt.saleId,
    phone_id: phone,
    customer_id: (await seeded.repository.receipt({ store: "M01", id: seeded.receipt.saleId }))
      .customerId,
  });
  fireEvent.change(v.getByLabelText("Case"), { target: { value: row.id } });
  await v.findByLabelText("Status", {}, { timeout: 15000 });
  await waitFor(() => expect(v.container.querySelector("fieldset[disabled]")).toBeNull(), {
    timeout: 15000,
  });
  return { ...seeded, v, caseId: row.id };
}
async function scalar(h: H, sql: string) {
  return Object.values((await h.db.prepare(sql).first()) ?? {})[0];
}
function fill(
  v: Awaited<ReturnType<typeof mount>>,
  label: string,
  value: string,
  selector = "input,select",
) {
  const input = v.getAllByLabelText(label, { selector })[0];
  if (!input) throw new Error(`Missing field: ${label}`);
  fireEvent.change(input, { target: { value } });
}
async function idle(v: Awaited<ReturnType<typeof mount>>) {
  await waitFor(
    () => {
      expect(v.queryByText("Loading…")).toBeNull();
      expect(v.container.querySelector("fieldset[disabled]")).toBeNull();
    },
    { timeout: 15000 },
  );
}
it("signed sealed Android box: EAN selection, duplicate rejection, two unique IMEIs and immutable batch readback", async () => {
  const h = await localD1AdapterHarness();
  try {
    await h.db.exec(
      `INSERT INTO catalog VALUES('model','phone','MODEL','Android model','{"brand":"Oppo","model":"A1","condition":"NEW","ean":"1234567890123"}');INSERT INTO prices VALUES('M01','model',12500)`,
    );
    const v = await mount(
      h,
      "s1",
      <NativeDailyPage route="/stock/phones" store="M01" owner={false} />,
    );
    await waitFor(
      () => {
        expect(v.container.querySelector('[aria-busy="true"]')).toBeNull();
        expect(v.getByRole("button", { name: "Sealed box" }).hasAttribute("disabled")).toBe(false);
      },
      { timeout: 15000 },
    );
    await waitFor(
      () => {
        const button = v.getByRole("button", { name: "Sealed box" });
        if (button.getAttribute("aria-pressed") !== "true") fireEvent.click(button);
        expect(button.getAttribute("aria-pressed")).toBe("true");
      },
      { timeout: 15000 },
    );
    await v.findByLabelText("Box barcode (EAN)", {}, { timeout: 15000 });
    fill(v, "Box barcode (EAN)", "1234567890123");
    fireEvent.click(v.getByRole("button", { name: "Find" }));
    await waitFor(
      () =>
        expect(
          (v.getByLabelText("Product", { selector: "select" }) as HTMLSelectElement).value,
        ).toBe("model"),
      { timeout: 15000 },
    );
    fill(v, "Units in box", "2");
    fireEvent.click(v.getByRole("button", { name: "Add" }));
    fill(v, "Scan IMEI", "490154203237518");
    fireEvent.click(v.getByRole("button", { name: "Add" }));
    fill(v, "Scan IMEI", "490154203237518");
    fireEvent.click(v.getByRole("button", { name: "Add" }));
    expect(v.getByTestId("batch-counter").textContent).toBe("1 / 2");
    fill(v, "Scan IMEI", "356938035643809");
    fireEvent.click(v.getByRole("button", { name: "Add" }));
    expect(v.getByTestId("batch-counter").textContent).toBe("2 / 2");
    fireEvent.click(v.getByRole("button", { name: "Receive box" }));
    await waitFor(async () => expect(await scalar(h, "SELECT count(*) FROM phones")).toBe(2), {
      timeout: 15000,
    });
    const { repository } = await h.repository("s1");
    const items = await repository.posSearch({ store: "M01", limit: 100 });
    expect(items.items.map((i) => i.imei1).sort()).toEqual(["356938035643809", "490154203237518"]);
    expect(items.items.every((i) => i.amountMinor === 12500 && i.quantity === 1)).toBe(true);
    expect(await scalar(h, "SELECT quantity FROM standalone_receipts")).toBe(2);
    expect(await scalar(h, "SELECT count(*) FROM standalone_receipts")).toBe(1);
  } finally {
    cleanup();
    await h.dispose();
  }
}, 60000);
it("signed owner cost/payable and bank/cash supplier payment lifecycle; staff never read finance", async () => {
  const h = await localD1AdapterHarness();
  try {
    await h.db.exec(
      `INSERT INTO catalog VALUES('acc','accessory','ACC','Cable','{}');INSERT INTO accessory_balances VALUES('M01','acc',10);INSERT INTO suppliers(id,store_id,name,reference) VALUES('supplier','M01','Supplier','SUP');INSERT INTO commands VALUES('receipt-key','s1','M01','stock.standalone','hash','DONE','receipt',NULL,100);INSERT INTO standalone_receipts VALUES('receipt','receipt-key','M01','acc','supplier',10,100,'s1','R');INSERT INTO drawers VALUES('d','M01');INSERT INTO shifts VALUES('${shift}','M01','d','s1','OPEN',100000,NULL)`,
    );
    const v = await mount(h, "owner", <NativeSupplierPayables store="M01" />);
    await v.findByRole("option", { name: "Supplier" }, { timeout: 15000 });
    fill(v, "Supplier", "supplier");
    fill(v, "Receipt", "receipt");
    fill(v, "Amount DZD", "500");
    fireEvent.click(v.getByRole("button", { name: "Purchase cost" }));
    await v.findByText("Supplier · 500.00 DZD", {}, { timeout: 15000 });
    fill(v, "Amount DZD", "50");
    fireEvent.click(v.getByRole("button", { name: "Pay supplier" }));
    await v.findByText("Supplier · 450.00 DZD", {}, { timeout: 15000 });
    expect(await scalar(h, "SELECT count(*) FROM cash_adjustments")).toBe(0);
    fill(v, "Cash / Bank", "Cash");
    fill(v, "Open shift", shift);
    fill(v, "Amount DZD", "100");
    fireEvent.click(v.getByRole("button", { name: "Pay supplier" }));
    await v.findByText("Supplier · 350.00 DZD", {}, { timeout: 15000 });
    expect(await h.db.prepare("SELECT amount_minor,reason FROM cash_adjustments").first()).toEqual({
      amount_minor: -10000,
      reason: "Paiement fournisseur",
    });
    expect(
      await scalar(h, "SELECT sum(credit_minor) FROM journals WHERE account='BANK_UNRECONCILED'"),
    ).toBe(5000);
    const { repository: staff } = await h.repository("s1");
    await expect(staff.supplierPayables("M01")).rejects.toThrow("FORBIDDEN");
    expect(JSON.stringify(await staff.read("/stock/accessories", "M01"))).not.toMatch(
      /cost_minor|paid_minor|balance_minor/,
    );
  } finally {
    cleanup();
    await h.dispose();
  }
}, 60000);
describe("Batch 9b signed SAV lifecycle", () => {
  it.each(["REPAIR_RETURN", "REFUSAL"])(
    "signed sold-phone case opening and %s approval read back",
    async (outcome) => {
      const h = await localD1AdapterHarness();
      try {
        const { v, repository, caseId } = await openedCase(h);
        fill(v, "Note", "Approved repair review");
        fill(v, "Approve outcome", outcome);
        fireEvent.click(v.getByRole("button", { name: "Approve outcome" }));
        await waitFor(
          async () => expect(await scalar(h, "SELECT outcome FROM sav_outcomes")).toBe(outcome),
          { timeout: 15000 },
        );
        expect(
          (await repository.savCases({ store: "M01" })).cases.find((c) => c.id === caseId)?.outcome,
        ).toBe(outcome);
        expect(await scalar(h, `SELECT state FROM phones WHERE id='${phone}'`)).toBe("SOLD");
        expect(await scalar(h, "SELECT count(*) FROM sav_refunds")).toBe(0);
      } finally {
        cleanup();
        await h.dispose();
      }
    },
    60000,
  );
  it("signed manufacturer distributor/return and in-house/external repair tracking with paid-repair need only", async () => {
    const h = await localD1AdapterHarness();
    try {
      const { v, repository, caseId } = await openedCase(h);
      fill(v, "Note", "Repair tracking");
      fireEvent.click(v.getByRole("checkbox", { name: "Paid repair needed" }));
      for (const status of [
        "IN_HOUSE",
        "EXTERNAL",
        "IN_REPAIR",
        "READY",
        "SENT_DISTRIBUTOR",
        "RETURNED",
      ]) {
        fill(v, "Status", status);
        fireEvent.click(v.getByRole("button", { name: "Save" }));
        await waitFor(
          async () =>
            expect(
              await scalar(h, `SELECT count(*) FROM sav_tracking WHERE status='${status}'`),
            ).toBe(1),
          { timeout: 15000 },
        );
        await idle(v);
      }
      const data = (await repository.savCases({ store: "M01" })).cases.find((c) => c.id === caseId);
      expect(data?.tracking?.map((t) => t.status)).toEqual([
        "IN_HOUSE",
        "EXTERNAL",
        "IN_REPAIR",
        "READY",
        "SENT_DISTRIBUTOR",
        "RETURNED",
      ]);
      expect(await scalar(h, "SELECT sum(paid_repair_needed) FROM sav_tracking")).toBe(6);
      expect(await scalar(h, "SELECT count(*) FROM sav_refunds")).toBe(0);
    } finally {
      cleanup();
      await h.dispose();
    }
  }, 90000);
  it.each(["Cash", "Bank"])(
    "signed %s refund refuses over-cap then posts exactly once and reads SAV holding",
    async (method) => {
      const h = await localD1AdapterHarness();
      try {
        const { v, repository, caseId } = await openedCase(h);
        fill(v, "Note", "Refund review");
        fill(v, "Approve outcome", "REFUND");
        fill(v, "Cash", method, "select");
        if (method === "Cash") fill(v, "Shift", shift);
        const actions = v.getByLabelText("Approve outcome", { selector: "select" }).closest("div");
        if (!actions) throw new Error("ACTIONS");
        const amount = actions.querySelector('input[inputmode="decimal"]');
        if (!amount) throw new Error("AMOUNT");
        fireEvent.change(amount, { target: { value: "100.01" } });
        fireEvent.click(v.getByRole("button", { name: "Approve outcome" }));
        await v.findByRole("button", { name: "Cancel" }, { timeout: 15000 });
        expect(await scalar(h, "SELECT count(*) FROM sav_refunds")).toBe(0);
        fireEvent.click(v.getByRole("button", { name: "Cancel" }));
        fireEvent.change(amount, { target: { value: "100" } });
        h.loseNextCommandResponse();
        fireEvent.click(v.getByRole("button", { name: "Approve outcome" }));
        await v.findByRole("button", { name: "Check transaction" }, { timeout: 15000 });
        const writes = h.calls.filter((c) => c.endsWith("/execute")).length;
        fireEvent.click(v.getByRole("button", { name: "Check transaction" }));
        await waitFor(
          () => expect(v.queryByRole("button", { name: "Check transaction" })).toBeNull(),
          { timeout: 15000 },
        );
        expect(h.calls.filter((c) => c.endsWith("/execute")).length).toBe(writes);
        expect(await scalar(h, "SELECT count(*) FROM sav_refunds")).toBe(1);
        expect(await scalar(h, "SELECT amount_minor FROM sav_refunds")).toBe(10000);
        expect(
          (await repository.savCases({ store: "M01" })).cases.find((c) => c.id === caseId)?.outcome,
        ).toBe("REFUND");
        expect(await scalar(h, `SELECT state FROM phones WHERE id='${phone}'`)).toBe(
          "RETURN_BLOCKED",
        );
        expect(await scalar(h, "SELECT coalesce(sum(amount_minor),0) FROM cash_adjustments")).toBe(
          method === "Cash" ? -10000 : 0,
        );
      } finally {
        cleanup();
        await h.dispose();
      }
    },
    60000,
  );
  it.each([
    {
      original: "cash",
      price: 12000,
      refund: "100",
      method: "Cash",
      cash: 12000,
      bank: 0,
      credit: 0,
    },
    {
      original: "cash",
      price: 8000,
      refund: "100",
      method: "Bank",
      cash: 10000,
      bank: -2000,
      credit: 0,
    },
    {
      original: "split",
      price: 12000,
      refund: "100",
      method: "Cash",
      cash: 8000,
      bank: 4000,
      credit: 0,
    },
    {
      original: "credit",
      price: 8000,
      refund: "60",
      method: "Cash",
      cash: 8000,
      bank: 0,
      credit: 4000,
    },
  ])(
    "signed exchange $original original -> $price replacement reconciles exact cash/bank/credit and never double-refunds",
    async (s) => {
      const h = await localD1AdapterHarness();
      try {
        const patch =
          s.original === "split"
            ? {
                tender: "Split",
                cashAmount: "60",
                bankAmount: "40",
                bankMethod: "VIREMENT",
                tenderedAmount: "60",
              }
            : s.original === "credit"
              ? { creditAmount: "40", dueDate: "2026-12-09", tenderedAmount: "60" }
              : {};
        const { v, repository, caseId, receipt } = await openedCase(h, patch);
        await h.db.exec(`UPDATE prices SET amount_minor=${s.price} WHERE store_id='M01'`);
        // Remount refreshes the immutable sale and current replacement price from signed reads.
        v.unmount();
        const next = await mount(h, "owner", <NativeSav store="M01" owner approve />);
        await next.findByRole("option", { name: /Screen issue/ }, { timeout: 15000 });
        fill(next, "Case", caseId);
        await next.findByRole("option", { name: new RegExp(`Phone · 356938`) }, { timeout: 15000 });
        fill(next, "Replacement phone", replacement, "select");
        const exchange = next.getByRole("heading", { name: "Exchange" }).parentElement;
        if (!exchange) throw new Error("EXCHANGE");
        const field = (label: string) =>
          Array.from(exchange.querySelectorAll("label"))
            .find((l) => l.textContent?.trim() === label)
            ?.querySelector("input");
        for (const [label, value] of [
          ["Cash", shift],
          ["Note", "Exchange approved"],
          ["Amount", s.refund],
        ]) {
          if (!label || !value) throw new Error("EXCHANGE_FIELD");
          const input = field(label);
          if (!input) throw new Error(label);
          fireEvent.change(input, { target: { value } });
        }
        const method = exchange.querySelectorAll("select")[1];
        if (!method) throw new Error("METHOD");
        fireEvent.change(method, { target: { value: s.method } });
        fill(next, "Warranty", "NO");
        await waitFor(
          () =>
            expect(next.getByRole("button", { name: "Exchange" }).hasAttribute("disabled")).toBe(
              false,
            ),
          { timeout: 15000 },
        );
        h.loseNextCommandResponse();
        fireEvent.click(next.getByRole("button", { name: "Exchange" }));
        await next.findByRole("button", { name: "Check transaction" }, { timeout: 15000 });
        const writes = h.calls.filter((c) => c.endsWith("/execute")).length;
        fireEvent.click(next.getByRole("button", { name: "Check transaction" }));
        await idle(next);
        expect(h.calls.filter((c) => c.endsWith("/execute")).length).toBe(writes);
        expect(await scalar(h, "SELECT count(*) FROM sav_exchanges")).toBe(1);
        expect(await scalar(h, "SELECT count(*) FROM sav_refunds")).toBe(1);
        expect(await scalar(h, "SELECT sum(amount_minor) FROM effective_cash_movements")).toBe(
          s.cash,
        );
        expect(
          await scalar(
            h,
            "SELECT coalesce(sum(debit_minor-credit_minor),0) FROM journals WHERE account='BANK_UNRECONCILED'",
          ),
        ).toBe(s.bank);
        expect(await scalar(h, "SELECT coalesce(sum(amount_minor),0) FROM sale_credits")).toBe(
          s.credit,
        );
        // The returned phone cancels the unpaid debt of the original sale exactly once.
        expect(await scalar(h, "SELECT coalesce(sum(balance_minor),0) FROM credit_balances")).toBe(
          0,
        );
        if (s.credit) expect(await scalar(h, "SELECT state FROM credit_balances")).toBe("VOID");
        expect(await scalar(h, "SELECT coalesce(sum(amount_minor),0) FROM sav_refunds")).toBe(
          Number(s.refund) * 100,
        );
        expect(await scalar(h, "SELECT sum(debit_minor-credit_minor) FROM journals")).toBe(0);
        expect((await repository.receipt({ store: "M01", id: receipt.saleId })).totalMinor).toBe(
          10000,
        );
        const history = await repository.salesHistory({ store: "M01", limit: 100 });
        expect(history.sales).toHaveLength(2);
        expect(await scalar(h, `SELECT state FROM phones WHERE id='${phone}'`)).toBe(
          "RETURN_BLOCKED",
        );
      } finally {
        cleanup();
        await h.dispose();
      }
    },
    90000,
  );
});
it.each(["RETURN", "WRITE_OFF"])(
  "signed owner discrepancy %s moves unresolved goods once and reads resolution",
  async (outcome) => {
    const h = await localD1AdapterHarness();
    try {
      await h.db.exec(
        "INSERT INTO catalog VALUES('acc','accessory','ACC','Cable','{}');INSERT INTO accessory_balances VALUES('M01','acc',10);INSERT INTO prices VALUES('M01','acc',500)",
      );
      const { repository: owner } = await h.repository("owner"),
        { repository: m2 } = await h.repository("m2");
      let n = 0;
      const send = (r: typeof owner, operation: string, payload: Record<string, unknown>) =>
        r.execute({
          version: "native-2026-11-06",
          key: `resolution-setup-${++n}`,
          operation,
          payload,
        });
      await send(owner, "transfer.create", {
        store: "M01",
        id: "transfer",
        destination: "M02",
        lines: [{ itemId: "acc", kind: "accessory", quantity: 4, code: "ACC" }],
      });
      await send(owner, "transfer.approve", {
        store: "M01",
        transferId: "transfer",
        approval: "SUPER_ADMIN",
      });
      await send(m2, "transfer.approve", {
        store: "M02",
        transferId: "transfer",
        approval: "M02_MANAGER",
      });
      await send(owner, "transfer.scan", {
        store: "M01",
        transferId: "transfer",
        itemId: "acc",
        code: "ACC",
        quantity: 4,
      });
      await send(owner, "transfer.dispatch", {
        store: "M01",
        transferId: "transfer",
        carrier: "Carrier",
        evidence: "Sent",
      });
      await send(m2, "transfer.scan", {
        store: "M02",
        transferId: "transfer",
        itemId: "acc",
        code: "ACC",
        quantity: 2,
      });
      await send(m2, "transfer.receive", {
        store: "M02",
        transferId: "transfer",
        evidence: "Two arrived",
      });
      const v = await mount(h, "owner", <NativeTransfers store="M01" />);
      await v.findByRole("option", { name: /transfer ·/ }, { timeout: 15000 });
      fill(v, "Transfer", "transfer");
      await v.findByLabelText("Reason", {}, { timeout: 15000 });
      fill(v, "Reason", "Missing goods reviewed");
      fireEvent.click(
        v.getByRole("button", { name: outcome === "RETURN" ? "Return to source" : "Write off" }),
      );
      await waitFor(
        async () =>
          expect(await scalar(h, "SELECT outcome FROM transfer_resolutions")).toBe(outcome),
        { timeout: 15000 },
      );
      await idle(v);
      expect(await scalar(h, "SELECT quantity FROM accessory_balances WHERE store_id='M01'")).toBe(
        outcome === "RETURN" ? 8 : 6,
      );
      expect(await scalar(h, "SELECT quantity FROM accessory_balances WHERE store_id='M02'")).toBe(
        2,
      );
      expect(
        (await owner.transferDetail({ store: "M01", transferId: "transfer" })).discrepancies?.[0]
          ?.outcome,
      ).toBe(outcome);
      expect(await scalar(h, "SELECT count(*) FROM transfer_resolutions")).toBe(1);
    } finally {
      cleanup();
      await h.dispose();
    }
  },
  60000,
);
describe("Batch 9c signed stock-count recovery, report export and Zakat", () => {
  it("signed count/open/entry/submit/adjust/review recover lost replies with original keys and no duplicate writes", async () => {
    const h = await localD1AdapterHarness();
    try {
      await h.db.exec(
        "INSERT INTO catalog VALUES('acc','accessory','ACC','Cable','{}');INSERT INTO accessory_balances VALUES('M01','acc',10);INSERT INTO prices VALUES('M01','acc',500)",
      );
      const v = await mount(h, "owner", <StockCount store="M01" native />);
      fireEvent.click(v.getByRole("button", { name: "Monthly count" }));
      fill(v, "Month", "2026-11");
      const recover = async (action: () => void) => {
        await new Promise((r) => setTimeout(r, 100));
        h.loseNextCommandResponse();
        action();
        await v.findByRole("button", { name: "Check transaction" }, { timeout: 15000 });
        const key = v.getByRole("alert").querySelector("code")?.textContent;
        expect(key).toMatch(/^native-/);
        const writes = h.calls.filter((c) => c.endsWith("/execute")).length;
        fireEvent.click(v.getByRole("button", { name: "Check transaction" }));
        await idle(v);
        expect(h.calls.filter((c) => c.endsWith("/execute")).length).toBe(writes);
        expect(
          await scalar(h, `SELECT count(*) FROM commands WHERE key='${key}' AND state='DONE'`),
        ).toBe(1);
      };
      await recover(() => fireEvent.click(v.getByRole("button", { name: "Start" })));
      await v.findByRole("button", { name: "Submit count" }, { timeout: 15000 });
      expect(v.queryByRole("columnheader", { name: "Expected" })).toBeNull();
      fill(v, "Scan / code", "ACC");
      fill(v, "Counted", "8");
      await recover(() => fireEvent.click(v.getByRole("button", { name: "Save" })));
      await recover(() => fireEvent.click(v.getByRole("button", { name: "Submit count" })));
      await v.findByRole("cell", { name: "-2" }, { timeout: 15000 });
      fill(v, "Reason", "Monthly count verified");
      await recover(() => fireEvent.click(v.getByRole("button", { name: "Adjust" })));
      await v.findByRole("button", { name: "OK" }, { timeout: 15000 });
      await recover(() => fireEvent.click(v.getByRole("button", { name: "OK" })));
      expect(await scalar(h, "SELECT quantity FROM accessory_balances")).toBe(8);
      expect(await scalar(h, "SELECT count(*) FROM stock_adjustments")).toBe(1);
      const { repository } = await h.repository("owner");
      const id = await scalar(h, "SELECT id FROM stock_counts");
      expect((await repository.stockCount("M01", String(id))).adjustments?.[0]?.outcome).toBe("OK");
    } finally {
      cleanup();
      await h.dispose();
    }
  }, 90000);
  it("signed per-store/day report exports contain actual XLSX/PDF rows and owner Zakat discloses missing cost coverage", async () => {
    const h = await localD1AdapterHarness();
    try {
      await seedSale(h);
      await h.db.exec(
        "INSERT INTO catalog VALUES('acc','accessory','ACC','Cable','{}');INSERT INTO accessory_balances VALUES('M01','acc',2);INSERT INTO suppliers(id,store_id,name,reference) VALUES('supplier','M01','Supplier','SUP');INSERT INTO commands VALUES('receipt-key','s1','M01','stock.standalone','hash','DONE','receipt',NULL,100);INSERT INTO standalone_receipts VALUES('receipt','receipt-key','M01','acc','supplier',2,100,'s1','R')",
      );
      const { repository: owner } = await h.repository("owner");
      await owner.execute({
        version: "native-2026-11-06",
        key: "batch8b-report-cost-key",
        operation: "supplier.cost",
        payload: { store: "M01", supplierId: "supplier", sourceId: "receipt", amount: "20" },
      });
      const day = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Africa/Algiers",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date());
      const downloads: { name: string; blob: Blob }[] = [];
      let blob: Blob | undefined;
      vi.spyOn(URL, "createObjectURL").mockImplementation((b) => {
        blob = b as Blob;
        return "blob:test";
      });
      vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
      vi.spyOn(dom.window.HTMLAnchorElement.prototype, "click").mockImplementation(function (
        this: HTMLAnchorElement,
      ) {
        if (blob) downloads.push({ name: this.download, blob });
      });
      const v = await mount(h, "owner", <NativeReports store="M01" owner />);
      await v.findByRole("cell", { name: "100.00 DZD" }, { timeout: 15000 });
      fill(v, "From", day);
      fill(v, "To", day);
      await idle(v);
      fireEvent.click(v.getByRole("button", { name: "Excel" }));
      await waitFor(() => expect(downloads.some((d) => d.name.endsWith("xlsx"))).toBe(true), {
        timeout: 15000,
      });
      const xlsx = downloads.find((d) => d.name.endsWith("xlsx"));
      if (!xlsx) throw new Error("XLSX");
      const { Workbook } = await import("exceljs");
      const book = new Workbook();
      await book.xlsx.load(await xlsx.blob.arrayBuffer());
      expect(book.getWorksheet("Sales")?.getRow(2).values).toEqual([
        undefined,
        "M01",
        day,
        1,
        "100.00",
      ]);
      expect(book.getWorksheet("Sales")?.rowCount).toBe(2);
      fireEvent.click(v.getByRole("button", { name: "PDF" }));
      await waitFor(() => expect(downloads.some((d) => d.name.endsWith("pdf"))).toBe(true), {
        timeout: 15000,
      });
      const pdf = downloads.find((d) => d.name.endsWith("pdf"));
      if (!pdf) throw new Error("PDF");
      const pdfContent = Buffer.from(await pdf.blob.arrayBuffer()).toString("latin1");
      expect(pdfContent).toContain(`M01 | ${day} | 1 | 100.00`);
      expect(pdfContent).toContain("Africa/Algiers");
      expect(pdfContent).not.toContain("Buyer");
      expect(pdfContent).not.toMatch(/cost|margin|co\u00fbt|marge/i);
      const header = (book.getWorksheet("Sales")?.getRow(1).values as unknown[]).join("|");
      expect(header).not.toMatch(/cost|margin|co\u00fbt|marge/i);
      const { transport: ownerTransport } = await h.repository("owner");
      if (!ownerTransport.zakatSheet) throw new Error("ZAKAT_UNAVAILABLE");
      const z = await ownerTransport.zakatSheet({ store: "M01" });
      expect(z).toMatchObject({
        known: 1,
        total: 2,
        missing: 1,
        stock: "2000",
        cash: "110000",
        receivables: "0",
        payables: "2000",
        net: "110000",
      });
      await v.findByText("Known costs: 1 / 2 · Missing costs: 1", {}, { timeout: 15000 });
      expect(v.getByText("Missing costs are not zero")).toBeTruthy();
      expect(v.getByRole("heading", { name: "Preparatory — non-certified" })).toBeTruthy();
      const { transport: staff } = await h.repository("s1");
      if (!staff.zakatSheet || !staff.salesReport) throw new Error("REPORT_UNAVAILABLE");
      await expect(staff.zakatSheet({ store: "M01" })).rejects.toThrow("FORBIDDEN");
      expect(await staff.salesReport({ store: "M01", from: day, to: day })).toEqual([
        { store: "M01", day, sales: 1, total: "100.00" },
      ]);
      // Non-owner store/day report carries no cost or margin field.
      const staffRows = await staff.salesReport({ store: "M01", from: day, to: day });
      expect(JSON.stringify(staffRows)).not.toMatch(/cost|margin/i);
    } finally {
      cleanup();
      vi.restoreAllMocks();
      await h.dispose();
    }
  }, 60000);
});
describe("Batch 9d signed SAV return of credit sales reduces debt by the returned line only", () => {
  async function approveReturn(
    h: H,
    v: Awaited<ReturnType<typeof openedCase>>["v"],
    amount?: string,
  ) {
    fill(v, "Note", "Return review");
    fill(v, "Approve outcome", "REFUND");
    const actions = v.getByLabelText("Approve outcome", { selector: "select" }).closest("div");
    if (!actions) throw new Error("ACTIONS");
    if (amount) {
      fill(v, "Cash", "Cash", "select");
      fill(v, "Shift", shift);
      const input = actions.querySelector('input[inputmode="decimal"]');
      if (!input) throw new Error("AMOUNT");
      fireEvent.change(input, { target: { value: amount } });
    }
    fireEvent.click(v.getByRole("button", { name: "Approve outcome" }));
    await waitFor(
      async () => expect(await scalar(h, "SELECT count(*) FROM sav_outcomes")).toBe(1),
      { timeout: 15000 },
    );
  }
  it("phone + accessory partly on credit: returning the phone leaves the accessory's unpaid share", async () => {
    const h = await localD1AdapterHarness();
    try {
      await h.db.exec(
        "INSERT INTO catalog VALUES('00000000-0000-4000-8000-0000000000ac','accessory','ACC','Cable','{}');INSERT INTO prices VALUES('M01','00000000-0000-4000-8000-0000000000ac',8000);INSERT INTO accessory_balances VALUES('M01','00000000-0000-4000-8000-0000000000ac',5)",
      );
      const { v } = await openedCase(h, {
        lines: [
          { kind: "phone", itemId: phone, quantity: "1" },
          { kind: "accessory", itemId: "00000000-0000-4000-8000-0000000000ac", quantity: "1" },
        ],
        tenderedAmount: "40",
        creditAmount: "140",
        dueDate: "2026-12-09",
      });
      await approveReturn(h, v);
      // Credit 140 - returned phone 100 = 40, exactly the accessory's unpaid share (80 - 40 paid).
      expect(await scalar(h, "SELECT balance_minor FROM credit_balances")).toBe(4000);
      expect(await scalar(h, "SELECT state FROM credit_balances")).toBe("OPEN");
      expect(await scalar(h, "SELECT count(*) FROM sav_refunds")).toBe(0);
      expect(await scalar(h, `SELECT state FROM phones WHERE id='${phone}'`)).toBe(
        "RETURN_BLOCKED",
      );
      const { repository } = await h.repository("owner");
      await expect(
        repository.execute({
          version: "native-2026-11-06",
          key: "batch9d-overpay-key",
          operation: "repayment.record",
          payload: {
            store: "M01",
            debtId: (await scalar(h, "SELECT sale_id FROM sale_credits")) as string,
            amount: "40.01",
            method: "Cash",
            shiftId: shift,
          },
        }),
      ).rejects.toThrow();
      expect(await scalar(h, "SELECT sum(debit_minor-credit_minor) FROM journals")).toBe(0);
    } finally {
      cleanup();
      await h.dispose();
    }
  }, 60000);
  it("single-phone credit sale: returning the phone closes the debt and refunds only the paid part", async () => {
    const h = await localD1AdapterHarness();
    try {
      const { v } = await openedCase(h, {
        tenderedAmount: "60",
        creditAmount: "40",
        dueDate: "2026-12-09",
      });
      await approveReturn(h, v, "60");
      expect(await scalar(h, "SELECT balance_minor FROM credit_balances")).toBe(0);
      expect(await scalar(h, "SELECT state FROM credit_balances")).toBe("VOID");
      expect(await scalar(h, "SELECT sum(amount_minor) FROM sav_refunds")).toBe(6000);
      expect(await scalar(h, "SELECT sum(amount_minor) FROM effective_cash_movements")).toBe(0);
    } finally {
      cleanup();
      await h.dispose();
    }
  }, 60000);
  it("repayment before the return: excess refund is exact and never doubled", async () => {
    const h = await localD1AdapterHarness();
    try {
      const { v, repository } = await openedCase(h, {
        tenderedAmount: "30",
        creditAmount: "70",
        dueDate: "2026-12-09",
      });
      await repository.execute({
        version: "native-2026-11-06",
        key: "batch9d-repay-key",
        operation: "repayment.record",
        payload: {
          store: "M01",
          debtId: (await scalar(h, "SELECT sale_id FROM sale_credits")) as string,
          amount: "20",
          method: "Cash",
          shiftId: shift,
        },
      });
      expect(await scalar(h, "SELECT balance_minor FROM credit_balances")).toBe(5000);
      // Returned 100 - outstanding 50 = 50 refundable; 50.01 is refused, nothing recorded.
      await approveReturnRefused(h, v, "50.01");
      fireEvent.click(v.getByRole("button", { name: "Cancel" }));
      await approveReturn(h, v, "50");
      expect(await scalar(h, "SELECT balance_minor FROM credit_balances")).toBe(0);
      expect(await scalar(h, "SELECT count(*) FROM sav_refunds")).toBe(1);
      expect(await scalar(h, "SELECT sum(amount_minor) FROM sav_refunds")).toBe(5000);
      // 30 sale + 20 repayment - 50 refund.
      expect(await scalar(h, "SELECT sum(amount_minor) FROM effective_cash_movements")).toBe(0);
      expect(await scalar(h, "SELECT sum(debit_minor-credit_minor) FROM journals")).toBe(0);
    } finally {
      cleanup();
      await h.dispose();
    }
  }, 60000);
  async function approveReturnRefused(
    h: H,
    v: Awaited<ReturnType<typeof openedCase>>["v"],
    amount: string,
  ) {
    fill(v, "Note", "Return review");
    fill(v, "Approve outcome", "REFUND");
    fill(v, "Cash", "Cash", "select");
    fill(v, "Shift", shift);
    const actions = v.getByLabelText("Approve outcome", { selector: "select" }).closest("div");
    const input = actions?.querySelector('input[inputmode="decimal"]');
    if (!input) throw new Error("AMOUNT");
    fireEvent.change(input, { target: { value: amount } });
    fireEvent.click(v.getByRole("button", { name: "Approve outcome" }));
    await v.findByRole("button", { name: "Cancel" }, { timeout: 15000 });
    expect(await scalar(h, "SELECT count(*) FROM sav_outcomes")).toBe(0);
    expect(await scalar(h, "SELECT count(*) FROM sav_refunds")).toBe(0);
  }
});
