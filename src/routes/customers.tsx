import { createFileRoute } from "@tanstack/react-router";
import { modePage } from "@/components/erp/mode-page";
const CustomersPage = modePage(() =>
  import("@/components/erp/customers-debts").then((m) => ({ default: m.CustomersPage })),
);
export const Route = createFileRoute("/customers")({
  head: () => ({
    meta: [
      { title: "Customers | Phone House Maghnia" },
      {
        name: "description",
        content: "Customers internal workspace. Synthetic frontend preview only.",
      },
      { property: "og:title", content: "Customers | Phone House Maghnia" },
      {
        property: "og:description",
        content: "Customers — Phone House Maghnia internal demo workspace.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Page,
});
function Page() {
  return <CustomersPage />;
}
