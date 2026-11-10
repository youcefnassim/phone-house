import { afterEach, describe, it, expect } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { OperationDraftForm } from "@/components/erp/operation-ui";
import { ErpProvider } from "@/components/erp/context";
import {
  customerSchema,
  debtSchema,
  supplierSchema,
  purchaseSchema,
  expenseSchema,
  facilitySchema,
  serviceSchema,
} from "@/domain/business";
afterEach(cleanup);
const cases = [
  {
    name: "Customer",
    schema: customerSchema,
    value: {
      name: "Customer",
      contact: "Demo contact",
      store: "M01",
      reference: "C",
      address: "",
      notes: "",
    },
  },
  {
    name: "Debt",
    schema: debtSchema,
    value: {
      customerId: "C",
      store: "M01",
      saleReference: "S",
      amount: "100.01",
      dueDate: "2026-11-30",
      authorizationReference: "A",
      notes: "",
    },
  },
  {
    name: "Supplier",
    schema: supplierSchema,
    value: { name: "Supplier", contact: "Demo", store: "M02", documentReference: "S", notes: "" },
  },
  {
    name: "Purchase",
    schema: purchaseSchema,
    value: {
      supplierId: "SUP",
      store: "M01",
      kind: "Phone",
      product: "Model",
      quantity: "2",
      documentReference: "PO",
      expectedDate: "2026-11-10",
      notes: "",
    },
  },
  {
    name: "Expense",
    schema: expenseSchema,
    value: {
      category: "Explicit category",
      description: "Expense",
      store: "M01",
      amount: "100.01",
      method: "Cash",
      date: "2026-11-06",
      documentReference: "EX",
      notes: "",
    },
  },
  {
    name: "Facility",
    schema: facilitySchema,
    value: {
      customerId: "C",
      employer: "Employer",
      store: "M01",
      contractReference: "F",
      contractPrice: "300.03",
      months: "3",
      firstMonth: "2026-11",
      installmentAmount: "100.01",
      notes: "",
    },
  },
  {
    name: "Service",
    schema: serviceSchema,
    value: {
      customerId: "C",
      store: "M02",
      saleReference: "S",
      imei: "000000000000051",
      issue: "Issue",
      requestedAction: "Exchange",
      documentReference: "SAV",
      notes: "",
    },
  },
];
describe("Review 04 typed form validation and draft delivery", () => {
  for (const example of cases)
    it(`${example.name} rejects empty submission and delivers validated values only`, () => {
      const saved: unknown[] = [];
      render(
        <ErpProvider>
          <OperationDraftForm<unknown>
            title={example.name}
            schema={example.schema}
            fields={Object.keys(example.value).map((name) => ({ name, label: name }))}
            onCancel={() => {}}
            onSave={(v) => saved.push(v)}
          />
        </ErpProvider>,
      );
      fireEvent.submit(screen.getByRole("form", { name: example.name }));
      expect(saved).toHaveLength(0);
      expect(screen.getByRole("alert")).toBeInTheDocument();
      for (const [key, value] of Object.entries(example.value))
        fireEvent.change(screen.getByLabelText(key), { target: { value } });
      fireEvent.submit(screen.getByRole("form", { name: example.name }));
      expect(saved).toEqual([example.value]);
    });
});
