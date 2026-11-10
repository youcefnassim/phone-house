import { createFileRoute } from "@tanstack/react-router";
import { modePage } from "@/components/erp/mode-page";
const Auth = modePage(() => import("@/components/erp/auth").then((m) => ({ default: m.Auth })));
export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign In | Phone House Maghnia" },
      { name: "description", content: "Phone House Maghnia sign in. Frontend preview only." },
      { property: "og:title", content: "Sign In | Phone House Maghnia" },
      {
        property: "og:description",
        content: "Internal sign in preview; no operational transactions.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Auth,
});
