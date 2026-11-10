import { createFileRoute } from "@tanstack/react-router";
import { modePage } from "@/components/erp/mode-page";
const NativeWaitingList = modePage(() =>
  import("@/components/erp/native-owner-dashboard").then((m) => ({ default: m.NativeWaitingList })),
);
export const Route = createFileRoute("/waiting")({
  head: () => ({
    meta: [
      { title: "Owner Reviews | Phone House Maghnia" },
      {
        name: "description",
        content: "Pending cash, transfer, inventory and SAV decisions for the Phone House owner.",
      },
      { property: "og:title", content: "Owner Reviews | Phone House Maghnia" },
      { property: "og:description", content: "Phone House owner review queue." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: NativeWaitingList,
});
