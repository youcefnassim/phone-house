import { addDraft } from "./session-store";
import { projectSnapshot } from "./business-demo";
import { assertReviewStore } from "./test-workspace";
import { testBuyerSchema, type TestBuyer } from "@/domain/test-documents";
import { normalizedBuyer } from "@/domain/sales-review";
import type { StoreId } from "@/domain/erp";
export function findBuyer(store: StoreId, buyer: TestBuyer) {
  const v = testBuyerSchema.parse(buyer);
  return projectSnapshot(store).customers.find(
    (c) =>
      normalizedBuyer(c.name) === normalizedBuyer(`${v.surname} ${v.givenName}`) ||
      (v.contact && normalizedBuyer(c.contact) === normalizedBuyer(v.contact)),
  );
}
export function createPosCustomer(store: StoreId, buyer: TestBuyer) {
  assertReviewStore(store);
  const v = testBuyerSchema.parse(buyer);
  if (findBuyer(store, v)) throw new Error("Select the existing customer.");
  const id = `LOCAL-C-${crypto.randomUUID()}`;
  return addDraft(
    "customers",
    {
      id,
      name: `${v.surname} ${v.givenName}`,
      contact: v.contact,
      store,
      address: "",
      notes: "",
      reference: id,
      source: "Session draft",
    },
    {
      area: "customers",
      action: "Customer draft saved",
      detail: `${v.surname} ${v.givenName}`,
      store,
    },
  );
}
export function buyerOfCustomer(id: string, store: StoreId): TestBuyer | undefined {
  const c = projectSnapshot(store).customers.find((c) => c.id === id);
  if (!c) return;
  const [surname, ...rest] = c.name.trim().split(/\s+/);
  return testBuyerSchema.parse({ surname, givenName: rest.join(" "), contact: c.contact });
}
