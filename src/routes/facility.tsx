import { createFileRoute } from "@tanstack/react-router";
import { modePage } from "@/components/erp/mode-page";
const FacilitiesPage = modePage(() =>
  import("@/components/erp/facility-business").then((m) => ({ default: m.FacilitiesPage })),
);
export const Route = createFileRoute("/facility")({
  head: () => ({
    meta: [
      { title: "Facility Agreements | Phone House Maghnia" },
      {
        name: "description",
        content: "Facility Agreements internal workspace. Synthetic frontend preview only.",
      },
      { property: "og:title", content: "Facility Agreements | Phone House Maghnia" },
      {
        property: "og:description",
        content: "Facility Agreements — Phone House Maghnia internal demo workspace.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Page,
});
function Page() {
  return <FacilitiesPage />;
}
