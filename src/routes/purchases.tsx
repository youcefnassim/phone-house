import { createFileRoute } from "@tanstack/react-router";
import { modePage } from "@/components/erp/mode-page";
const PurchasesPage = modePage(() =>
  import("@/components/erp/suppliers-purchases").then((m) => ({ default: m.PurchasesPage })),
);
export const Route = createFileRoute("/purchases")({
  head: () => ({
    meta: [
      { title: "Purchases | Phone House Maghnia" },
      {
        name: "description",
        content: "Purchases internal workspace. Synthetic frontend preview only.",
      },
      { property: "og:title", content: "Purchases | Phone House Maghnia" },
      {
        property: "og:description",
        content: "Purchases — Phone House Maghnia internal demo workspace.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Page,
});
function Page() {
  return <PurchasesPage />;
}
