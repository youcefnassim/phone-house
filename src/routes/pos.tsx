import { createFileRoute } from "@tanstack/react-router";
import { modePage } from "@/components/erp/mode-page";
const Pos = modePage(() => import("@/components/erp/pos").then((m) => ({ default: m.Pos })));
export const Route = createFileRoute("/pos")({
  head: () => ({
    meta: [
      { title: "Point of Sale | Phone House Maghnia" },
      { name: "description", content: "Phone House Maghnia point of sale. Frontend preview only." },
      { property: "og:title", content: "Point of Sale | Phone House Maghnia" },
      {
        property: "og:description",
        content: "Internal point of sale preview; no operational transactions.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Pos,
});
