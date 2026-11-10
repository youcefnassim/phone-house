import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { sqliteHarness } from "./sqlite-harness";
import { planRetailCheckout } from "@/backend/sqlite/retail-checkout";
import { createNativeService } from "@/backend/sqlite/service";
import { defaultSettings, resolveSettings, staffReadableSettings } from "@/domain/intake";
import {
  legalChecklist,
  newPublicReference,
  officialPrintGate,
  publicAlphabet,
  validPublicReference,
  warrantyRule,
} from "@/domain/warranty-documents";
import { OfficialSaleDocumentDialog } from "@/components/erp/official-sale-documents";
import { PhoneWarrantyChoices } from "@/components/erp/pos-buyer";
import { ErpProvider } from "@/components/erp/context";
import type { NativeReceipt } from "@/domain/native-documents";
import {
  resetTestWorkspace,
  saveTestSetting,
  setReviewActor,
  testSettings,
  workspaceIdentities,
} from "@/data/test-workspace";

let h: ReturnType<typeof sqliteHarness>;
const now = Date.parse("2026-11-09T12:00:00Z");
const ids = Array.from(
  { length: 12 },
  (_, i) => `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
);
const identity = { userId: "seller", sessionId: "seller", expiresAt: now + 100000 };
const hash = "a".repeat(64);
const service = () =>
  createNativeService(
    h.port,
    { verify: async (u) => ({ userId: u, sessionId: u, expiresAt: now + 100000 }) },
    { get: async () => null, put: async () => {} },
    () => now,
  );
const request = (i: number, key = `batch2b-checkout-sale-${i}`) => ({
  contractVersion: "native-pos-2026-11-07",
  idempotencyKey: key,
  clientRequestId: ids[11],
  payload: {
    store: "M01",
    shiftId: ids[10],
    buyer: { surname: "Buyer", givenName: "Name", contact: "" },
    lines: [{ itemId: ids[i], kind: "phone", quantity: "1" }],
    tender: "Cash",
    tenderedAmount: "100.00",
    warranties: [{ itemId: ids[i], requested: true, provider: "MANUFACTURER", months: 12 }],
  },
});
const configured = resolveSettings({
  "company.storeAddress": { M01: "Owner supplied address", M02: "" },
  "company.rc": "RC",
  "company.nif": "NIF",
  "company.nis": "NIS",
  "company.ai": "AI",
});
const receipt: NativeReceipt = {
  specimen: 1,
  saleId: "sale",
  invoiceNumber: "FA-M01-2026-000001",
  publicRef: newPublicReference(),
  store: "M01",
  operator: "seller",
  shift: "shift",
  customerId: "buyer",
  buyer: { name: "Buyer Name", surname: "Buyer", givenName: "Name", contact: null },
  payment: "Cash",
  totalMinor: 10000,
  tenderedMinor: 10000,
  changeMinor: 0,
  bankReference: null,
  soldAt: now,
  lines: [
    {
      itemId: "phone",
      kind: "phone",
      quantity: 1,
      unitMinor: 10000,
      name: "Phone",
      reference: "MODEL",
      barcode: "UNIT",
      serial: null,
      imei1: "490154203237518",
      imei2: null,
    },
  ],
  warranties: [
    {
      itemId: "phone",
      requested: true,
      provider: "MANUFACTURER",
      months: 12,
      start: "2026-11-09",
      end: "2027-11-09",
    },
  ],
};
beforeEach(() => {
  resetTestWorkspace();
  localStorage.setItem("ph-lang", "en");
  h = sqliteHarness();
  h.db.exec(
    `INSERT INTO accounts VALUES('owner',1),('seller',1); INSERT INTO memberships VALUES('owner','GLOBAL','SUPER_ADMIN'),('seller','M01','SELLER'); INSERT INTO sessions VALUES('owner','owner',${now + 100000},0),('seller','seller',${now + 100000},0); INSERT INTO catalog VALUES('model','phone','MODEL','Phone','{}'); INSERT INTO prices VALUES('M01','model',10000); INSERT INTO drawers VALUES('drawer','M01'); INSERT INTO shifts VALUES('${ids[10]}','M01','drawer','seller','OPEN',0,NULL);`,
  );
  for (let i = 0; i < 10; i++)
    h.db
      .prepare(
        "INSERT INTO phones(id,store_id,catalog_id,barcode,state,attributes_json,serial) VALUES(?,'M01','model',?,'AVAILABLE','{}',?)",
      )
      .run(ids[i] ?? "", `UNIT-${i}`, `SERIAL-${i}`);
});
afterEach(() => {
  h.db.close();
  cleanup();
  vi.restoreAllMocks();
});
it("initial legal identity is owner-supplied and unknown identifiers, addresses, contacts and conditions stay empty", () => {
  expect(defaultSettings["company.legalName"]).toBe("PHONE HOUSE MAGHNIA");
  expect(defaultSettings["company.legalForm"]).toBe("Personne physique");
  expect(defaultSettings["company.storeAddress"]).toEqual({ M01: "", M02: "" });
  for (const key of ["company.rc", "company.nif", "company.nis", "company.ai"] as const)
    expect(defaultSettings[key]).toBe("");
  expect(defaultSettings["company.contacts"]).toEqual({ phone: "", email: "", facebook: "" });
  expect(defaultSettings["warranty.conditions"]).toEqual({ fr: "", ar: "" });
  expect(defaultSettings["documents.invoiceNumbering"]).toBe("LEGAL_SEQUENCE");
});
it("staff settings reads use an explicit allowlist and settings.save is owner-only with before audit", async () => {
  h.db.exec(`INSERT INTO app_settings VALUES('private.secret','"hidden"',1)`);
  const command = {
    version: "native-2026-11-06",
    key: "legal-name-save-command",
    operation: "settings.save",
    payload: { store: "M01", key: "company.legalName", value: "Owner legal name" },
  };
  await expect(service().execute("seller", command)).rejects.toThrow("FORBIDDEN");
  await service().execute("owner", command);
  const result = await service().settings("seller", { store: "M01" });
  expect(Object.keys(result.settings).sort()).toEqual([...staffReadableSettings].sort());
  expect(result.settings["company.legalName"]).toBe("Owner legal name");
  expect("private.secret" in result.settings).toBe(false);
  await service().execute("owner", {
    ...command,
    key: "legal-name-update-command",
    payload: { ...command.payload, value: "New legal name" },
  });
  const audit = h.db
    .prepare("SELECT before_json FROM audit_events WHERE command_key='legal-name-update-command'")
    .get();
  expect(String(audit?.["before_json"])).toContain("Owner legal name");
});
it.each([
  ["Apple", "iPhone 16", "SHOP"],
  ["Samsung", "Galaxy S24", "SHOP"],
  ["Oppo", "Find X", "MANUFACTURER"],
  ["Vivo", "V40", "MANUFACTURER"],
  ["Infinix", "Note 40", "MANUFACTURER"],
])("NEW %s %s prefills %s 12 months", (brand, model, provider) => {
  expect(warrantyRule(defaultSettings, { brand, model, condition: "NEW" })).toMatchObject({
    provider,
    months: 12,
  });
});
it("USED and unmatched phones have no automatic warranty", () => {
  expect(
    warrantyRule(defaultSettings, { brand: "Apple", model: "iPhone", condition: "USED" }),
  ).toBeUndefined();
  expect(
    warrantyRule(defaultSettings, { brand: "Samsung", model: "Galaxy A55", condition: "NEW" }),
  ).toBeUndefined();
  expect(
    warrantyRule(defaultSettings, { brand: "Other", model: "Other", condition: "NEW" }),
  ).toBeUndefined();
});
it("owner edits warranty rules in the workspace; seller cannot", () => {
  const owner = workspaceIdentities().find((u) => u.role === "SUPER_ADMIN" && u.active);
  const seller = workspaceIdentities().find((u) => u.role === "SELLER" && u.active);
  if (!owner || !seller) throw new Error("Missing test identities");
  const rules = [{ brand: "Apple", series: "", provider: "SHOP" as const, months: 6 as const }];
  setReviewActor(seller.id);
  expect(() => saveTestSetting("warranty.rules", rules)).toThrow();
  setReviewActor(owner.id);
  saveTestSetting("warranty.rules", rules);
  expect(
    warrantyRule(testSettings(), { brand: "Apple", model: "iPhone", condition: "NEW" })?.months,
  ).toBe(6);
});
it("prefill requires one seller tap and preserves changeable provider/months", () => {
  const change = vi.fn();
  render(
    <ErpProvider>
      <PhoneWarrantyChoices
        phones={[
          { id: "phone", name: "iPhone", brand: "Apple", model: "iPhone", condition: "NEW" },
        ]}
        choices={[]}
        onChange={change}
      />
    </ErpProvider>,
  );
  expect(change).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Confirm · Shop · 12 months" }));
  expect(change).toHaveBeenCalledWith([
    expect.objectContaining({ itemId: "phone", requested: true, provider: "SHOP", months: 12 }),
  ]);
});
it("a rejected checkout consumes no sequence and stores no partial records", async () => {
  h.db.prepare("UPDATE phones SET state='SOLD' WHERE id=?").run(ids[0] ?? "");
  await expect(service().checkout("seller", request(0))).rejects.toThrow();
  expect(h.db.prepare("SELECT COUNT(*) n FROM invoice_sequences").get()?.["n"]).toBe(0);
  expect(h.db.prepare("SELECT COUNT(*) n FROM sales").get()?.["n"]).toBe(0);
  h.db.prepare("UPDATE phones SET state='AVAILABLE' WHERE id=?").run(ids[0] ?? "");
  await service().checkout("seller", request(0, "accepted-after-rejection"));
  expect(h.db.prepare("SELECT invoice_number FROM sales").get()?.["invoice_number"]).toBe(
    "FA-M01-2026-000001",
  );
});
it("simultaneous checkout requests allocate unique consecutive numbers and replay does not increment", async () => {
  await Promise.all(Array.from({ length: 8 }, (_, i) => service().checkout("seller", request(i))));
  const rows = h.db
    .prepare("SELECT invoice_number,public_ref FROM sales ORDER BY invoice_number")
    .all();
  expect(rows.map((r) => r["invoice_number"])).toEqual(
    Array.from({ length: 8 }, (_, i) => `FA-M01-2026-${String(i + 1).padStart(6, "0")}`),
  );
  expect(new Set(rows.map((r) => r["public_ref"])).size).toBe(8);
  expect(rows.every((r) => validPublicReference(String(r["public_ref"])))).toBe(true);
  await service().checkout("seller", request(0));
  expect(h.db.prepare("SELECT last FROM invoice_sequences").get()?.["last"]).toBe(8);
});
it("additive migration retains old null numbers and per-store/year sequences", () => {
  h.db.exec(
    "INSERT INTO commands(key,actor_id,store_id,operation,payload_hash,state,transaction_id) VALUES('old','seller','M01','pos.checkout','h','DONE','old-sale')",
  );
  h.db
    .prepare(
      "INSERT INTO sales(id,command_key,store_id,shift_id,seller_id,total_minor,tender,tendered_minor,change_minor) VALUES('old-sale','old','M01',?,'seller',10000,'Cash',10000,0)",
    )
    .run(ids[10] ?? "");
  expect(
    h.db.prepare("SELECT invoice_number,public_ref FROM sales WHERE id='old-sale'").get(),
  ).toMatchObject({ invoice_number: null, public_ref: null });
  h.run(planRetailCheckout(request(0), identity, hash, "sale-year", now));
  expect(h.db.prepare("SELECT year,last FROM invoice_sequences").get()).toMatchObject({
    year: 2026,
    last: 1,
  });
});
it("public reference check character catches every single data-symbol typo", () => {
  const ref = newPublicReference();
  expect(validPublicReference(ref)).toBe(true);
  expect(ref).not.toMatch(/[O0I1]/);
  for (const index of [3, 4, 5, 6, 8, 9, 10, 11])
    for (const symbol of publicAlphabet) {
      if (symbol === ref[index]) continue;
      expect(validPublicReference(ref.slice(0, index) + symbol + ref.slice(index + 1))).toBe(false);
    }
  expect(validPublicReference(ref.slice(0, -1) + (ref.endsWith("2") ? "3" : "2"))).toBe(false);
});
it("checkout snapshots manufacturer provider/months and receipt/SAV lookup accepts public reference", async () => {
  h.db.prepare("INSERT INTO phone_identifiers VALUES(?,?,1)").run("490154203237518", ids[0] ?? "");
  await service().checkout("seller", request(0));
  const sale = h.db.prepare("SELECT id,public_ref,customer_id FROM sales").get();
  const snap = (await service().receipt("seller", sale?.["public_ref"], "M01")) as NativeReceipt;
  expect(snap.warranties[0]).toMatchObject({ provider: "MANUFACTURER", months: 12 });
  await service().execute("seller", {
    version: "native-2026-11-06",
    key: "sav-public-reference-command",
    operation: "sav.open",
    payload: {
      store: "M01",
      id: "case",
      saleId: sale?.["public_ref"],
      phoneId: ids[0],
      customerId: sale?.["customer_id"],
      imei: "490154203237518",
      issue: "Inspection",
    },
  });
  expect(
    (await service().savCases("seller", { store: "M01", search: sale?.["public_ref"] })).cases[0],
  ).toMatchObject({ publicRef: sale?.["public_ref"], warrantyProvider: "MANUFACTURER" });
});
it("six legal fields gate invoice; SHOP alone adds bilingual conditions, never another store's address", () => {
  expect(legalChecklist(defaultSettings, "M01")).toHaveLength(7);
  expect(officialPrintGate(defaultSettings, "M01", false).missing).toHaveLength(5);
  expect(officialPrintGate(configured, "M01", false).ready).toBe(true);
  expect(officialPrintGate(configured, "M01", true).missing.map((c) => c.key)).toEqual([
    "warranty.conditions",
  ]);
  expect(officialPrintGate(configured, "M02", false).ready).toBe(false);
  for (const key of [
    "company.legalName",
    "company.rc",
    "company.nif",
    "company.nis",
    "company.ai",
  ] as const)
    expect(officialPrintGate({ ...configured, [key]: "" }, "M01", false).ready).toBe(false);
  expect(
    officialPrintGate(
      { ...configured, "warranty.conditions": { fr: "Terms", ar: "شروط" } },
      "M01",
      true,
    ).ready,
  ).toBe(true);
});
it("incomplete legal data blocks official print but permits phone thermal ticket and never mutates receipt", async () => {
  const before = JSON.stringify(receipt);
  const print = vi.spyOn(window, "print").mockImplementation(() => {});
  render(
    <ErpProvider>
      <OfficialSaleDocumentDialog receipt={receipt} settings={defaultSettings} onClose={() => {}} />
    </ErpProvider>,
  );
  fireEvent.click(await screen.findByRole("button", { name: "Print / Save as PDF" }));
  expect(print).not.toHaveBeenCalled();
  expect(screen.getByRole("alert")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Ticket" }));
  fireEvent.click(screen.getByRole("button", { name: "Print / Save as PDF" }));
  expect(print).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(receipt)).toBe(before);
});
it("SHOP terms block printing while manufacturer warranty needs no shop terms; reprint is immutable", async () => {
  const print = vi.spyOn(window, "print").mockImplementation(() => {});
  const v = render(
    <ErpProvider>
      <OfficialSaleDocumentDialog
        receipt={{
          ...receipt,
          warranties: [
            { ...receipt.warranties[0], itemId: "phone", requested: true, provider: "SHOP" },
          ],
        }}
        settings={configured}
        onClose={() => {}}
      />
    </ErpProvider>,
  );
  fireEvent.click(await screen.findByRole("button", { name: "Print / Save as PDF" }));
  expect(print).not.toHaveBeenCalled();
  v.unmount();
  const before = JSON.stringify(receipt);
  render(
    <ErpProvider>
      <OfficialSaleDocumentDialog receipt={receipt} settings={configured} onClose={() => {}} />
    </ErpProvider>,
  );
  fireEvent.click(await screen.findByRole("button", { name: "Print / Save as PDF" }));
  fireEvent.click(screen.getByRole("button", { name: "Print / Save as PDF" }));
  expect(print).toHaveBeenCalledTimes(2);
  expect(JSON.stringify(receipt)).toBe(before);
});
it("accessory-only sale cannot print a thermal ticket or phone A4", async () => {
  const print = vi.spyOn(window, "print").mockImplementation(() => {});
  render(
    <ErpProvider>
      <OfficialSaleDocumentDialog
        receipt={{
          ...receipt,
          lines: [
            {
              ...receipt.lines[0],
              itemId: "accessory",
              kind: "accessory",
              quantity: 1,
              unitMinor: 10000,
              name: "Cable",
              reference: "SKU",
              barcode: "SKU",
              serial: null,
              imei1: null,
              imei2: null,
            },
          ],
          warranties: [],
        }}
        settings={configured}
        onClose={() => {}}
      />
    </ErpProvider>,
  );
  expect(screen.queryByRole("button", { name: "Ticket" })).toBeNull();
  expect(await screen.findByRole("button", { name: "Print / Save as PDF" })).toBeDisabled();
  expect(print).not.toHaveBeenCalled();
});
