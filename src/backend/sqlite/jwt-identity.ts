import { jwtVerify, createLocalJWKSet, type JSONWebKeySet } from "jose";
import { z } from "zod";
import type { AtomicSqlPort, IdentityVerifier } from "./port";
const configSchema = z
  .object({
    issuer: z
      .string()
      .url()
      .refine((v) => v.startsWith("https://")),
    audience: z.string().min(1),
    jwks: z.object({ keys: z.array(z.record(z.unknown())).min(1) }),
  })
  .strict();
/** Trusted deployment configuration only. Never accepts token jku/x5u or caller JWKS.
 * Public signing keys are owner/provider supplied; no provider chosen or network fetched.
 * Subject maps to a D1 account ID through the injected trusted lookup, not a role claim.
 */
export function createJwtIdentityVerifier(
  config: unknown,
  db: AtomicSqlPort,
  clock: () => number = Date.now,
): IdentityVerifier {
  const parsed = configSchema.safeParse(config);
  if (!parsed.success) return { verify: async () => null };
  const { issuer, audience, jwks } = parsed.data;
  const keys = createLocalJWKSet(jwks as JSONWebKeySet);
  return {
    async verify(token) {
      try {
        if (token.length > 16384) return null;
        const { payload } = await jwtVerify(token, keys, {
          issuer,
          audience,
          algorithms: ["RS256", "ES256"],
          requiredClaims: ["sub", "exp", "iat", "iss", "aud", "sid"],
          currentDate: new Date(clock()),
        });
        if (
          typeof payload.sub !== "string" ||
          !payload.sub ||
          typeof payload["sid"] !== "string" ||
          !payload["sid"] ||
          typeof payload.exp !== "number" ||
          !Number.isSafeInteger(payload.exp) ||
          payload.exp * 1000 <= clock()
        )
          return null;
        const rows = await db.read({
          sql: `SELECT l.user_id FROM identity_subjects l JOIN accounts a ON a.id=l.user_id JOIN sessions s ON s.user_id=a.id WHERE l.issuer=? AND l.subject=? AND a.active=1 AND s.id=? AND s.revoked=0 AND s.expires_at>?`,
          params: [issuer, payload.sub, payload["sid"], clock()],
        });
        const userId = rows[0]?.["user_id"];
        if (rows.length !== 1 || typeof userId !== "string") return null;
        return { userId, sessionId: payload["sid"], expiresAt: payload.exp * 1000 };
      } catch {
        return null;
      }
    },
  };
}
