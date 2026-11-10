// Own login for the ERP (Phase 2.2). Email + password in D1, ES256 access tokens signed by the Worker,
// renewed through a D1 device session (HttpOnly refresh cookie). Per-seller PIN switch on a shared till.
// Every failure the caller can observe is generic (INVALID_CREDENTIALS / UNAUTHORIZED) except where the
// caller is already authenticated on the device (PIN errors, policy errors).
import { SignJWT, importJWK, jwtVerify, createLocalJWKSet, type JWK } from "jose";
import { z } from "zod";
import type { AtomicSqlPort, SqlStatement } from "../sqlite/port";
import {
  hashSecret,
  passwordProblem,
  pinProblem,
  verifySecret,
  toBase64,
  type PepperConfig,
  type StoredHash,
} from "./password";

export type AuthCode =
  | "INVALID_CREDENTIALS"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "VALIDATION"
  | "PASSWORD_POLICY"
  | "PIN_POLICY"
  | "INVALID_PIN"
  | "PIN_LOCKED"
  | "PASSWORD_CHANGE_REQUIRED"
  | "EMAIL_TAKEN";
export class AuthError extends Error {
  constructor(
    readonly code: AuthCode,
    readonly detail?: string,
  ) {
    super(code);
  }
}
export interface AuthConfig {
  issuer: string;
  audience: string;
  /** Private EC P-256 JWK with kid (Worker secret AUTH_SIGNING_JWK). */
  signingJwk: JWK & { kid: string };
  pepper: PepperConfig;
  clock?: () => number;
  sessionTtlMs?: number;
  accessTtlSeconds?: number;
  lockoutMs?: number;
}
export const MAX_FAILURES = 5;
const email = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
const deviceId = z.string().regex(/^[A-Za-z0-9-]{8,80}$/);
const store = z.enum(["M01", "M02"]);
const userId = z.string().regex(/^[A-Za-z0-9-]{1,80}$/);
const loginInput = z.object({ email, password: z.string().max(1024), deviceId }).strict();
const changeInput = z
  .object({ currentPassword: z.string().max(1024), newPassword: z.string().max(1024) })
  .strict();
const createInput = z
  .object({
    email,
    displayName: z.string().trim().min(1).max(120),
    role: z.enum(["MANAGER", "SELLER"]),
    store,
    temporaryPassword: z.string().max(1024),
    pin: z.string().optional(),
  })
  .strict();
const resetInput = z.object({ userId, temporaryPassword: z.string().max(1024) }).strict();
const pinSetInput = z.object({ userId, pin: z.string().max(16) }).strict();
const pinSwitchInput = z.object({ store, sellerId: userId, pin: z.string().max(16) }).strict();
const sellersInput = z.object({ store }).strict();
const ackInput = z.object({ id: userId }).strict();

const hex = (bytes: ArrayBuffer) =>
  Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("");
const sha256 = async (value: string) =>
  hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
