// /api/auth/* — standard Request/Response. Same-origin, host and rate-limit gates run in worker.ts first.
import { AuthError, type AuthCode, type AuthService } from "./service";

const status: Record<AuthCode | "BAD_REQUEST" | "NOT_FOUND" | "INTERNAL", number> = {
  INVALID_CREDENTIALS: 401,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  VALIDATION: 400,
  PASSWORD_POLICY: 400,
  PIN_POLICY: 400,
  INVALID_PIN: 401,
  PIN_LOCKED: 423,
  PASSWORD_CHANGE_REQUIRED: 403,
  EMAIL_TAKEN: 409,
  BAD_REQUEST: 400,
  NOT_FOUND: 404,
  INTERNAL: 500,
};
export interface AuthApiConfig {
  /** false only for plain-http localhost dev; production cookies are __Host- + Secure. */
  secureCookie: boolean;
  sessionTtlSeconds?: number;
}
export function refreshCookieName(secure: boolean) {
  return secure ? "__Host-ph_session" : "ph_session";
}
function readCookie(request: Request, name: string) {
  for (const part of (request.headers.get("Cookie") ?? "").split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=") || null;
  }
  return null;
}
export function createAuthApiHandler(service: AuthService, config: AuthApiConfig) {
  const name = refreshCookieName(config.secureCookie);
  const ttl = config.sessionTtlSeconds ?? 12 * 60 * 60;
  const cookie = (value: string, maxAge: number) =>
    `${name}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${config.secureCookie ? "; Secure" : ""}`;
  const json = (body: unknown, code = 200, setCookie?: string) => {
    const headers = new Headers({
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    if (setCookie) headers.append("Set-Cookie", setCookie);
    return new Response(JSON.stringify(body), { status: code, headers });
  };
  const fail = (code: keyof typeof status, detail?: string) =>
    json(
      { error: code, ...(detail ? { detail } : {}), requestId: crypto.randomUUID() },
      status[code],
    );

  return async function handle(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const route = url.pathname.replace(/^\/api\/auth\/?/, "");
    if (request.method !== "POST") return fail("BAD_REQUEST");
    let body: unknown = {};
    try {
      const text = await request.text();
      if (text.length > 8192) return fail("BAD_REQUEST");
      body = text ? JSON.parse(text) : {};
    } catch {
      return fail("BAD_REQUEST");
    }
    const bearer =
      request.headers.get("Authorization")?.match(/^Bearer ([A-Za-z0-9._-]+)$/)?.[1] ?? "";
    const refresh = readCookie(request, name);
    const ip = request.headers.get("CF-Connecting-IP");
    try {
      switch (route) {
        case "login": {
          const r = await service.login(body, ip);
          const { refreshSecret, ...rest } = r;
          return json(rest, 200, cookie(refreshSecret, ttl));
        }
        case "refresh":
          return json(await service.refresh(refresh));
        case "logout":
          return json(await service.logout(refresh), 200, cookie("", 0));
        case "password":
          return json(await service.changePassword(bearer, body));
        case "sellers":
          return json(await service.sellers(bearer, refresh, body));
        case "pin/switch":
          return json(await service.pinSwitch(bearer, refresh, body, ip));
        case "pin/clear":
          return json(await service.pinClear(bearer, refresh));
        case "pin/set":
          return json(await service.pinSet(bearer, body));
        case "admin/accounts":
          return json(await service.adminCreate(bearer, body));
        case "admin/reset":
          return json(await service.adminReset(bearer, body));
        case "alerts":
          return json(await service.alerts(bearer));
        case "alerts/ack":
          return json(await service.ackAlert(bearer, body));
        default:
          return fail("NOT_FOUND");
      }
    } catch (e) {
      if (e instanceof AuthError) return fail(e.code, e.detail);
      return fail("INTERNAL");
    }
  };
}
