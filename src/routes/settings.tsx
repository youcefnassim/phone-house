import { createFileRoute } from "@tanstack/react-router";
import { modePage } from "@/components/erp/mode-page";
const SettingsPage = modePage(() =>
  import("@/components/erp/settings").then((m) => ({ default: m.SettingsPage })),
);
export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Workspace Settings | Phone House Maghnia" },
      {
        name: "description",
        content: "Phone House Maghnia workspace settings. Frontend preview only.",
      },
      { property: "og:title", content: "Workspace Settings | Phone House Maghnia" },
      {
        property: "og:description",
        content: "Internal workspace settings preview; no operational transactions.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SettingsPage,
});
