import { createFileRoute } from "@tanstack/react-router";
import { modePage } from "@/components/erp/mode-page";
const SalesPage = modePage(() =>
  import("@/components/erp/sales").then((m) => ({ default: m.SalesPage })),
);
export const Route = createFileRoute("/sales")({
  head: () => ({
    meta: [
      { title: "Sales History | Phone House Maghnia" },
      {
        name: "description",
        content: "Store-scoped local sales history, linked buyers and invoice specimens.",
      },
      { property: "og:title", content: "Sales History | Phone House Maghnia" },
      {
        property: "og:description",
        content: "Phone House sales, payments and draft warranty specimens.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SalesPage,
});
