import { createFileRoute } from "@tanstack/react-router";
import { modePage } from "@/components/erp/mode-page";
const DebtsPage = modePage(() =>
  import("@/components/erp/customers-debts").then((m) => ({ default: m.DebtsPage })),
);
export const Route = createFileRoute("/debts")({
  head: () => ({
    meta: [
      { title: "Customer Debts | Phone House Maghnia" },
      {
        name: "description",
        content: "Customer Debts internal workspace. Synthetic frontend preview only.",
      },
      { property: "og:title", content: "Customer Debts | Phone House Maghnia" },
      {
        property: "og:description",
        content: "Customer Debts — Phone House Maghnia internal demo workspace.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Page,
});
function Page() {
  return <DebtsPage />;
}
