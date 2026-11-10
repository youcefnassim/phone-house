import type { UserBoundPostgresPort } from "@/backend/command-gateway.server";
import { GatewayError, classifySqlError } from "@/backend/command-gateway.server";
export interface AuthorizedBackendConfiguration {
  url: string;
  publishableKey: string;
  ownerAuthorized: true;
}
// No environment reads, configured instance, or calls at module evaluation.
export function createUserTransport(
  config: AuthorizedBackendConfiguration,
  bearer: string,
  fetcher: typeof fetch = fetch,
): UserBoundPostgresPort {
  const url = new URL(config.url);
  if (
    config.ownerAuthorized !== true ||
    (url.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(url.hostname))
  )
    throw new GatewayError("BACKEND_UNAVAILABLE");
  if (!bearer || config.publishableKey.startsWith("sb_secret_"))
    throw new GatewayError("AUTHORIZATION");
  const headers = {
    apikey: config.publishableKey,
    Authorization: `Bearer ${bearer}`,
    "Content-Type": "application/json",
  };
  async function call(path: string, body?: unknown) {
    try {
      return await fetcher(new URL(path, url), {
        method: body === undefined ? "GET" : "POST",
        headers,
        cache: "no-store",
        redirect: "error",
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch {
      throw new GatewayError("BACKEND_UNAVAILABLE");
    }
  }
  return {
    async getVerifiedUser() {
      const result = await call("/auth/v1/user");
      if (result.status === 401 || result.status === 403) return null;
      if (!result.ok) throw new GatewayError("BACKEND_UNAVAILABLE");
      let user: unknown;
      try {
        user = await result.json();
      } catch {
        throw new GatewayError("BACKEND_ERROR");
      }
      return user && typeof user === "object" && "id" in user && typeof user.id === "string"
        ? { id: user.id }
        : null;
    },
    async rpc(name, args) {
      if (!/^[a-z_]+$/.test(name)) throw new GatewayError("VALIDATION");
      const response = await call(`/rest/v1/rpc/${name}`, args);
      let body: unknown;
      try {
        body = await response.json();
      } catch {
        throw new GatewayError("BACKEND_ERROR");
      }
      if (!response.ok) {
        const code =
          body && typeof body === "object" && "code" in body && typeof body.code === "string"
            ? body.code
            : undefined;
        if (!code)
          throw new GatewayError(
            response.status === 401 || response.status === 403
              ? "AUTHORIZATION"
              : response.status >= 500
                ? "BACKEND_UNAVAILABLE"
                : classifySqlError(code),
          );
        return { data: null, error: { code } };
      }
      return { data: body, error: null };
    },
  };
}
