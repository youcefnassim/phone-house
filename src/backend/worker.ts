import { createD1Port, type D1Binding } from "./sqlite/d1-port";
import { createJwtIdentityVerifier } from "./sqlite/jwt-identity";
import { createNativeService } from "./sqlite/service";
import { createNativeApiHandler } from "./native-api";
/** Standalone service source only; never imported by the Lovable application.
 * No account, binding, origin, provider, credentials or deployment is configured.
 */
export interface NativeWorkerEnv {
  DB?: D1Binding;
  ENABLE_NATIVE?: string;
  API_HOST?: string;
  ALLOWED_ORIGIN?: string;
  IDENTITY_CONFIG?: string;
  RATE_LIMIT?: { limit(input: { key: string }): Promise<{ success: boolean }> };
}
const unavailable = (code: string, status = 503) =>
  new Response(JSON.stringify({ error: code, requestId: crypto.randomUUID() }), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
export default {
  async fetch(request: Request, env: NativeWorkerEnv): Promise<Response> {
    const url = new URL(request.url);
    if (
      env.ENABLE_NATIVE !== "OWNER_APPROVED" ||
      !env.DB ||
      !env.API_HOST ||
      !env.ALLOWED_ORIGIN ||
      !env.IDENTITY_CONFIG ||
      !env.RATE_LIMIT
    )
      return unavailable("NOT_CONFIGURED");
    if (url.protocol !== "https:" || url.host !== env.API_HOST)
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
    let config: unknown;
    try {
      config = JSON.parse(env.IDENTITY_CONFIG);
    } catch {
      return unavailable("NOT_CONFIGURED");
    }
    const db = createD1Port(env.DB),
      verifier = createJwtIdentityVerifier(config, db);
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
  },
};
