import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, type ReactNode } from "react";
import { afterEach, it, expect, describe } from "vitest";
import { ErpProvider, useErp } from "@/components/erp/context";
import { NativePage, buildPayload } from "@/components/erp/native-page";
import { NativeTransportProvider } from "@/components/erp/native-transport";
import { nativeRouteModules } from "@/domain/native-repository";
import { productionModules } from "@/domain/production-modules";
import { createSyntheticTransport, type SyntheticRole } from "@/data/synthetic-native-transport";
import type { ProtectedNativeTransport } from "@/data/native-repository";
// SYNTHETIC transport UI tests — not hosted auth/D1 evidence.
afterEach(() => {
  cleanup();
  localStorage.clear();
});
function Scope({
  store,
  lang,
  children,
}: {
  store: "M01" | "M02" | "ALL";
  lang?: "en" | "ar-DZ";
  children: ReactNode;
}) {
  const { setScope, setLang } = useErp();
  useEffect(() => {
    setScope(store);
    if (lang) setLang(lang);
  }, [store, lang, setScope, setLang]);
  return <>{children}</>;
}
function mount(
  path: string,
  transport?: ProtectedNativeTransport,
  store: "M01" | "M02" | "ALL" = "M01",
  lang: "en" | "ar-DZ" = "en",
) {
  localStorage.setItem("ph-lang", lang);
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <ErpProvider>
        <NativeTransportProvider transport={transport}>
          <Scope store={store} lang={lang}>
            <NativePage pathname={path} />
          </Scope>
        </NativeTransportProvider>
      </ErpProvider>
    </QueryClientProvider>,
  );
}
describe("disconnected default transport", () => {
  for (const path of Object.keys(nativeRouteModules))
    it(`${path} shows honest disconnected state, keeps real forms but disabled, no test records`, async () => {
      render(
        <QueryClientProvider client={new QueryClient()}>
          <ErpProvider>
            <NativePage pathname={path} />
          </ErpProvider>
        </QueryClientProvider>,
      );
      expect(await screen.findByText("Non connecté")).toBeInTheDocument();
      expect(screen.queryByText(/TEST CUSTOMER|SYNTHETIC/)).not.toBeInTheDocument();
      if (productionModules[path as keyof typeof productionModules].operations.length)
        for (const b of screen.getAllByRole("button", { name: /Envoyer au serveur/ }))
          expect(b).toBeDisabled();
    });
});
describe("synthetic transport, all 18 routes", () => {
  for (const path of Object.keys(nativeRouteModules))
    it(`${path} renders labeled synthetic server rows with module columns`, async () => {
      const t = createSyntheticTransport({ role: "SUPER_ADMIN" });
      mount(path, t);
      expect(await screen.findByTestId("synthetic-banner")).toHaveTextContent("SYNTHETIC");
      const cols = productionModules[path as keyof typeof productionModules].columns;
      if (cols.length)
        await waitFor(() =>
          expect(screen.getAllByRole("columnheader").length).toBeGreaterThanOrEqual(cols.length),
        );
      if (path === "/reports")
        expect(
          await screen.findByRole("heading", { name: "Sales per store and day" }),
        ).toBeInTheDocument();
      else expect(t.calls.some((c) => c.action === "read")).toBe(true);
    });
});
it("money renders as exact decimal string from integer centimes", async () => {
  mount("/catalog", createSyntheticTransport({ role: "SUPER_ADMIN" }));
  expect(await screen.findByText("1500.50 DZD")).toBeInTheDocument();
});
it("customer form sends strict payload with stable key and store from scope, shows server receipt", async () => {
  const t = createSyntheticTransport({ role: "MANAGER", store: "M02" });
  mount("/customers", t, "M02");
  await screen.findByTestId("synthetic-banner");
  fireEvent.change(await screen.findByLabelText("Identifier"), { target: { value: "CUS-9" } });
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: "SYNTHETIC buyer" } });
  fireEvent.change(screen.getByLabelText("Reference"), { target: { value: "REF-9" } });
  const submit = screen.getByRole("button", { name: "Submit to server" });
  await waitFor(() => expect(submit).toBeEnabled());
  fireEvent.click(submit);
  const receipt = await screen.findByRole("status", { name: "Server receipt" });
  expect(within(receipt).getByText("RECORDED")).toBeInTheDocument();
  const sent = t.calls.find((c) => c.action === "execute")!.body as {
    key: string;
    operation: string;
    payload: unknown;
  };
  expect(sent).toMatchObject({
    version: "native-2026-11-06",
    operation: "customer.save",
    payload: { store: "M02", id: "CUS-9", name: "SYNTHETIC buyer", reference: "REF-9" },
  });
  expect(sent.key).toMatch(/^cmd-[0-9a-f-]{36}$/);
  expect(Object.keys(sent.payload as object)).not.toContain("actor");
  expect(screen.getByRole("button", { name: "Submit to server" })).toBeDisabled();
});
it("invalid form is blocked client-side before any network call", async () => {
  const t = createSyntheticTransport({ role: "MANAGER" });
  mount("/expenses", t);
  await screen.findByTestId("synthetic-banner");
  const submit = screen.getByRole("button", { name: "Submit to server" });
  await waitFor(() => expect(submit).toBeEnabled());
  fireEvent.change(screen.getByLabelText("Amount (DZD)"), { target: { value: "12.345" } });
  fireEvent.click(submit);
  expect(await screen.findByRole("alert")).toHaveTextContent("Check the highlighted fields");
  expect(t.calls.some((c) => c.action === "execute")).toBe(false);
});
it("2026-11-09 owner-only policy-gated expense shows blocked status, not a finished workflow", async () => {
  const t = createSyntheticTransport({ role: "SUPER_ADMIN" });
  mount("/expenses", t);
  await screen.findByTestId("synthetic-banner");
  fireEvent.change(screen.getByLabelText("Identifier"), { target: { value: "EXP-2" } });
  fireEvent.change(screen.getByLabelText("Amount (DZD)"), { target: { value: "15.00" } });
  fireEvent.change(screen.getByLabelText("Evidence"), { target: { value: "SYNTHETIC receipt" } });
  const submit = screen.getByRole("button", { name: "Submit to server" });
  await waitFor(() => expect(submit).toBeEnabled());
  fireEvent.click(submit);
  expect(await screen.findByText(/Nothing was posted/)).toBeInTheDocument();
  expect(
    within(screen.getByRole("status", { name: "Server receipt" })).getByText("POLICY_BLOCKED"),
  ).toBeInTheDocument();
});
it("lost response keeps the same key, locks edits, and reconciles by outcome readback", async () => {
  const t = createSyntheticTransport({ role: "MANAGER", loseNextResponse: true });
  mount("/suppliers", t);
  await screen.findByTestId("synthetic-banner");
  fireEvent.change(screen.getByLabelText("Identifier"), { target: { value: "SUP-7" } });
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: "SYNTHETIC" } });
  fireEvent.change(screen.getByLabelText("Reference"), { target: { value: "REF-7" } });
  const submit = screen.getByRole("button", { name: "Submit to server" });
  await waitFor(() => expect(submit).toBeEnabled());
  fireEvent.click(submit);
  expect(await screen.findByText(/Outcome unknown/)).toBeInTheDocument();
  expect(screen.getByLabelText("Name")).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Check outcome" }));
  await screen.findByRole("status", { name: "Server receipt" });
  const key = (t.calls.find((c) => c.action === "execute")!.body as { key: string }).key;
  expect(t.calls.find((c) => c.action === "outcome")!.body).toEqual({ key });
  expect(t.calls.filter((c) => c.action === "execute")).toHaveLength(1);
});
const roles: [SyntheticRole, string, string][] = [
  ["SELLER", "/purchases", "Access denied"],
  ["MANAGER", "/users", "Access denied"],
];
for (const [role, path, text] of roles)
  it(`${role} on ${path} receives server forbidden state`, async () => {
    mount(path, createSyntheticTransport({ role }));
    expect(await screen.findByText(text)).toBeInTheDocument();
  });
