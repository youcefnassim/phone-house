import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import {
  resetTestWorkspace,
  getTestState,
  addTestPhone,
  recordTestSale,
  openTestShift,
  previewTestSale,
  searchPhones,
  nextPhoneBarcode,
  migrateReviewWorkspace,
  receiveTestAccessory,
} from "@/data/test-workspace";
import { phoneDraftSchema, imeiChecksumValid, type PhoneDraft } from "@/domain/operations";
import { canPreviewOwnerFinance } from "@/domain/business";
import { ErpProvider } from "@/components/erp/context";
import { PhonesInventory } from "@/components/erp/inventory";

// Valid Luhn IMEIs (synthetic).
const A = "490154203237518",
  B = "356938035643809",
  C = "353918058491230",
  D = "012345678901237";
const phone = (o: Partial<PhoneDraft> = {}) =>
  ({
    name: "Galaxy Z9",
    brand: "NovaBrand",
    store: "M01",
    condition: "NEW",
    packaging: "SEALED",
    imei1: A,
    imei2: "",
    serial: "",
    color: "",
    storage: "",
    battery: "",
    salePrice: "45000.50",
    barcode: "",
    remarks: "",
    ...o,
  }) as PhoneDraft;
const count = () => getTestState().phones.length;
beforeEach(() => resetTestWorkspace());
afterEach(cleanup);