const randomSecret = () =>
  toBase64(crypto.getRandomValues(new Uint8Array(32)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
const stored = (r: Record<string, unknown> | undefined): StoredHash | null =>
  r
    ? {
        algorithm: String(r["algorithm"]),
        iterations: Number(r["iterations"]),
        salt: String(r["salt"]),
        hash: String(r["hash"]),
        pepperId: String(r["pepper_id"]),
      }
    : null;

export interface AuthenticatedSession {
  userId: string;
  sessionId: string;
  mustChange: boolean;
  child: boolean;
}

export function createAuthService(db: AtomicSqlPort, config: AuthConfig) {
  const clock = config.clock ?? Date.now;
  const sessionTtl = config.sessionTtlMs ?? 12 * 60 * 60 * 1000;
  const accessTtl = config.accessTtlSeconds ?? 15 * 60;
  const lockoutMs = config.lockoutMs ?? 15 * 60 * 1000;
  const { d: _private, ...publicJwk } = config.signingJwk;
  const verifyKeys = createLocalJWKSet({ keys: [{ ...publicJwk, alg: "ES256", use: "sig" }] });
  let signingKey: Awaited<ReturnType<typeof importJWK>> | null = null;
  const event = (
    kind: string,
    user: string | null,
    extra: { actor?: string | null; device?: string | null; ip?: string | null } = {},
  ): SqlStatement => ({
    sql: "INSERT INTO auth_events VALUES(?,?,?,?,?,?,?)",
    params: [
      crypto.randomUUID(),
      user,
      kind,
      extra.actor ?? null,
      extra.device ?? null,
      extra.ip ?? null,
      clock(),
    ],
  });

  async function sign(user: string, session: string) {
    signingKey ??= await importJWK({ ...config.signingJwk, alg: "ES256" }, "ES256");
    const now = Math.floor(clock() / 1000);
    const expiresAt = (now + accessTtl) * 1000;
    const accessToken = await new SignJWT({ sid: session })
      .setProtectedHeader({ alg: "ES256", kid: config.signingJwk.kid, typ: "JWT" })
      .setIssuer(config.issuer)
      .setAudience(config.audience)
      .setSubject(user)
      .setIssuedAt(now)
      .setExpirationTime(now + accessTtl)
      .sign(signingKey);
    return { accessToken, expiresAt };
  }

  /** Verifies an access token against D1 (session alive, account active, parent alive). */
  async function authenticate(token: string): Promise<AuthenticatedSession> {
    try {
      if (token.length > 16384) throw new Error();
      const { payload } = await jwtVerify(token, verifyKeys, {
        issuer: config.issuer,
        audience: config.audience,
        algorithms: ["ES256"],
        requiredClaims: ["sub", "sid", "exp", "iat"],
        currentDate: new Date(clock()),
      });
      const rows = await db.read({
        sql: `SELECT s.user_id,s.id,COALESCE(c.must_change,0) must_change,EXISTS(SELECT 1 FROM session_parents WHERE session_id=s.id) child FROM sessions s JOIN accounts a ON a.id=s.user_id LEFT JOIN account_credentials c ON c.user_id=s.user_id WHERE s.id=? AND s.user_id=? AND s.revoked=0 AND s.expires_at>? AND a.active=1 AND NOT EXISTS(SELECT 1 FROM session_parents p JOIN sessions ps ON ps.id=p.parent_session_id WHERE p.session_id=s.id AND (ps.revoked=1 OR ps.expires_at<=?))`,
        params: [String(payload["sid"]), String(payload.sub), clock(), clock()],
      });
      const r = rows[0];
      if (!r) throw new Error();
      return {
        userId: String(r["user_id"]),
        sessionId: String(r["id"]),
        mustChange: Number(r["must_change"]) === 1,
        child: Number(r["child"]) === 1,
      };
    } catch {
      throw new AuthError("UNAUTHORIZED");
    }
  }
  async function requireOwner(token: string) {
    const s = await authenticate(token);
    if (s.mustChange || s.child) throw new AuthError("FORBIDDEN");
    const rows = await db.read({
      sql: "SELECT 1 FROM memberships WHERE user_id=? AND role='SUPER_ADMIN' AND store_id='GLOBAL'",
      params: [s.userId],
    });
    if (!rows.length) throw new AuthError("FORBIDDEN");
    return s;
  }
  /** Device session = the refresh cookie's session; the bearer must belong to that same session. */
  async function deviceSession(token: string, refreshSecret: string | null) {
    const s = await authenticate(token);
    if (s.child || s.mustChange || !refreshSecret) throw new AuthError("UNAUTHORIZED");
    const rows = await db.read({
      sql: "SELECT session_id FROM session_secrets WHERE refresh_hash=?",
      params: [await sha256(refreshSecret)],
    });
    if (rows[0]?.["session_id"] !== s.sessionId) throw new AuthError("UNAUTHORIZED");
    return s;
  }
  const profile = async (user: string) => {
    const rows = await db.read({
      sql: "SELECT c.display_name,c.must_change,(SELECT json_group_array(json_object('store',store_id,'role',role)) FROM memberships WHERE user_id=c.user_id) roles FROM account_credentials c WHERE c.user_id=?",
      params: [user],
    });
    const r = rows[0] ?? {};
    return {
      id: user,
      displayName: String(r["display_name"] ?? ""),
      mustChange: Number(r["must_change"]) === 1,
      roles: JSON.parse(String(r["roles"] ?? "[]")) as { store: string; role: string }[],
    };
  };
  const policy = (password: string, mail: string) => {
    const problem = passwordProblem(password, mail);
    if (problem) throw new AuthError("PASSWORD_POLICY", problem);
  };

  return {
    authenticate,

    async login(input: unknown, ip: string | null) {
      const parsed = loginInput.safeParse(input);
      if (!parsed.success) throw new AuthError("INVALID_CREDENTIALS");
      const v = parsed.data;
      const now = clock();
      const row = (
        await db.read({
          sql: "SELECT c.*,a.active FROM account_credentials c JOIN accounts a ON a.id=c.user_id WHERE c.email=?",
          params: [v.email],
        })
      )[0];
      const locked = !!row && Number(row["locked_until"] ?? 0) > now;
      // Always one full derivation, even for unknown / inactive / locked accounts (timing).
      const result = await verifySecret(v.password, locked ? null : stored(row), config.pepper);
      if (!row || Number(row["active"]) !== 1 || locked || !result.ok) {
        const user = row ? String(row["user_id"]) : null;
        const writes: SqlStatement[] = [];
        if (row && !locked && Number(row["active"]) === 1) {
          writes.push({
            sql: "UPDATE account_credentials SET failed_count=CASE WHEN failed_count+1>=? THEN 0 ELSE failed_count+1 END,locked_until=CASE WHEN failed_count+1>=? THEN ? ELSE locked_until END,updated_at=? WHERE user_id=?",
            params: [MAX_FAILURES, MAX_FAILURES, now + lockoutMs, now, user],
          });
          writes.push({
            ...event("LOGIN_FAIL", user, { device: v.deviceId, ip }),
          });
          writes.push({
            sql: "INSERT INTO auth_events SELECT ?,?,'LOCKOUT',NULL,?,?,? WHERE EXISTS(SELECT 1 FROM account_credentials WHERE user_id=? AND locked_until=?)",
            params: [crypto.randomUUID(), user, v.deviceId, ip, now, user, now + lockoutMs],
          });
        } else
          writes.push(
            event(locked ? "LOGIN_LOCKED" : "LOGIN_FAIL", user, { device: v.deviceId, ip }),
          );
        await db.batch(writes);
        throw new AuthError("INVALID_CREDENTIALS");
      }
      const user = String(row["user_id"]);
      const session = crypto.randomUUID(),
        refresh = randomSecret(),
        sessionExpiresAt = now + sessionTtl;
      const writes: SqlStatement[] = [
        {
          sql: "UPDATE account_credentials SET failed_count=0,locked_until=NULL,updated_at=? WHERE user_id=?",
          params: [now, user],
        },
        {
          sql: "INSERT INTO owner_alerts SELECT ?,'NEW_DEVICE',?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM known_devices WHERE user_id=? AND device_id=?)",
          params: [crypto.randomUUID(), user, v.deviceId, ip, now, user, v.deviceId],
        },
        {
          sql: "INSERT INTO auth_events SELECT ?,?,'NEW_DEVICE',NULL,?,?,? WHERE NOT EXISTS(SELECT 1 FROM known_devices WHERE user_id=? AND device_id=?)",
          params: [crypto.randomUUID(), user, v.deviceId, ip, now, user, v.deviceId],
        },
        {
          sql: "INSERT OR IGNORE INTO known_devices VALUES(?,?,?)",
          params: [user, v.deviceId, now],
        },
        { sql: "INSERT INTO sessions VALUES(?,?,?,0)", params: [session, user, sessionExpiresAt] },
        {
          sql: "INSERT INTO session_secrets VALUES(?,?,?,?)",
          params: [session, await sha256(refresh), v.deviceId, now],
        },
        event("LOGIN_OK", user, { device: v.deviceId, ip }),
      ];
      if (result.needsRehash) {
        const h = await hashSecret(v.password, config.pepper);
        writes.push({
          sql: "UPDATE account_credentials SET algorithm=?,iterations=?,salt=?,hash=?,pepper_id=? WHERE user_id=?",
          params: [h.algorithm, h.iterations, h.salt, h.hash, h.pepperId, user],
        });
      }
      await db.batch(writes);
      return {
        ...(await sign(user, session)),
        refreshSecret: refresh,
        sessionExpiresAt,
        user: await profile(user),
      };
    },

    /** New access token from the refresh cookie: the active seller's if one is switched in. */
    async refresh(refreshSecret: string | null) {
      if (!refreshSecret) throw new AuthError("UNAUTHORIZED");
      const now = clock();
      const device = (
        await db.read({
          sql: "SELECT s.id,s.user_id,s.expires_at FROM session_secrets x JOIN sessions s ON s.id=x.session_id JOIN accounts a ON a.id=s.user_id WHERE x.refresh_hash=? AND s.revoked=0 AND s.expires_at>? AND a.active=1",
          params: [await sha256(refreshSecret), now],
        })
      )[0];
      if (!device) throw new AuthError("UNAUTHORIZED");
      const seller = (
        await db.read({
          sql: "SELECT s.id,s.user_id FROM device_active_seller d JOIN sessions s ON s.id=d.seller_session_id JOIN accounts a ON a.id=s.user_id WHERE d.device_session_id=? AND s.revoked=0 AND s.expires_at>? AND a.active=1",
          params: [String(device["id"]), now],
        })
      )[0];
      const deviceUser = String(device["user_id"]);
      const token = seller
        ? await sign(String(seller["user_id"]), String(seller["id"]))
        : await sign(deviceUser, String(device["id"]));
      return {
        ...token,
        user: await profile(deviceUser),
        activeSeller: seller ? await profile(String(seller["user_id"])) : null,
      };
    },

    async logout(refreshSecret: string | null) {
      if (!refreshSecret) return { ok: true as const };
      const rows = await db.read({
        sql: "SELECT x.session_id,s.user_id FROM session_secrets x JOIN sessions s ON s.id=x.session_id WHERE x.refresh_hash=?",
        params: [await sha256(refreshSecret)],
      });
      const r = rows[0];
      if (r)
        await db.batch([
          {
            sql: "UPDATE sessions SET revoked=1 WHERE id=? OR id IN(SELECT session_id FROM session_parents WHERE parent_session_id=?)",
            params: [String(r["session_id"]), String(r["session_id"])],
          },
          event("LOGOUT", String(r["user_id"])),
        ]);
      return { ok: true as const };
    },

    async changePassword(token: string, input: unknown) {
      const s = await authenticate(token);
      if (s.child) throw new AuthError("FORBIDDEN");
      const v = changeInput.safeParse(input);
      if (!v.success) throw new AuthError("VALIDATION");
      const row = (
        await db.read({
          sql: "SELECT * FROM account_credentials WHERE user_id=?",
          params: [s.userId],
        })
      )[0];
      const check = await verifySecret(v.data.currentPassword, stored(row), config.pepper);
      if (!row || !check.ok) throw new AuthError("INVALID_CREDENTIALS");
      policy(v.data.newPassword, String(row["email"]));
      if (v.data.newPassword === v.data.currentPassword)
        throw new AuthError("PASSWORD_POLICY", "SAME_AS_CURRENT");
      const h = await hashSecret(v.data.newPassword, config.pepper);
      await db.batch([
        {
          sql: "UPDATE account_credentials SET algorithm=?,iterations=?,salt=?,hash=?,pepper_id=?,must_change=0,failed_count=0,locked_until=NULL,updated_at=? WHERE user_id=?",
          params: [h.algorithm, h.iterations, h.salt, h.hash, h.pepperId, clock(), s.userId],
        },
        // Every other session of this account ends; the current one stays.
        {
          sql: "UPDATE sessions SET revoked=1 WHERE user_id=? AND id<>?",
          params: [s.userId, s.sessionId],
        },
        event("PASSWORD_CHANGED", s.userId, { actor: s.userId }),
      ]);
      return { ok: true as const, user: await profile(s.userId) };
    },

    async adminCreate(token: string, input: unknown) {
      const owner = await requireOwner(token);
      const v = createInput.safeParse(input);
      if (!v.success) throw new AuthError("VALIDATION");
      policy(v.data.temporaryPassword, v.data.email);
      if (v.data.pin !== undefined && pinProblem(v.data.pin)) throw new AuthError("PIN_POLICY");
      const taken = await db.read({
        sql: "SELECT 1 FROM account_credentials WHERE email=?",
        params: [v.data.email],
      });
      if (taken.length) throw new AuthError("EMAIL_TAKEN");
      const id = crypto.randomUUID(),
        now = clock();
      const h = await hashSecret(v.data.temporaryPassword, config.pepper);
      const writes: SqlStatement[] = [
        { sql: "INSERT INTO accounts VALUES(?,1)", params: [id] },
        { sql: "INSERT INTO memberships VALUES(?,?,?)", params: [id, v.data.store, v.data.role] },
        { sql: "INSERT INTO identity_subjects VALUES(?,?,?)", params: [config.issuer, id, id] },
        {
          sql: "INSERT INTO account_credentials VALUES(?,?,?,?,?,?,?,?,1,0,NULL,?)",
          params: [
            id,
            v.data.email,
            v.data.displayName,
            h.algorithm,
            h.iterations,
            h.salt,
            h.hash,
            h.pepperId,
            now,
          ],
        },
        event("ACCOUNT_CREATED", id, { actor: owner.userId }),
      ];
      if (v.data.pin !== undefined) {
        const p = await hashSecret(v.data.pin, config.pepper);
        writes.push(
          {
            sql: "INSERT INTO seller_pins VALUES(?,?,?,?,?,?,0,0,?)",
            params: [id, p.algorithm, p.iterations, p.salt, p.hash, p.pepperId, now],
          },
          event("PIN_SET", id, { actor: owner.userId }),
        );
      }
      await db.batch(writes);
      return { userId: id, mustChange: true as const };
    },

    async adminReset(token: string, input: unknown) {
      const owner = await requireOwner(token);
      const v = resetInput.safeParse(input);
      if (!v.success) throw new AuthError("VALIDATION");
      const row = (
        await db.read({
          sql: "SELECT c.email FROM account_credentials c WHERE c.user_id=? AND NOT EXISTS(SELECT 1 FROM memberships WHERE user_id=c.user_id AND role='SUPER_ADMIN')",
          params: [v.data.userId],
        })
      )[0];
      if (!row || v.data.userId === owner.userId) throw new AuthError("FORBIDDEN");
      policy(v.data.temporaryPassword, String(row["email"]));
      const h = await hashSecret(v.data.temporaryPassword, config.pepper);
      await db.batch([
        {
          sql: "UPDATE account_credentials SET algorithm=?,iterations=?,salt=?,hash=?,pepper_id=?,must_change=1,failed_count=0,locked_until=NULL,updated_at=? WHERE user_id=?",
          params: [h.algorithm, h.iterations, h.salt, h.hash, h.pepperId, clock(), v.data.userId],
        },
        { sql: "UPDATE sessions SET revoked=1 WHERE user_id=?", params: [v.data.userId] },
        event("PASSWORD_RESET", v.data.userId, { actor: owner.userId }),
      ]);
      return { ok: true as const, mustChange: true as const };
    },

    /** Owner sets/resets any staff PIN (clears the lock); a user may set their own PIN. */
    async pinSet(token: string, input: unknown) {
      const s = await authenticate(token);
      if (s.mustChange || s.child) throw new AuthError("FORBIDDEN");
      const v = pinSetInput.safeParse(input);
      if (!v.success) throw new AuthError("VALIDATION");
      if (v.data.userId !== s.userId) await requireOwner(token);
      if (pinProblem(v.data.pin)) throw new AuthError("PIN_POLICY");
      const p = await hashSecret(v.data.pin, config.pepper);
      await db.batch([
        {
          sql: "INSERT INTO seller_pins VALUES(?,?,?,?,?,?,0,0,?) ON CONFLICT(user_id) DO UPDATE SET algorithm=excluded.algorithm,iterations=excluded.iterations,salt=excluded.salt,hash=excluded.hash,pepper_id=excluded.pepper_id,failed_count=0,locked=0,updated_at=excluded.updated_at",
          params: [v.data.userId, p.algorithm, p.iterations, p.salt, p.hash, p.pepperId, clock()],
        },
        event("PIN_SET", v.data.userId, { actor: s.userId }),
      ]);
      return { ok: true as const };
    },

    /** Sellers that can be switched in on this device for this store. */
    async sellers(token: string, refreshSecret: string | null, input: unknown) {
      const s = await deviceSession(token, refreshSecret);
      const v = sellersInput.safeParse(input);
      if (!v.success) throw new AuthError("VALIDATION");
      const allowed = await db.read({
        sql: "SELECT 1 FROM memberships WHERE user_id=? AND ((role='SUPER_ADMIN' AND store_id='GLOBAL') OR store_id=?)",
        params: [s.userId, v.data.store],
      });
      if (!allowed.length) throw new AuthError("FORBIDDEN");
      const rows = await db.read({
        sql: "SELECT c.user_id id,c.display_name,c.must_change,p.user_id IS NOT NULL pin_set,COALESCE(p.locked,0) locked FROM memberships m JOIN accounts a ON a.id=m.user_id AND a.active=1 JOIN account_credentials c ON c.user_id=m.user_id LEFT JOIN seller_pins p ON p.user_id=m.user_id WHERE m.store_id=? AND m.role IN('SELLER','MANAGER') ORDER BY c.display_name",
        params: [v.data.store],
      });
      return rows.map((r) => ({
        id: String(r["id"]),
        displayName: String(r["display_name"]),
        pinSet: Number(r["pin_set"]) === 1,
        locked: Number(r["locked"]) === 1,
        mustChange: Number(r["must_change"]) === 1,
      }));
    },

    /** PIN switch: only inside an authenticated device session of that store, never a remote login. */
    async pinSwitch(
      token: string,
      refreshSecret: string | null,
      input: unknown,
      ip: string | null,
    ) {
      const device = await deviceSession(token, refreshSecret);
      const v = pinSwitchInput.safeParse(input);
      if (!v.success) throw new AuthError("VALIDATION");
      const now = clock();
      const row = (
        await db.read({
          sql: "SELECT p.*,ps.expires_at parent_expires FROM seller_pins p JOIN memberships m ON m.user_id=p.user_id AND m.store_id=? AND m.role IN('SELLER','MANAGER') JOIN accounts a ON a.id=p.user_id AND a.active=1 JOIN sessions ps ON ps.id=? WHERE p.user_id=? AND EXISTS(SELECT 1 FROM memberships d WHERE d.user_id=? AND ((d.role='SUPER_ADMIN' AND d.store_id='GLOBAL') OR d.store_id=?))",
          params: [v.data.store, device.sessionId, v.data.sellerId, device.userId, v.data.store],
        })
      )[0];
      if (!row) throw new AuthError("FORBIDDEN");
      const pending = await db.read({
        sql: "SELECT 1 FROM account_credentials WHERE user_id=? AND must_change=1",
        params: [v.data.sellerId],
      });
      // The owner-issued temporary password must be replaced once before the PIN can be used.
      if (pending.length) throw new AuthError("PASSWORD_CHANGE_REQUIRED");
      if (Number(row["locked"]) === 1) {
        await db.batch([event("PIN_LOCKED", v.data.sellerId, { actor: device.userId, ip })]);
        throw new AuthError("PIN_LOCKED");
      }
      const check = await verifySecret(v.data.pin, stored(row), config.pepper);
      if (!check.ok) {
        await db.batch([
          {
            sql: "UPDATE seller_pins SET failed_count=CASE WHEN failed_count+1>=? THEN 5 ELSE failed_count+1 END,locked=CASE WHEN failed_count+1>=? THEN 1 ELSE 0 END,updated_at=? WHERE user_id=?",
            params: [MAX_FAILURES, MAX_FAILURES, now, v.data.sellerId],
          },
          event("PIN_FAIL", v.data.sellerId, { actor: device.userId, ip }),
          {
            sql: "INSERT INTO auth_events SELECT ?,?,'PIN_LOCKED',?,NULL,?,? WHERE EXISTS(SELECT 1 FROM seller_pins WHERE user_id=? AND locked=1)",
            params: [crypto.randomUUID(), v.data.sellerId, device.userId, ip, now, v.data.sellerId],
          },
        ]);
        const locked = await db.read({
          sql: "SELECT locked FROM seller_pins WHERE user_id=?",
          params: [v.data.sellerId],
        });
        throw new AuthError(Number(locked[0]?.["locked"]) === 1 ? "PIN_LOCKED" : "INVALID_PIN");
      }
      const child = crypto.randomUUID();
      await db.batch([
        {
          sql: "UPDATE seller_pins SET failed_count=0,updated_at=? WHERE user_id=?",
          params: [now, v.data.sellerId],
        },
        // Previous seller session on this device ends.
        {
          sql: "UPDATE sessions SET revoked=1 WHERE id IN(SELECT seller_session_id FROM device_active_seller WHERE device_session_id=?)",
          params: [device.sessionId],
        },
        {
          sql: "INSERT INTO sessions VALUES(?,?,?,0)",
          params: [child, v.data.sellerId, Number(row["parent_expires"])],
        },
        {
          sql: "INSERT INTO session_parents VALUES(?,?,?)",
          params: [child, device.sessionId, v.data.store],
        },
        {
          sql: "INSERT INTO device_active_seller VALUES(?,?,?) ON CONFLICT(device_session_id) DO UPDATE SET seller_session_id=excluded.seller_session_id,at=excluded.at",
          params: [device.sessionId, child, now],
        },
        event("PIN_OK", v.data.sellerId, { actor: device.userId, ip }),
      ]);
      return {
        ...(await sign(v.data.sellerId, child)),
        activeSeller: await profile(v.data.sellerId),
      };
    },

    /** "Changer de vendeur" back to no seller: ends the active seller session on this device. */
    async pinClear(token: string, refreshSecret: string | null) {
      const s = await authenticate(token);
      const deviceRows = refreshSecret
        ? await db.read({
            sql: "SELECT session_id FROM session_secrets WHERE refresh_hash=?",
            params: [await sha256(refreshSecret)],
          })
        : [];
      const deviceSessionId = deviceRows[0]?.["session_id"];
      if (typeof deviceSessionId !== "string") throw new AuthError("UNAUTHORIZED");
      const linked = await db.read({
        sql: "SELECT 1 FROM sessions WHERE id=? AND (id=? OR id IN(SELECT seller_session_id FROM device_active_seller WHERE device_session_id=?))",
        params: [s.sessionId, deviceSessionId, deviceSessionId],
      });
      if (!linked.length) throw new AuthError("UNAUTHORIZED");
      await db.batch([
        {
          sql: "UPDATE sessions SET revoked=1 WHERE id IN(SELECT seller_session_id FROM device_active_seller WHERE device_session_id=?)",
          params: [deviceSessionId],
        },
        {
          sql: "DELETE FROM device_active_seller WHERE device_session_id=?",
          params: [deviceSessionId],
        },
        event("SELLER_CLEARED", s.userId),
      ]);
      const owner = (
        await db.read({ sql: "SELECT user_id FROM sessions WHERE id=?", params: [deviceSessionId] })
      )[0];
      return sign(String(owner?.["user_id"]), deviceSessionId);
    },

    async alerts(token: string) {
      await requireOwner(token);
      return db.read({
        sql: "SELECT o.id,o.kind,o.user_id userId,c.display_name displayName,o.device_id deviceId,o.ip,o.at FROM owner_alerts o LEFT JOIN account_credentials c ON c.user_id=o.user_id WHERE NOT EXISTS(SELECT 1 FROM owner_alert_acks k WHERE k.alert_id=o.id) ORDER BY o.at DESC LIMIT 100",
        params: [],
      });
    },

    async ackAlert(token: string, input: unknown) {
      const owner = await requireOwner(token);
      const v = ackInput.safeParse(input);
      if (!v.success) throw new AuthError("VALIDATION");
      await db.batch([
        {
          sql: "INSERT OR IGNORE INTO owner_alert_acks SELECT id,?,? FROM owner_alerts WHERE id=?",
          params: [owner.userId, clock(), v.data.id],
        },
        event("ALERT_ACK", owner.userId, { actor: owner.userId }),
      ]);
      return { ok: true as const };
    },
  };
}
export type AuthService = ReturnType<typeof createAuthService>;
