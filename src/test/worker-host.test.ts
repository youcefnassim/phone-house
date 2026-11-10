// Phase 2.1: one Worker, one origin. /api/native/* goes to the native handler; plain http is only
// tolerated in dev for localhost/127.0.0.1, never for a real host.
import { it, expect, vi } from "vitest";
import worker, { type NativeWorkerEnv } from "@/backend/worker";
import type { D1Binding } from "@/backend/sqlite/d1-port";

const env = (patch: Partial<NativeWorkerEnv> = {}): NativeWorkerEnv => ({
  DB: { prepare: vi.fn(), batch: vi.fn() } as unknown as D1Binding,
  ENABLE_NATIVE: "OWNER_APPROVED",
  API_HOST: "erp.phonehousemaghnia.com",
  ALLOWED_ORIGIN: "https://erp.phonehousemaghnia.com",
  IDENTITY_CONFIG: "{}",
  RATE_LIMIT: { limit: async () => ({ success: true }) },
  ...patch,
});
const call = async (url: string, e: NativeWorkerEnv, origin = new URL(url).origin) =>
  (await worker.fetch(
    new Request(url, { method: "POST", headers: { Origin: origin }, body: "{}" }),
    e,
  )) as Response;
const code = async (r: Response) => ((await r.json()) as { error?: string }).error;

it("missing bindings fail closed", async () => {
  const { DB: _omitted, ...withoutDb } = env();
  const r = await call("https://erp.phonehousemaghnia.com/api/native/status", withoutDb);
  expect(r.status).toBe(503);
  expect(await code(r)).toBe("NOT_CONFIGURED");
});

it("production host over http is rejected even if LOCAL_DEV_INSECURE is set", async () => {
  const r = await call(
    "http://erp.phonehousemaghnia.com/api/native/status",
    env({ LOCAL_DEV_INSECURE: "1" }),
  );
  expect(await code(r)).toBe("HOST_REJECTED");
});

it("localhost over http is accepted only with LOCAL_DEV_INSECURE=1", async () => {
  const local = { API_HOST: "localhost:8787", ALLOWED_ORIGIN: "http://localhost:8787" };
  expect(await code(await call("http://localhost:8787/api/native/status", env(local)))).toBe(
    "HOST_REJECTED",
  );
  const r = await call(
    "http://localhost:8787/api/native/status",
    env({ ...local, LOCAL_DEV_INSECURE: "1" }),
  );
  expect(await code(r)).not.toBe("HOST_REJECTED");
});

it("cross-origin calls are rejected", async () => {
  const r = await call(
    "https://erp.phonehousemaghnia.com/api/native/status",
    env(),
    "https://evil.example",
  );
  expect(await code(r)).toBe("ORIGIN_REJECTED");
});
