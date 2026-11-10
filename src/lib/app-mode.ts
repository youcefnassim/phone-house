/** The unselected loader is never invoked; Vite removes the compile-time dead branch. */
export function loadAppMode<T>(
  production: boolean,
  loaders: { production: () => Promise<T>; preview: () => Promise<T> },
): Promise<T> {
  return production ? loaders.production() : loaders.preview();
}
export const productionMode = import.meta.env["VITE_APP_MODE"] === "production";
