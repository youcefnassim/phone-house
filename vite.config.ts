// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { resolve } from "node:path";

const production = process.env["VITE_APP_MODE"] === "production";
const demoPages = new Set([
  "shell",
  "dashboard",
  "pos",
  "audit",
  "cash",
  "catalog",
  "customers-debts",
  "expenses-business",
  "facility-business",
  "suppliers-purchases",
  "reports",
  "sales",
  "service-business",
  "settings",
  "inventory",
  "transfers-business",
  "users",
  "auth",
]);

export default defineConfig({
  plugins: production
    ? [
        {
          name: "phonehouse-production-isolation",
          enforce: "pre",
          resolveId(source, importer) {
            if (/\/(preview-frame)(?:\.tsx)?$/.test(source))
              return resolve("src/components/erp/native-frame.tsx");
            if (source === "./preview-context")
              return resolve("src/components/erp/production-context.tsx");
            const match = source.match(/(?:^@|\/src)\/components\/erp\/([^/]+?)(?:\.tsx)?$/);
            if (
              match?.[1] === "context" ||
              (source === "./context" && importer?.includes("/components/erp/"))
            )
              return resolve("src/components/erp/production-context.tsx");
            if (match?.[1] && demoPages.has(match[1]))
              return resolve("src/components/erp/production-entry.tsx");
            return null;
          },
          generateBundle(_options, bundle) {
            for (const output of Object.values(bundle)) {
              if (output.type !== "chunk") continue;
              const forbidden = Object.keys(output.modules).filter((id) =>
                /\/data\/(test-|local-|.*demo|session-store|ledger-view|synthetic-native)|\/domain\/demo\//.test(
                  id,
                ),
              );
              if (forbidden.length)
                this.error(`Production contains demo modules: ${forbidden.join(", ")}`);
            }
          },
        },
      ]
    : [],
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});
