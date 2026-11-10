import type { BusinessReadContract, BusinessSnapshot, DemoReadState } from "@/domain/business";
import { algiersDate } from "@/domain/sales-review";
import { inScope } from "@/domain/business";
import { getSession } from "./session-store";
import { getTestState, includesReviewFixtures } from "./test-workspace";
const fixture: BusinessSnapshot = {
  customers: [
    {
      id: "C-001",
      name: "Demo customer 001",
      contact: "0550 000 001",
      store: "M01",
      address: "Synthetic address",
      reference: "DEMO-C001",
      notes: "",
      source: "Fixture",
    },
    {
      id: "C-002",
      name: "Demo customer 002",
      contact: "0550 000 002",
      store: "M01",
      address: "",
      reference: "DEMO-C002",
      notes: "",
      source: "Fixture",
    },
    {
      id: "C-003",
      name: "Demo customer 003",
      contact: "0550 000 003",
      store: "M02",
      address: "",
      reference: "DEMO-C003",
      notes: "",
      source: "Fixture",
    },
  ],
  sales: [
    {
      id: "S-1031",
      customerId: "C-002",
      store: "M01",
      item: "Samsung Galaxy A55",
      imei: "000000000000005",
      amount: "64500.00",
      date: "2026-11-05",
    },
    {
      id: "S-1048",
      customerId: "C-001",
      store: "M01",
      item: "Historical synthetic phone",
      imei: "000000000000050",
      amount: "189000.00",
      date: "2026-11-05",
    },
    {
      id: "S-1022",
      customerId: "C-003",
      store: "M02",
      item: "Historical synthetic phone",
      imei: "000000000000051",
      amount: "89000.00",
      date: "2026-11-04",
    },
  ],
  debts: [
    {
      id: "D-001",
      customerId: "C-002",
      store: "M01",
      saleReference: "S-1031",
      amount: "30000.00",
      dueDate: "2026-11-30",
      authorizationReference: "DEMO-AUTH-001",
      notes: "Synthetic obligation, not eligibility approval",
      source: "Fixture",
    },
  ],
  repayments: [
    {
      id: "PAY-001",
      subjectId: "D-001",
      amount: "2000.00",
      date: "2026-11-05",
      method: "Bank",
      reference: "DEMO-BANK-001",
      authorizationReference: "DEMO-AUTH-001",
      source: "Fixture",
    },
  ],
  suppliers: [
    {
      id: "SUP-001",
      name: "Demo supplier 001",
      contact: "Synthetic supplier contact",
      store: "M01",
      documentReference: "DEMO-SUP-001",
      notes: "Phones",
      source: "Fixture",
    },
    {
      id: "SUP-002",
      name: "Demo supplier 002",
      contact: "Synthetic supplier contact",
      store: "M02",
      documentReference: "DEMO-SUP-002",
      notes: "Accessories",
      source: "Fixture",
    },
  ],
  purchases: [
    {
      id: "PO-001",
      supplierId: "SUP-001",
      store: "M01",
      kind: "Phone",
      product: "Synthetic phone model",
      quantity: "2",
      documentReference: "DEMO-PO-001",
      expectedDate: "2026-11-10",
      notes: "",
      source: "Fixture",
    },
    {
      id: "PO-002",
      supplierId: "SUP-002",
      store: "M02",
      kind: "Accessory",
      product: "Synthetic USB-C cable batch",
      quantity: "10",
      documentReference: "DEMO-PO-002",
      expectedDate: "2026-11-10",
      notes: "",
      source: "Fixture",
    },
  ],
  expenses: [
    {
      id: "EX-001",
      category: "Demo utilities",
      description: "Synthetic utilities entry",
      store: "M01",
      amount: "4500.00",
      method: "Bank",
      date: "2026-11-05",
      documentReference: "DEMO-EX-001",
      notes: "Taxonomy not approved",
      state: "Policy required",
    },
  ],
  facilities: [
    {
      id: "FA-001",
      customerId: "C-001",
      employer: "Demo employer",
      store: "M01",
      contractReference: "DEMO-FA-001",
      contractPrice: "30000.00",
      months: "3",
      firstMonth: "2026-11",
      installmentAmount: "10000.00",
      notes: "Explicit synthetic contract values, not universal terms",
      source: "Fixture",
    },
  ],
  cases: [
    {
      id: "SAV-001",
      customerId: "C-003",
      store: "M02",
      saleReference: "S-1022",
      imei: "000000000000051",
      issue: "Synthetic battery inspection",
      requestedAction: "Inspection",
      documentReference: "DEMO-SAV-001",
      notes: "No warranty eligibility confirmed",
      stage: "Inspection",
      history: ["Inspection · Synthetic fixture"],
      source: "Fixture",
    },
  ],
};
// Fixture rows plus shared session drafts, scope-filtered. Session drafts are
// synthetic and unposted; they exist so cross-module UI flows (for example a
// customer drafted in Customers becoming selectable in a Debt draft) can be
// exercised during one demonstration session.
export function projectSnapshot(
  scope: Parameters<BusinessReadContract["read"]>[0],
  state: DemoReadState = "Live demo",
): BusinessSnapshot {
  if (state === "Error") throw new Error("Demo read failure — retry available");
  const empty = state === "Empty" || state === "Forbidden";
  const session = getSession();
  const reference = includesReviewFixtures()
    ? fixture
    : (Object.fromEntries(Object.keys(fixture).map((k) => [k, []])) as unknown as BusinessSnapshot);
  const pick = <T extends { store: "M01" | "M02" }>(rows: T[]): T[] =>
    empty ? [] : rows.filter((r) => inScope(r.store, scope));
  const debts = pick([...session.debts, ...reference.debts]);
  return {
    customers: pick([...session.customers, ...reference.customers]),
    sales: empty
      ? []
      : [
          ...getTestState().sales.flatMap((sale) =>
            sale.lines.map((l) => ({
              id: sale.id,
              customerId: sale.customerId,
              store: sale.store,
              item: l.name,
              ...(l.imei ? { imei: l.imei } : {}),
              amount: l.lineTotal,
              date: algiersDate(sale.at),
            })),
          ),
          ...reference.sales,
        ].filter((r) => inScope(r.store, scope)),
    debts,
    repayments: empty
      ? []
      : [...session.repayments, ...reference.repayments].filter((r) =>
          debts.some((d) => d.id === r.subjectId),
        ),
    suppliers: pick([
      ...session.suppliers,
      ...reference.suppliers.filter((f) => !session.suppliers.some((s) => s.id === f.id)),
    ]),
    purchases: pick([...session.purchases, ...reference.purchases]),
    expenses: pick([...session.expenses, ...reference.expenses]),
    facilities: pick([...session.facilities, ...reference.facilities]),
    cases: pick([...session.cases, ...reference.cases]),
  };
}
export const businessDemo: BusinessReadContract = {
  mode: "demo",
  read: async (scope, _role, state = "Live demo") => {
    if (state === "Loading") await new Promise((resolve) => setTimeout(resolve, 1500));
    return structuredClone(projectSnapshot(scope, state));
  },
};