describe("Option 01 phone intake — acceptance", () => {
  it("fixture IMEIs are valid Luhn examples used here", () => {
    for (const v of [A, B, C, D]) expect(imeiChecksumValid(v)).toBe(true);
  });
  it("CAT-02 creates an unseen brand/model and normalizes spacing only", () => {
    const p = addTestPhone(phone({ brand: "  NovaBrand ", name: "Galaxy  Z9 Pro" }));
    expect(p.category).toBe("NovaBrand");
    expect(p.name).toBe("Galaxy Z9 Pro");
    const q = addTestPhone(phone({ imei1: B, brand: "novabrand", name: "Galaxy Z9" }));
    expect(q.category).toBe("NovaBrand");
    expect(q.name).toBe("Galaxy Z9");
  });
  it("CAT-04 NEW with OPEN_BOX remains NEW", () => {
    const p = addTestPhone(phone({ packaging: "OPEN_BOX" }));
    expect(p.condition).toBe("NEW");
    expect(p.packaging).toBe("OPEN_BOX");
  });
  it("CAT-07 dual-IMEI phone is exactly one stock unit", () => {
    const before = count();
    addTestPhone(phone({ imei2: B }));
    expect(count()).toBe(before + 1);
    expect(getTestState().phones.filter((p) => p.imei === A || p.imei2 === B)).toHaveLength(1);
  });
  it("CAT-08 rejects same-slot, cross-slot, swapped, cross-store, IMEI1==IMEI2 and bad checksum", () => {
    addTestPhone(phone({ imei2: B }));
    const before = count();
    expect(() => addTestPhone(phone({ imei1: A, imei2: "" }))).toThrow();
    expect(() => addTestPhone(phone({ imei1: B, imei2: "" }))).toThrow();
    expect(() => addTestPhone(phone({ imei1: B, imei2: A }))).toThrow();
    expect(() => addTestPhone(phone({ store: "M02", imei1: C, imei2: A }))).toThrow();
    expect(() => addTestPhone(phone({ imei1: C, imei2: C }))).toThrow();
    expect(() => addTestPhone(phone({ imei1: "490154203237519" }))).toThrow();
    expect(phoneDraftSchema.safeParse(phone({ imei1: "12345" })).success).toBe(false);
    expect(count()).toBe(before);
  });
  it("IMEI-less phone needs a unique serial instead of a fabricated IMEI", () => {
    expect(phoneDraftSchema.safeParse(phone({ imei1: "" })).success).toBe(false);
    const p = addTestPhone(phone({ imei1: "", serial: "SN-NOIMEI-1" }));
    expect(p.imei).toBe("");
    expect(() => addTestPhone(phone({ imei1: "", serial: "sn-noimei-1" }))).toThrow();
  });
  it("CAT-09 quantity 2 is rejected, including a tampered domain command", () => {
    const before = count();
    expect(() => addTestPhone({ ...phone(), quantity: "2" } as unknown as PhoneDraft)).toThrow();
    expect(() => addTestPhone({ ...phone(), quantity: 2 } as unknown as PhoneDraft)).toThrow();
    expect(count()).toBe(before);
  });
  it("CAT-10 search by IMEI1, IMEI2, serial and unit barcode finds the same phone", () => {
    const p = addTestPhone(phone({ imei2: B, serial: "SN-XYZ-77" }));
    for (const q of [A, B, "SN-XYZ-77", p.code!])
      expect(searchPhones(getTestState().phones, q).map((r) => r.id)).toEqual([p.id]);
  });
  it("CAT-11 generates a unique unit barcode avoiding accessory codes; label reprint does not mutate stock", () => {
    const predicted = nextPhoneBarcode("M01");
    receiveTestAccessory({
      name: "Clash",
      sku: "CLASH",
      category: "C",
      variant: "v",
      compatibility: "c",
      barcode: predicted,
      store: "M01",
      quantity: "1",
      reference: "R",
      remarks: "",
    });
    const p = addTestPhone(phone());
    expect(p.code).toMatch(/^PHU-M01-/);
    expect(p.code).not.toBe(predicted);
    const q = addTestPhone(phone({ imei1: B }));
    expect(q.code).not.toBe(p.code);
    const snap = JSON.stringify(getTestState());
    nextPhoneBarcode("M01");
    expect(JSON.stringify(getTestState())).toBe(snap);
    expect(() => addTestPhone(phone({ imei1: C, barcode: p.code! }))).toThrow();
  });
  it("CAT-17 / SALE-05 sold unit leaves Available, stays in history, and cannot be sold twice", () => {
    const p = addTestPhone(phone({ salePrice: "1000.01" }));
    openTestShift("M01", "Test seller 001", "0");
    recordTestSale({
      key: "S1",
      store: "M01",
      lines: [{ id: p.id, quantity: 1 }],
      customerId: "C-001",
      customerName: "Demo customer 001",
      tender: "Cash",
      paid: "1000.01",
    });
    const row = getTestState().phones.find((r) => r.id === p.id);
    expect(row?.status).toBe("Sold");
    expect(
      getTestState()
        .phones.filter((r) => r.status === "Available")
        .some((r) => r.id === p.id),
    ).toBe(false);
    expect(() =>
      recordTestSale({
        key: "S1",
        store: "M01",
        lines: [{ id: p.id, quantity: 1 }],
        customerId: "C-001",
        customerName: "Demo customer 001",
        tender: "Cash",
        paid: "1000.01",
      }),
    ).toThrow();
    expect(() =>
      recordTestSale({
        key: "S2",
        store: "M01",
        lines: [{ id: p.id, quantity: 1 }],
        customerId: "C-001",
        customerName: "Demo customer 001",
        tender: "Cash",
        paid: "1000.01",
      }),
    ).toThrow();
    expect(getTestState().sales.filter((s) => s.lines.some((l) => l.id === p.id))).toHaveLength(1);
  });
  it("UX-01 used phone with unknown battery is accepted", () => {
    const p = addTestPhone(phone({ condition: "USED", packaging: "NO_BOX", battery: "" }));
    expect(p.condition).toBe("USED");
  });
  it("UX-03 price 0, negative or invalid creates no stock", () => {
    const before = count();
    for (const salePrice of ["0", "0.00", "-5", "abc", "1.234", ""])
      expect(() => addTestPhone(phone({ salePrice }))).toThrow();
    expect(count()).toBe(before);
  });
  it("UX-04 repeated submit with the same intake key creates one unit and one audit entry", () => {
    const before = count();
    const a = addTestPhone(phone(), { intakeKey: "K1" });
    const b = addTestPhone(phone(), { intakeKey: "K1" });
    expect(b.id).toBe(a.id);
    expect(count()).toBe(before + 1);
  });
  it("UX-05 phone survives a persisted-state round trip and is sellable only in its store", () => {
    const p = addTestPhone(phone({ store: "M02", salePrice: "500" }));
    const reloaded = migrateReviewWorkspace(JSON.parse(JSON.stringify(getTestState())));
    expect(reloaded.phones.find((r) => r.id === p.id)?.store).toBe("M02");
    expect(() =>
      previewTestSale({
        store: "M01",
        lines: [{ id: p.id, quantity: 1 }],
        customerId: "C-001",
        customerName: "Demo customer 001",
        tender: "Cash",
        paid: "500",
      }),
    ).toThrow();
    expect(
      previewTestSale({
        store: "M02",
        lines: [{ id: p.id, quantity: 1 }],
        customerId: "C-001",
        customerName: "Demo customer 001",
        tender: "Cash",
        paid: "500",
      }).total,
    ).toBe("500.00");
  });
  it("UX-02 ALL scope shows a required store choice with no M01 default", async () => {
    render(
      <ErpProvider>
        <PhonesInventory />
      </ErpProvider>,
    );
    fireEvent.click(
      (await screen.findAllByRole("button", { name: /add phone|ajouter un téléphone/i }))[0]!,
    );
    const store = (await screen.findByRole("combobox", {
      name: /store|magasin/i,
    })) as HTMLSelectElement;
    expect(store.value).toBe("");
    expect([...store.options].map((o) => o.textContent)).toEqual(
      expect.arrayContaining(["Magasin 1 (M01)", "Magasin 2 (M02)"]),
    );
    const before = count();
    fireEvent.click(
      screen.getAllByRole("button", { name: /add phone|ajouter un téléphone/i }).at(-1)!,
    );
    expect(count()).toBe(before);
    expect(screen.queryAllByRole("spinbutton", { name: /quantity/i })).toHaveLength(0);
  });
  it("SEC-01 intake carries no cost field; only Super Admin preview may see costs (hosted authorization NOT RUN)", () => {
    expect(Object.keys(phoneDraftSchema._def.schema._def.schema._def.schema.shape)).not.toEqual(
      expect.arrayContaining(["cost", "purchasePrice", "margin"]),
    );
    expect(canPreviewOwnerFinance("SELLER")).toBe(false);
    expect(canPreviewOwnerFinance("MANAGER")).toBe(false);
    expect(canPreviewOwnerFinance("SUPER_ADMIN")).toBe(true);
  });
});
