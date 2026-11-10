import { createFileRoute } from "@tanstack/react-router";
import { modePage } from "@/components/erp/mode-page";
const AuditPage = modePage(() =>
  import("@/components/erp/audit").then((m) => ({ default: m.AuditPage })),
);
export const Route = createFileRoute("/audit")({
  head: () => ({
    meta: [
      { title: "Audit History | Phone House Maghnia" },
      {
        name: "description",
        content: "Audit History internal workspace. Synthetic frontend preview only.",
      },
      { property: "og:title", content: "Audit History | Phone House Maghnia" },
      {
        property: "og:description",
        content: "Audit History — Phone House Maghnia internal demo workspace.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Page,
});
function Page() {
  return <AuditPage />;
}
