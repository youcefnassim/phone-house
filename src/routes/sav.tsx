import { createFileRoute } from "@tanstack/react-router";
import { modePage } from "@/components/erp/mode-page";
const ServicePage = modePage(() =>
  import("@/components/erp/service-business").then((m) => ({ default: m.ServicePage })),
);
export const Route = createFileRoute("/sav")({
  head: () => ({
    meta: [
      { title: "Warranty & SAV | Phone House Maghnia" },
      {
        name: "description",
        content: "Warranty & SAV internal workspace. Synthetic frontend preview only.",
      },
      { property: "og:title", content: "Warranty & SAV | Phone House Maghnia" },
      {
        property: "og:description",
        content: "Warranty & SAV — Phone House Maghnia internal demo workspace.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Page,
});
function Page() {
  return <ServicePage />;
}
