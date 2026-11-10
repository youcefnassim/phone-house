import { expect, it, vi } from "vitest";
import { loadAppMode } from "@/lib/app-mode";
it("production gating never invokes the preview workspace loader, including native failure", async () => {
  const preview = vi.fn(async () => "fixture");
  const production = vi.fn(async () => "native");
  expect(await loadAppMode(true, { production, preview })).toBe("native");
  expect(preview).not.toHaveBeenCalled();
  await expect(
    loadAppMode(true, {
      production: async () => {
        throw new Error("NOT_CONNECTED");
      },
      preview,
    }),
  ).rejects.toThrow("NOT_CONNECTED");
  expect(preview).not.toHaveBeenCalled();
});
it("preview gating loads only the existing preview workspace", async () => {
  const production = vi.fn(async () => "native");
  expect(await loadAppMode(false, { production, preview: async () => "preview" })).toBe("preview");
  expect(production).not.toHaveBeenCalled();
});
