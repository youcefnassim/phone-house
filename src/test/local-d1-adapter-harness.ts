// Test-only signed identity; never imported by the app or persisted in browser storage.
import { Miniflare } from "miniflare";
import { readFileSync } from "node:fs";
import { sqliteMigrations } from "./sqlite-migrations";
import { generateKeyPair, exportJWK, SignJWT } from "jose";
import { createServer } from "node:http";
import worker from "@/backend/worker";
import { createProtectedNativeTransport, createNativeRepository } from "@/data/native-repository";

export async function localD1AdapterHarness() {
  const mf = new Miniflare({
    modules: true,
    script: 'export default {fetch(){return new Response("local only")}}',
    compatibilityDate: "2026-08-06",
    d1Databases: ["DB", "RESTORE"],
    r2Buckets: ["BACKUPS"],
  });
  // A setup failure must not leak the workerd process into later tests.
  try {
    return await setup(mf);
  } catch (error) {
    await mf.dispose().catch(() => undefined);
    throw error;
  }
}

async function setup(mf: Miniflare) {
  const db = await mf.getD1Database("DB");
  const restore = await mf.getD1Database("RESTORE");
  const backups = await mf.getR2Bucket("BACKUPS");
  const files = sqliteMigrations;
  async function migrate(binding: typeof db, names = files) {
    for (const name of names) {
      const sql = readFileSync(`db/sqlite/${name}`, "utf8").replace(/^--.*$/gm, "");
      await binding.batch(
        (sql.match(/\s*CREATE TRIGGER[\s\S]*?END;|\s*[^;]+;/g) ?? []).map((s) =>
          binding.prepare(s),
        ),
      );
    }
  }
  await migrate(db);
  await db.exec(
    "INSERT INTO accounts VALUES('owner',1),('s1',1),('s2',1),('m2',1); INSERT INTO memberships VALUES('owner','GLOBAL','SUPER_ADMIN'),('s1','M01','SELLER'),('s2','M01','SELLER'),('m2','M02','MANAGER'); INSERT INTO sessions SELECT id,id,9999999999999,0 FROM accounts; INSERT INTO identity_subjects SELECT 'https://identity.example',id,id FROM accounts;",
  );
  const { publicKey, privateKey } = await generateKeyPair("ES256");
  const jwk = { ...(await exportJWK(publicKey)), kid: "local-key", alg: "ES256" };
  const env = {
    DB: db,
    ENABLE_NATIVE: "OWNER_APPROVED",
    API_HOST: "erp.example",
    ALLOWED_ORIGIN: "https://erp.example",
    IDENTITY_CONFIG: JSON.stringify({
      issuer: "https://identity.example",
      audience: "erp",
      jwks: { keys: [jwk] },
    }),
    RATE_LIMIT: { limit: async () => ({ success: true }) },
  };
  const calls: string[] = [];
  // Executable loopback HTTP bridge, not a fetch response mock. The unchanged
  // Worker handler enforces its HTTPS host/origin boundary; D1 is real workerd.
  const server = createServer(async (incoming, outgoing) => {
    try {
      const chunks: Buffer[] = [];
      for await (const chunk of incoming) chunks.push(Buffer.from(chunk));
      const headers = new Headers();
      for (const [key, value] of Object.entries(incoming.headers))
        if (typeof value === "string" && key !== "host") headers.set(key, value);
      const response = await worker.fetch(
        new Request(`https://erp.example${incoming.url}`, {
          method: incoming.method ?? "POST",
          headers,
          body: Buffer.concat(chunks).toString(),
        }),
        env,
      );
      outgoing.writeHead(response.status, Object.fromEntries(response.headers));
      outgoing.end(Buffer.from(await response.arrayBuffer()));
    } catch {
      outgoing.writeHead(500);
      outgoing.end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("LOCAL_HTTP_UNAVAILABLE");
  const localOrigin = `http://127.0.0.1:${address.port}`;
  let loseNext = false;
  let loseCommand = false;
  async function repository(user: string) {
    const token = await new SignJWT({ sid: user })
      .setProtectedHeader({ alg: "ES256", kid: "local-key" })
      .setSubject(user)
      .setIssuer("https://identity.example")
      .setAudience("erp")
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(privateKey);
    const request: typeof fetch = async (input, init) => {
      calls.push(String(input));
      const headers = new Headers(init?.headers);
      headers.set("Origin", "https://erp.example");
      const response = await fetch(new URL(String(input), localOrigin), { ...init, headers });
      if (
        (loseNext && !String(input).endsWith("/status")) ||
        (loseCommand && String(input).endsWith("/execute"))
      ) {
        loseNext = false;
        loseCommand = false;
        await response.arrayBuffer();
        throw new Error("LOCAL_RESPONSE_LOSS");
      }
      return response;
    };
    const transport = createProtectedNativeTransport("/api/native", async () => token, request);
    return { transport, repository: createNativeRepository(transport) };
  }
  return {
    db,
    restore,
    backups,
    migrate,
    files,
    repository,
    calls,
    loseNextResponse: () => {
      loseNext = true;
    },
    loseNextCommandResponse: () => {
      loseCommand = true;
    },
    dispose: async () => {
      // Drop keep-alive sockets so close() cannot wait on an idle client.
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
      await mf.dispose();
    },
  };
}
