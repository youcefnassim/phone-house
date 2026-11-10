import { createFileRoute } from "@tanstack/react-router";
import { modePage } from "@/components/erp/mode-page";
const AccessoriesInventory = modePage(() =>
  import("@/components/erp/inventory").then((m) => ({ default: m.AccessoriesInventory })),
);
export const Route = createFileRoute("/stock/accessories")({
  head: () => ({
    meta: [
      { title: "Accessories Inventory | Phone House Maghnia" },
      {
        name: "description",
        content: "Accessories Inventory internal workspace. Synthetic frontend preview only.",
      },
      { property: "og:title", content: "Accessories Inventory | Phone House Maghnia" },
      {
        property: "og:description",
        content: "Accessories Inventory — Phone House Maghnia internal demo workspace.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Page,
});
function Page() {
  return <AccessoriesInventory />;
}
