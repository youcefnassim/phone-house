import { createFileRoute } from "@tanstack/react-router";
import { modePage } from "@/components/erp/mode-page";
const UsersPage = modePage(() =>
  import("@/components/erp/users").then((m) => ({ default: m.UsersPage })),
);
export const Route = createFileRoute("/users")({
  head: () => ({
    meta: [
      { title: "Users & Roles | Phone House Maghnia" },
      {
        name: "description",
        content: "Users & Roles internal workspace. Synthetic frontend preview only.",
      },
      { property: "og:title", content: "Users & Roles | Phone House Maghnia" },
      {
        property: "og:description",
        content: "Users & Roles — Phone House Maghnia internal demo workspace.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Page,
});
function Page() {
  return <UsersPage />;
}
