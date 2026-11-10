import { createFileRoute } from "@tanstack/react-router";
import { modePage } from "@/components/erp/mode-page";
const Reports = modePage(() =>
  import("@/components/erp/reports").then((m) => ({ default: m.Reports })),
);
export const Route = createFileRoute("/reports")({
  head: () => ({
    meta: [
      { title: "Store-day Sales & Zakat Preparation | Phone House Maghnia" },
      {
        name: "description",
        content:
          "Phone House Maghnia sales per store and Algeria day; owner-only non-certified Zakat preparation.",
      },
      {
        property: "og:title",
        content: "Store-day Sales & Zakat Preparation | Phone House Maghnia",
      },
      {
        property: "og:description",
        content: "Store and date-filtered sales exports with private owner-only cost coverage.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Reports,
});
