import { createFileRoute } from "@tanstack/react-router";
import { modePage } from "@/components/erp/mode-page";
const CashRegisters = modePage(() =>
  import("@/components/erp/cash").then((m) => ({ default: m.CashRegisters })),
);
export const Route = createFileRoute("/cash")({
  head: () => ({
    meta: [
      { title: "Cash Registers | Phone House Maghnia" },
      {
        name: "description",
        content: "Cash Registers internal workspace. Synthetic frontend preview only.",
      },
      { property: "og:title", content: "Cash Registers | Phone House Maghnia" },
      {
        property: "og:description",
        content: "Cash Registers — Phone House Maghnia internal demo workspace.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Page,
});
function Page() {
  return <CashRegisters />;
}
