import { afterEach, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ErpProvider, useErp } from "@/components/erp/context";
import { useErp as useStableErp } from "@/components/erp/ui-context";

afterEach(cleanup);
function Consumer() {
  const ctx = useErp();
  const stable = useStableErp();
  return (
    <button onClick={() => ctx.setScope("M02")}>
      {ctx.scope}:{stable.scope}
    </button>
  );
}
it("shares the same provider context through both import paths and rerenders", () => {
  expect(useErp).toBe(useStableErp);
  const view = render(
    <ErpProvider>
      <Consumer />
    </ErpProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "ALL:ALL" }));
  expect(screen.getByRole("button", { name: "M02:M02" })).toBeInTheDocument();
  view.rerender(
    <ErpProvider>
      <Consumer />
    </ErpProvider>,
  );
  expect(screen.getByRole("button", { name: "M02:M02" })).toBeInTheDocument();
});
