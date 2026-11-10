import { createFileRoute } from "@tanstack/react-router";
import { modePage } from "@/components/erp/mode-page";
const PhonesInventory = modePage(() =>
  import("@/components/erp/inventory").then((m) => ({ default: m.PhonesInventory })),
);
export const Route = createFileRoute("/stock/phones")({
  head: () => ({
    meta: [
      { title: "Phones Inventory | Phone House Maghnia" },
      {
        name: "description",
        content: "Phones Inventory internal workspace. Synthetic frontend preview only.",
      },
      { property: "og:title", content: "Phones Inventory | Phone House Maghnia" },
      {
        property: "og:description",
        content: "Phones Inventory — Phone House Maghnia internal demo workspace.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Page,
});
function Page() {
  return <PhonesInventory />;
}
