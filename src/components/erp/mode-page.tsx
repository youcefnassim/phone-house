import { lazy, Suspense, type ComponentType } from "react";
import { loadAppMode, productionMode } from "@/lib/app-mode";
/** Production leaf content is rendered by NativeShell, never by a demo page. */
export function modePage(preview: () => Promise<{ default: ComponentType }>) {
  const Page = lazy(() =>
    loadAppMode<{ default: ComponentType }>(productionMode, {
      production: async () => ({ default: () => null }),
      preview,
    }),
  );
  return function ModePage() {
    return (
      <Suspense fallback={null}>
        <Page />
      </Suspense>
    );
  };
}
