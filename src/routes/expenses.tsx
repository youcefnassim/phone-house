import { createFileRoute } from "@tanstack/react-router";
import { modePage } from "@/components/erp/mode-page";
const ExpensesPage = modePage(() =>
  import("@/components/erp/expenses-business").then((m) => ({ default: m.ExpensesPage })),
);
export const Route = createFileRoute("/expenses")({
  head: () => ({
    meta: [
      { title: "Expenses | Phone House Maghnia" },
      {
        name: "description",
        content: "Expenses internal workspace. Synthetic frontend preview only.",
      },
      { property: "og:title", content: "Expenses | Phone House Maghnia" },
      {
        property: "og:description",
        content: "Expenses — Phone House Maghnia internal demo workspace.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Page,
});
function Page() {
  return <ExpensesPage />;
}
