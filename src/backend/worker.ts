import { createD1Port, type D1Binding } from "./sqlite/d1-port";
import { createJwtIdentityVerifier } from "./sqlite/jwt-identity";
import { createNativeService } from "./sqlite/service";
import { createNativeApiHandler } from "./native-api";
import { createAuthService, type AuthConfig } from "./auth/service";
import { createAuthApiHandler } from "./auth/api";
import { parsePepperConfig } from "./auth/password";
/** One Worker, one origin (mounted by src/server.ts): /api/auth/* (own login) and /api/native/* (ERP API).
 * Bindings come from wrangler.jsonc per environment; secrets via `wrangler secret put` (.dev.vars locally).
 * Nothing works until ENABLE_NATIVE, DB, API_HOST, ALLOWED_ORIGIN, RATE_LIMIT and an identity source
 * (AUTH_SIGNING_JWK, or a legacy external IDENTITY_CONFIG) are all present.
 */
export interface NativeWorkerEnv {
  DB?: D1Binding;
  ENABLE_NATIVE?: string;
  API_HOST?: string;
  /** Dev only: allow plain http, and only when API_HOST is localhost/127.0.0.1. */
  LOCAL_DEV_INSECURE?: string;
  ALLOWED_ORIGIN?: string;
  /** Legacy external identity provider configuration (issuer, audience, public JWKS). */
  IDENTITY_CONFIG?: string;
  /** Secret: private EC P-256 JWK (with kid) used to sign ERP access tokens. */
  AUTH_SIGNING_JWK?: string;
  /** Secret: JSON {pepperId: base64(>=32 bytes)}; AUTH_PEPPER_ID names the current one. */
  AUTH_PEPPERS?: string;
  AUTH_PEPPER_ID?: string;
  /** PBKDF2 iterations for new hashes (default 100000); stored per hash, rehash on login. */
  PBKDF2_ITERATIONS?: string;
  RATE_LIMIT?: { limit(input: { key: string }): Promise<{ success: boolean }> };
}
export const AUTH_AUDIENCE = "phonehouse-erp";
const unavailable = (code: string, status = 503) =>
  new Response(JSON.stringify({ error: code, requestId: crypto.randomUUID() }), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
/** Own-login configuration, or null when any secret is missing/invalid (fail closed). */
export function authConfigFromEnv(env: NativeWorkerEnv): AuthConfig | null {
  if (!env.AUTH_SIGNING_JWK || !env.API_HOST) return null;
  const pepper = parsePepperConfig(env.AUTH_PEPPERS, env.AUTH_PEPPER_ID, env.PBKDF2_ITERATIONS);
  if (!pepper) return null;
  try {
    const jwk = JSON.parse(env.AUTH_SIGNING_JWK) as AuthConfig["signingJwk"];
    if (jwk.kty !== "EC" || jwk.crv !== "P-256" || !jwk.d || !jwk.kid) return null;
    return { issuer: `https://${env.API_HOST}`, audience: AUTH_AUDIENCE, signingJwk: jwk, pepper };
  } catch {
    return null;
  }
}
function identityConfig(env: NativeWorkerEnv, auth: AuthConfig | null): unknown {
  if (auth) {
    const { d: _private, ...publicJwk } = auth.signingJwk;
    return {
      issuer: auth.issuer,
      audience: auth.audience,
      jwks: { keys: [{ ...publicJwk, alg: "ES256", use: "sig" }] },
    };
  }
  try {
    return env.IDENTITY_CONFIG ? JSON.parse(env.IDENTITY_CONFIG) : null;
  } catch {
    return null;
  }
}
/** Consume (and discard, capped at 1 MiB) any unread request body before the response is sent.
 * Early returns (status, rejections, rate limit) otherwise leave the stream unread, and the runtime
 * later fails with "Can't read from request stream after response has been sent" (seen under wrangler dev). */
export async function drainRequestBody(request: Request) {
  if (!request.body || request.bodyUsed) return;
  const reader = request.body.getReader();
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return;
      total += value.byteLength;
      if (total > 1_048_576) {
        await reader.cancel();
        return;
      }
    }
  } catch {
    /* client went away: nothing to drain */
  }
}
export default {
  async fetch(request: Request, env: NativeWorkerEnv): Promise<Response> {
    const response = await route(request, env);
    await drainRequestBody(request);
    return response;
  },
};
async function route(request: Request, env: NativeWorkerEnv): Promise<Response> {
  {
    const url = new URL(request.url);
    const auth = authConfigFromEnv(env);
    if (
      env.ENABLE_NATIVE !== "OWNER_APPROVED" ||
      !env.DB ||
      !env.API_HOST ||
      !env.ALLOWED_ORIGIN ||
      !(auth || env.IDENTITY_CONFIG) ||
      !env.RATE_LIMIT
    )
      return unavailable("NOT_CONFIGURED");
    const localHttp =
      env.LOCAL_DEV_INSECURE === "1" &&
      /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(env.API_HOST) &&
      url.protocol === "http:";
    if ((url.protocol !== "https:" && !localHttp) || url.host !== env.API_HOST)
      return unavailable("HOST_REJECTED", 403);
    if (request.headers.get("Origin") !== env.ALLOWED_ORIGIN)
      return unavailable("ORIGIN_REJECTED", 403);
    // A missing/failed binding denies, never silently substitutes a process-local limiter.
    try {
      if (
        !(
          await env.RATE_LIMIT.limit({
            key: `${url.host}:${request.headers.get("CF-Connecting-IP") ?? "unknown"}`,
          })
        ).success
      )
        return unavailable("RATE_LIMITED", 429);
    } catch {
      return unavailable("RATE_LIMIT_UNAVAILABLE");
    }
    const db = createD1Port(env.DB);
    if (url.pathname === "/api/auth" || url.pathname.startsWith("/api/auth/")) {
      if (!auth) return unavailable("NOT_CONFIGURED");
      try {
        return await createAuthApiHandler(createAuthService(db, auth), {
          secureCookie: !localHttp,
        })(request);
      } catch {
        return unavailable("NOT_CONFIGURED");
      }
    }
    const config = identityConfig(env, auth);
    if (!config) return unavailable("NOT_CONFIGURED");
    const verifier = createJwtIdentityVerifier(config, db);
    // Private R2 stays locked until object classification/retention/access policy approval.
    const service = createNativeService(db, verifier, {
      get: async () => {
        throw new Error("FORBIDDEN");
      },
      put: async () => {
        throw new Error("FORBIDDEN");
      },
    });
    try {
      return await createNativeApiHandler(service, {
        enabled: true,
        allowedOrigin: env.ALLOWED_ORIGIN,
      })(request);
    } catch {
      return unavailable("NOT_CONFIGURED");
    }
  }
}
