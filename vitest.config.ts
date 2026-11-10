import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { readdirSync, readFileSync } from "node:fs";

const include = "src/**/*.{test,spec}.{ts,tsx}";

// Files that boot a real workerd (Miniflare) per test. Each instance is a
// separate process with its own memory; running ~7 of them alongside jsdom
// files on an 8 GB machine let Miniflare's D1 proxy see "other side closed",
// cascading into timeouts. Detected by import so new harness files are
// capped automatically.
const workerdFiles = readdirSync("src", { recursive: true, encoding: "utf8" })
  .filter((f) => /\.(test|spec)\.tsx?$/.test(f))
  .map((f) => `src/${f.split(path.sep).join("/")}`)
  .filter((f) => /from "miniflare"|\/local-d1-adapter-harness"/.test(readFileSync(f, "utf8")));

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    projects: [
      {
        extends: true,
        test: { name: "unit", include: [include], exclude: workerdFiles },
      },
      {
        extends: true,
        // Runs after "unit" (groupOrder 1), at most 3 workerd-backed files at once.
        test: {
          name: "workerd",
          include: workerdFiles,
          maxWorkers: 3,
          sequence: { groupOrder: 1 },
        },
      },
    ],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
