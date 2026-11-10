// @vitest-environment node
import { it, expect } from "vitest";
import { Miniflare } from "miniflare";
import { readFileSync } from "node:fs";
import { sqliteMigrations } from "./sqlite-migrations";
import { generateKeyPair, exportJWK, SignJWT } from "jose";
import worker from "@/backend/worker";
const ok = { limit: async () => ({ success: true }) };
const fullEnv = {
  ENABLE_NATIVE: "OWNER_APPROVED",
  API_HOST: "api.example",
  ALLOWED_ORIGIN: "https://erp.example",
  IDENTITY_CONFIG: "{}",
  RATE_LIMIT: ok,
  // Gate tests never reach the binding; a placeholder proves config order only.
  DB: {} as never,
};
const req = (path: string, init: RequestInit = {}) =>
  new Request(`https://api.example${path}`, {
    ...init,
    headers: { Origin: "https://erp.example", ...(init.headers ?? {}) },
  });

it("worker fails closed on missing configuration, wrong host, wrong origin and rate-limit failure", async () => {
  // Missing bindings/config: NOT_CONFIGURED, never a substitute.
  expect((await worker.fetch(req("/api/native/status"), {})).status).toBe(503);
  expect(
    (await worker.fetch(req("/api/native/status"), { ...fullEnv, ENABLE_NATIVE: "no" })).status,
  ).toBe(503);
  // Wrong host.
  const wrongHost = await worker.fetch(
    new Request("https://evil.example/api/native/status", {
      headers: { Origin: "https://erp.example" },
    }),
    fullEnv,
  );
  expect(wrongHost.status).toBe(403);
  expect(((await wrongHost.json()) as { error: string }).error).toBe("HOST_REJECTED");
  // Wrong or missing origin.
  const wrongOrigin = await worker.fetch(
    new Request("https://api.example/api/native/status", {
      headers: { Origin: "https://other.example" },
    }),
    fullEnv,
  );
  expect(((await wrongOrigin.json()) as { error: string }).error).toBe("ORIGIN_REJECTED");
  // Rate limiter denies, and a broken limiter denies too (no local fallback).
  const limited = await worker.fetch(req("/api/native/status"), {
    ...fullEnv,
    RATE_LIMIT: { limit: async () => ({ success: false }) },
  });
  expect(limited.status).toBe(429);
  const broken = await worker.fetch(req("/api/native/status"), {
    ...fullEnv,
    RATE_LIMIT: {
      limit: async () => {
        throw new Error("down");
      },
    },
  });
  expect(((await broken.json()) as { error: string }).error).toBe("RATE_LIMIT_UNAVAILABLE");
});

it("worker serves a verified status over a real local D1 binding with a signed JWT", async () => {
  const mf = new Miniflare({
    modules: true,
    script: 'export default {fetch(){return new Response("isolated")}}',
    compatibilityDate: "2026-08-06",
    d1Databases: ["DB"],
  });
  try {
    const db = await mf.getD1Database("DB");
    for (const file of sqliteMigrations) {
      const source = readFileSync(`db/sqlite/${file}`, "utf8").replace(/^--.*$/gm, "");
      const statements = source.match(/\s*CREATE TRIGGER[\s\S]*?END;|\s*[^;]+;/g) ?? [];
      await db.batch(statements.map((s) => db.prepare(s)));
    }
    await db.exec(
      `INSERT INTO accounts VALUES('owner',1); INSERT INTO memberships VALUES('owner','GLOBAL','SUPER_ADMIN'); INSERT INTO sessions VALUES('sess1','owner',9999999999999,0); INSERT INTO identity_subjects VALUES('https://id.example','sub-1','owner');`,
    );
    const { publicKey, privateKey } = await generateKeyPair("ES256");
    const jwk = await exportJWK(publicKey);
    jwk.kid = "k1";
    jwk.alg = "ES256";
    const token = await new SignJWT({ sid: "sess1" })
      .setProtectedHeader({ alg: "ES256", kid: "k1" })
      .setSubject("sub-1")
      .setIssuer("https://id.example")
      .setAudience("erp")
      .setIssuedAt()
      .setExpirationTime("2h")
      .sign(privateKey);
    const env = {
      ...fullEnv,
      DB: db,
      IDENTITY_CONFIG: JSON.stringify({
        issuer: "https://id.example",
        audience: "erp",
        jwks: { keys: [jwk] },
      }),
    };
    const anonymous = await worker.fetch(req("/api/native/status"), env);
    expect(((await anonymous.json()) as { verified: boolean }).verified).toBe(false);
    const authed = await worker.fetch(
      req("/api/native/status", { headers: { Authorization: `Bearer ${token}` } }),
      env,
    );
    const body = (await authed.json()) as {
      verified: boolean;
      memberships: { store: string; role: string }[];
    };
    expect(body.verified).toBe(true);
    expect(body.memberships).toEqual([{ store: "GLOBAL", role: "SUPER_ADMIN" }]);
    // A token signed by an unknown key never verifies.
    const other = await generateKeyPair("ES256");
    const forged = await new SignJWT({ sid: "sess1" })
      .setProtectedHeader({ alg: "ES256", kid: "k1" })
      .setSubject("sub-1")
      .setIssuer("https://id.example")
      .setAudience("erp")
      .setIssuedAt()
      .setExpirationTime("2h")
      .sign(other.privateKey);
    const denied = await worker.fetch(
      req("/api/native/status", { headers: { Authorization: `Bearer ${forged}` } }),
      env,
    );
    expect(((await denied.json()) as { verified: boolean }).verified).toBe(false);
    // Authenticated read route roundtrip through the worker over local D1.
    const read = await worker.fetch(
      req("/api/native/read", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ module: "settings", store: "M01", limit: 10 }),
      }),
      env,
    );
    expect(read.status).toBe(200);
    const rows = (await read.json()) as { rows: { label: string }[] };
    expect(rows.rows[0]?.label).toBe("Magasin 1 (M01)");
  } finally {
    await mf.dispose();
  }
}, 60000);
