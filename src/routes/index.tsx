import { createFileRoute } from "@tanstack/react-router";
import { modePage } from "@/components/erp/mode-page";
const Dashboard = modePage(() =>
  import("@/components/erp/dashboard").then((m) => ({ default: m.Dashboard })),
);
export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Executive Overview | Phone House Maghnia" },
      {
        name: "description",
        content:
          "Phone House Maghnia internal workspace: executive store overview. Synthetic frontend preview.",
      },
      { property: "og:title", content: "Executive Overview | Phone House Maghnia" },
      { property: "og:description", content: "Internal executive workspace. Demo data only." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Dashboard,
});
