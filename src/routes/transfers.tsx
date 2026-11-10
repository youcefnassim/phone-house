import { createFileRoute } from "@tanstack/react-router";
import { modePage } from "@/components/erp/mode-page";
const TransfersPage = modePage(() =>
  import("@/components/erp/transfers-business").then((m) => ({ default: m.TransfersPage })),
);
export const Route = createFileRoute("/transfers")({
  head: () => ({
    meta: [
      { title: "Transfers | Phone House Maghnia" },
      {
        name: "description",
        content: "Transfers internal workspace. Synthetic frontend preview only.",
      },
      { property: "og:title", content: "Transfers | Phone House Maghnia" },
      {
        property: "og:description",
        content: "Transfers — Phone House Maghnia internal demo workspace.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Page,
});
function Page() {
  return <TransfersPage />;
}
