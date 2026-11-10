import { createFileRoute } from "@tanstack/react-router";
import { modePage } from "@/components/erp/mode-page";
const CatalogPage = modePage(() =>
  import("@/components/erp/catalog").then((m) => ({ default: m.CatalogPage })),
);
export const Route = createFileRoute("/catalog")({
  head: () => ({
    meta: [
      { title: "Catalog & Barcodes | Phone House Maghnia" },
      {
        name: "description",
        content: "Catalog & Barcodes internal workspace. Synthetic frontend preview only.",
      },
      { property: "og:title", content: "Catalog & Barcodes | Phone House Maghnia" },
      {
        property: "og:description",
        content: "Catalog & Barcodes — Phone House Maghnia internal demo workspace.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Page,
});
function Page() {
  return <CatalogPage />;
}
