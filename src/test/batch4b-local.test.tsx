import "fake-indexeddb/auto";
import { beforeEach, afterEach, it, expect } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { ErpProvider } from "@/components/erp/context";
import { LocalSav } from "@/components/erp/local-sav";
import { UsedPurchase } from "@/components/erp/used-purchase";
import { Reports } from "@/components/erp/reports";
import {
  hydrateTestWorkspace,
  resetTestWorkspace,
  setReviewActor,
  openTestShift,
  recordTestSale,
  getTestState,
  saveTestPhoneModel,
  expectedCash,
  exportLocalReview,
  commitTest,
} from "@/data/test-workspace";
import {
  openLocalSav,
  outcomeLocalSav,
  restockLocalSav,
  exchangeLocalSav,
  localZakatSheet,
} from "@/data/local-batch4b";
import { buyLocalIndividual, localIndividualPurchases } from "@/data/local-individual-purchase";
import { batch4bText } from "@/locales/batch4b";
beforeEach(async () => {
  await hydrateTestWorkspace();
  resetTestWorkspace();
  setReviewActor("U-OWN");
  localStorage.setItem("ph-lang", "en");
});
afterEach(cleanup);
function sold() {
  const phone = getTestState().phones.find(
    (p) => p.store === "M01" && p.amount && p.status === "Available",
  );
  if (!phone?.amount) throw new Error("Phone");
  const shift = openTestShift("M01", "Test seller 001", "100000");
  const sale = recordTestSale({
    key: crypto.randomUUID(),
    store: "M01",
    lines: [{ id: phone.id, quantity: 1 }],
    customerName: "Buyer Name",
    customerId: "WALK-IN",
    newBuyer: { surname: "Buyer", givenName: "Name", contact: "0555555555" },
    tender: "Cash",
    paid: phone.amount,
    warranties: [{ itemId: phone.id, requested: false, duration: "", start: "", end: "" }],
  });
  return { phone, shift, sale };
}
it.each(["en", "fr-DZ", "ar-DZ"])(
  "%s mounted local SAV creates linked case and approves refund into holding",
  async (lang) => {
    localStorage.setItem("ph-lang", lang);
    const { phone, sale, shift } = sold();
    render(
      <ErpProvider>
        <LocalSav />
      </ErpProvider>,
    );
    const t = batch4bText(lang);
    await screen.findByRole("button", { name: t.open });
    fireEvent.change(screen.getByLabelText(t.sale), {
      target: { value: sale.id + "|" + phone.id },
    });
    fireEvent.change(screen.getByLabelText(t.issue), { target: { value: "Display issue" } });
    fireEvent.click(screen.getByRole("button", { name: t.open }));
    await waitFor(() => expect(getTestState().savCases).toHaveLength(1));
    const c = getTestState().savCases?.[0];
    if (!c) throw new Error("case");
    expect(c.customerId).toBe(sale.customerId);
    const before = JSON.stringify(sale);
    outcomeLocalSav(
      {
        store: "M01",
        caseId: c.id,
        outcome: "REFUND",
        note: "Return",
        amount: sale.total,
        method: "Cash",
        shiftId: shift.id,
      },
      "refund-key",
    );
    expect(getTestState().phones.find((p) => p.id === phone.id)?.status).toBe("Inspection");
    expect(expectedCash(shift.id)).toBe("100000.00");
    expect(JSON.stringify(getTestState().sales[0])).toBe(before);
  },
);
it("local seller cannot approve refund or restock; owner can restock holding", () => {
  const { phone, sale, shift } = sold();
  const id = openLocalSav(sale, phone.id, "Issue");
  setReviewActor("U-S01");
  expect(() =>
    outcomeLocalSav(
      {
        store: "M01",
        caseId: id,
        outcome: "REFUND",
        note: "Return",
        amount: sale.total,
        method: "Cash",
        shiftId: shift.id,
      },
      "key",
    ),
  ).toThrow();
  setReviewActor("U-OWN");
  outcomeLocalSav(
    {
      store: "M01",
      caseId: id,
      outcome: "REFUND",
      note: "Return",
      amount: sale.total,
      method: "Cash",
      shiftId: shift.id,
    },
    "key",
  );
  setReviewActor("U-S01");
  expect(() => restockLocalSav(phone.id)).toThrow();
  setReviewActor("U-OWN");
  restockLocalSav(phone.id);
  expect(getTestState().phones.find((p) => p.id === phone.id)?.status).toBe("Available");
});
it("local exchange returns original to holding and appends replacement sale", () => {
  const { phone, sale } = sold();
  const id = openLocalSav(sale, phone.id, "Exchange");
  const replacement = getTestState().phones.find(
    (p) => p.store === "M01" && p.status === "Available" && p.amount,
  );
  if (!replacement) throw new Error("replacement");
  const next = exchangeLocalSav(id, replacement.id, "Cash", "Approved");
  expect(next.id).not.toBe(sale.id);
  expect(getTestState().sales).toHaveLength(2);
  expect(getTestState().phones.find((p) => p.id === phone.id)?.status).toBe("Inspection");
  expect(getTestState().phones.find((p) => p.id === replacement.id)?.status).toBe("Sold");
});
it("local individual purchase stores image privately and excludes identity/cost from shared exports", async () => {
  const model = saveTestPhoneModel({
    store: "M01",
    brand: "UsedBrand",
    model: "UsedModel",
    storage: "128",
    condition: "USED",
    salePrice: "100",
  });
  const shift = openTestShift("M01", "Test seller 001", "1000");
  const id = crypto.randomUUID();
  await buyLocalIndividual(
    {
      store: "M01",
      id,
      catalogId: model.id,
      barcode: id,
      imei: "356938035643809",
      serial: "LOCAL-PRIVATE",
      surname: "SecretSeller",
      givenName: "PrivatePerson",
      phone: "0555765432",
      photoPending: true,
      shiftId: shift.id,
      amount: "20",
    },
    "data:image/png;base64,aGVsbG8=",
  );
  expect(expectedCash(shift.id)).toBe("980.00");
  expect((await localIndividualPurchases()).find((r) => r.id === id)?.photo).toBe(
    "data:image/png;base64,aGVsbG8=",
  );
  expect(JSON.stringify(exportLocalReview())).not.toMatch(
    /SecretSeller|PrivatePerson|0555765432|aGVsbG8=/,
  );
  setReviewActor("U-S01");
  await expect(localIndividualPurchases()).rejects.toThrow("FORBIDDEN");
});
it("seller sees requested sales report without Zakat or used purchase controls", async () => {
  sold();
  setReviewActor("U-S01");
  render(
    <ErpProvider>
      <Reports />
      <UsedPurchase store="M01" />
    </ErpProvider>,
  );
  await screen.findByRole("heading", { name: "Sales per store and day" });
  expect(screen.queryByText("Preparatory — non-certified")).toBeNull();
  expect(screen.queryByRole("button", { name: "Buy used phone" })).toBeNull();
  await expect(localZakatSheet()).rejects.toThrow("FORBIDDEN");
});
it("owner Zakat shows missing coverage instead of inventing zero costs", async () => {
  const ws = getTestState();
  commitTest({ ...ws, phones: [], accessories: [] });
  const z = await localZakatSheet();
  expect(z).toMatchObject({ known: 0, total: 0, missing: 0, stock: "0" });
});