it("2026-11-09 M01 manager sets intake sale price", async () => {
  const t = createSyntheticTransport({ role: "MANAGER" });
  mount("/catalog", t);
  await screen.findByTestId("synthetic-banner");
  fireEvent.click(screen.getByRole("tab", { name: "Set store price" }));
  fireEvent.change(screen.getByLabelText("Item"), { target: { value: "ACC-1" } });
  fireEvent.change(screen.getByLabelText("Amount (DZD)"), { target: { value: "10.00" } });
  const submit = screen.getByRole("button", { name: "Submit to server" });
  await waitFor(() => expect(submit).toBeEnabled());
  fireEvent.click(submit);
  await screen.findByRole("status", { name: "Server receipt" });
});
it("owner purchase cost stays private; manager has cost-free sales reports", async () => {
  mount("/purchases", createSyntheticTransport({ role: "SUPER_ADMIN" }));
  expect(
    await screen
      .findByText("Unknown", { exact: true }, { timeout: 3000 })
      .catch(async () => screen.findAllByText("Unknown")),
  ).toBeTruthy();
  cleanup();
  mount("/reports", createSyntheticTransport({ role: "MANAGER" }));
  expect(
    await screen.findByRole("heading", { name: "Sales per store and day" }),
  ).toBeInTheDocument();
  expect(screen.queryByText("Preparatory — non-certified")).toBeNull();
});
it("all-stores scope blocks reads and commands until one store is chosen", async () => {
  const t = createSyntheticTransport({ role: "SUPER_ADMIN" });
  mount("/cash", t, "ALL");
  expect(
    (await screen.findAllByText(/Choose Magasin 1 \(M01\) or Magasin 2 \(M02\)/)).length,
  ).toBeGreaterThan(0);
  expect(t.calls.some((c) => c.action === "read")).toBe(false);
});
it("Arabic RTL labels render for production forms", async () => {
  mount("/cash", createSyntheticTransport({ role: "SELLER" }), "M01", "ar-DZ");
  expect(await screen.findByRole("tab", { name: "فتح الوردية" })).toBeInTheDocument();
  expect(await screen.findByText("سجلات الخادم")).toBeInTheDocument();
});
it("facility payload is always M01 and amounts stay strings", () => {
  expect(
    buildPayload("facility.evidence", "M02", {
      facilityId: "F1",
      kind: "BANK_REMITTANCE",
      amount: "40.25",
      document: "D",
    }),
  ).toEqual({
    store: "M01",
    facilityId: "F1",
    kind: "BANK_REMITTANCE",
    amount: "40.25",
    document: "D",
  });
  expect(
    buildPayload("purchase.finance", "M01", { purchaseId: "P", cost: "", obligation: "" }),
  ).toEqual({ store: "M01", purchaseId: "P", cost: null, obligation: null });
});

it("connected but unverified identity never reads server rows", async () => {
  let reads = 0;
  mount("/cash", {
    status: async () => ({ connected: true, verified: false }),
    read: async () => {
      reads++;
      return null;
    },
    execute: async () => null,
  });
  expect(await screen.findByText("Verified sign-in required")).toBeInTheDocument();
  expect(reads).toBe(0);
  expect(screen.getByRole("button", { name: "Submit to server" })).toBeDisabled();
});

it("unknown native page never resolves to dashboard or issues a read", async () => {
  const transport = createSyntheticTransport({ role: "SUPER_ADMIN" });
  mount("/unregistered", transport);
  expect(await screen.findByRole("alert")).toHaveTextContent("Backend unavailable");
  expect(transport.calls).toHaveLength(0);
});
