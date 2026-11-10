import { lazy, Suspense, type ReactNode } from "react";
import { loadAppMode, productionMode } from "@/lib/app-mode";
export { useErp, useT } from "./ui-context";
// Test mounts require a synchronous provider; the TEST-only import is removed from app builds.
const TestProvider =
  import.meta.env.MODE === "test" ? (await import("./preview-context")).ErpProvider : null;
const Provider = lazy(() =>
  loadAppMode(productionMode, {
    production: () => import("./production-context").then((m) => ({ default: m.ErpProvider })),
    preview: () => import("./preview-context").then((m) => ({ default: m.ErpProvider })),
  }),
);
export function ErpProvider({ children }: { children: ReactNode }) {
  if (TestProvider) return <TestProvider>{children}</TestProvider>;
  return (
    <Suspense fallback={null}>
      <Provider>{children}</Provider>
    </Suspense>
  );
}
