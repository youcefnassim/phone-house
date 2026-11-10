import { createFileRoute } from "@tanstack/react-router";
import { modePage } from "@/components/erp/mode-page";
const SuppliersPage = modePage(() =>
  import("@/components/erp/suppliers-purchases").then((m) => ({ default: m.SuppliersPage })),
);
export const Route = createFileRoute("/suppliers")({
  head: () => ({
    meta: [
      { title: "Suppliers | Phone House Maghnia" },
      {
        name: "description",
        content: "Suppliers internal workspace. Synthetic frontend preview only.",
      },
      { property: "og:title", content: "Suppliers | Phone House Maghnia" },
      {
        property: "og:description",
        content: "Suppliers — Phone House Maghnia internal demo workspace.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Page,
});
function Page() {
  return <SuppliersPage />;
}
