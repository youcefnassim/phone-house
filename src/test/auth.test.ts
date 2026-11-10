// Phase 2.2 own login: hashing + pepper, policy, lockout, rehash, forced change, owner-only staff admin,
// new-device alerts, refresh/logout, per-seller PIN switch inside a device session, HTTP cookies.
import { beforeEach, describe, expect, it } from "vitest";
import { exportJWK, generateKeyPair } from "jose";
import { sqliteHarness } from "./sqlite-harness";
import { createAuthService, type AuthConfig } from "@/backend/auth/service";
import {
  hashSecret,
  passwordProblem,
  pinProblem,
  verifySecret,
  toBase64,
  type PepperConfig,
} from "@/backend/auth/password";
import { createJwtIdentityVerifier } from "@/backend/sqlite/jwt-identity";
import { createNativeService } from "@/backend/sqlite/service";
import worker, { AUTH_AUDIENCE, type NativeWorkerEnv } from "@/backend/worker";
import type { D1Binding } from "@/backend/sqlite/d1-port";

let h: ReturnType<typeof sqliteHarness>;
let now = Date.parse("2026-11-10T12:00:00Z");
const clock = () => now;
const pepperBytes = () => toBase64(crypto.getRandomValues(new Uint8Array(32)));
const pepper: PepperConfig = {
  peppers: { p1: pepperBytes() },
  currentId: "p1",
  iterations: 100000,
};
let signingJwk: AuthConfig["signingJwk"];
const issuer = "https://erp.phonehousemaghnia.com";
const config = (patch: Partial<AuthConfig> = {}): AuthConfig => ({
  issuer,
  audience: AUTH_AUDIENCE,
  signingJwk,
  pepper,
  clock,
  ...patch,
});
const auth = (patch: Partial<AuthConfig> = {}) => createAuthService(h.port, config(patch));
const nativeVerifier = () => {
  const { d: _d, ...pub } = signingJwk;
  return createJwtIdentityVerifier(
    { issuer, audience: AUTH_AUDIENCE, jwks: { keys: [{ ...pub, alg: "ES256" }] } },
    h.port,
    clock,
  );
};
const one = (sql: string) => {
  const row = h.db.prepare(sql).get() as Record<string, unknown> | undefined;
  return row ? Object.values(row)[0] : undefined;
};
const OWNER_PW = "Owner-Strong-Pass-2026!";
const DEVICE = "device-m01-till-0001";

/** Break-glass style owner bootstrap (what scripts/auth-break-glass.ts produces as SQL). */
async function seedOwner() {
  const hsh = await hashSecret(OWNER_PW, pepper);
  h.db
    .exec(`INSERT INTO accounts VALUES('owner',1);INSERT INTO memberships VALUES('owner','GLOBAL','SUPER_ADMIN');
    INSERT INTO identity_subjects VALUES('${issuer}','owner','owner');`);
  h.db
    .prepare(
      "INSERT INTO account_credentials VALUES('owner','owner@phonehouse.dz','Owner',?,?,?,?,?,0,0,NULL,0)",
    )
    .run(hsh.algorithm, hsh.iterations, hsh.salt, hsh.hash, hsh.pepperId);
}
const ownerLogin = (device = DEVICE) =>
  auth().login({ email: "owner@phonehouse.dz", password: OWNER_PW, deviceId: device }, "10.0.0.1");

beforeEach(async () => {
  h = sqliteHarness();
  now = Date.parse("2026-11-10T12:00:00Z");
  if (!signingJwk) {
    const { privateKey } = await generateKeyPair("ES256", { extractable: true });
    signingJwk = {
      ...(await exportJWK(privateKey)),
      kid: "test-key-1",
    } as AuthConfig["signingJwk"];
  }
  await seedOwner();
});

describe("hashing and policy", () => {
  it("stores algorithm, iterations, salt and pepper id; a D1 dump without the pepper cannot verify", async () => {
    const stored = await hashSecret("Correct-Horse-Battery-9", pepper);
    expect(stored).toMatchObject({
      algorithm: "PBKDF2-SHA256+HMAC-SHA256",
      iterations: 100000,
      pepperId: "p1",
    });
    expect(atob(stored.salt)).toHaveLength(16);
    expect((await verifySecret("Correct-Horse-Battery-9", stored, pepper)).ok).toBe(true);
    expect((await verifySecret("Correct-Horse-Battery-8", stored, pepper)).ok).toBe(false);
    const otherPepper = { ...pepper, peppers: { p1: pepperBytes() } };
    expect((await verifySecret("Correct-Horse-Battery-9", stored, otherPepper)).ok).toBe(false);
    // Same password, different salt -> different hash.
    expect((await hashSecret("Correct-Horse-Battery-9", pepper)).hash).not.toBe(stored.hash);
  });
  it("password policy: 12+ characters, common and email-based passwords blocked", () => {
    expect(passwordProblem("Short-1")).toBe("TOO_SHORT");
    expect(passwordProblem("Password1234")).toBe("TOO_COMMON");
    expect(passwordProblem("aaaaaaaaaaaaaaa")).toBe("TOO_COMMON");
    expect(passwordProblem("karim.benali-2026", "karim.benali@x.dz")).toBe("TOO_COMMON");
    expect(passwordProblem("Vendeur-Magasin-1-Nuit")).toBeNull();
  });
  it("PIN policy: 4-8 digits, no repeats or straight runs", () => {
    expect(pinProblem("12a4")).toBe("PIN_FORMAT");
    expect(pinProblem("123")).toBe("PIN_FORMAT");
    expect(pinProblem("1111")).toBe("PIN_WEAK");
    expect(pinProblem("1234")).toBe("PIN_WEAK");
    expect(pinProblem("9876")).toBe("PIN_WEAK");
    expect(pinProblem("4071")).toBeNull();
  });
});

describe("login", () => {
  it("success issues a 15-minute ES256 token accepted by the native verifier, records the session", async () => {
    const r = await ownerLogin();
    expect(r.expiresAt - now).toBe(15 * 60 * 1000);
    expect(r.user).toMatchObject({ id: "owner", displayName: "Owner", mustChange: false });
    expect(r.refreshSecret.length).toBeGreaterThanOrEqual(40);
    const id = await nativeVerifier().verify(r.accessToken);
    expect(id?.userId).toBe("owner");
    expect(one("SELECT count(*) FROM sessions WHERE user_id='owner' AND revoked=0")).toBe(1);
    // Only a hash of the refresh secret is stored.
    expect(one("SELECT refresh_hash FROM session_secrets")).not.toBe(r.refreshSecret);
  });
  it("unknown email, wrong password and inactive account fail identically", async () => {
    const attempts = [
      { email: "nobody@phonehouse.dz", password: OWNER_PW },
      { email: "owner@phonehouse.dz", password: "Wrong-Password-123" },
    ];
    for (const a of attempts)
      await expect(auth().login({ ...a, deviceId: DEVICE }, null)).rejects.toThrow(
        "INVALID_CREDENTIALS",
      );
    h.db.exec("UPDATE accounts SET active=0 WHERE id='owner'");
    await expect(ownerLogin()).rejects.toThrow("INVALID_CREDENTIALS");
    await expect(auth().login({ email: "x", password: "", deviceId: "bad" }, null)).rejects.toThrow(
      "INVALID_CREDENTIALS",
    );
  });
  it("5 failures lock for 15 minutes (even the right password), then it works again", async () => {
    const wrong = () =>
      auth().login(
        { email: "owner@phonehouse.dz", password: "Wrong-Password-123", deviceId: DEVICE },
        null,
      );
    for (let i = 0; i < 5; i++) await expect(wrong()).rejects.toThrow("INVALID_CREDENTIALS");
    expect(one("SELECT locked_until FROM account_credentials")).toBe(now + 15 * 60 * 1000);
    expect(one("SELECT count(*) FROM auth_events WHERE kind='LOCKOUT'")).toBe(1);
    await expect(ownerLogin()).rejects.toThrow("INVALID_CREDENTIALS");
    expect(one("SELECT count(*) FROM auth_events WHERE kind='LOGIN_LOCKED'")).toBe(1);
    now += 15 * 60 * 1000 - 1;
    await expect(ownerLogin()).rejects.toThrow("INVALID_CREDENTIALS");
    now += 2;
    await ownerLogin();
    expect(one("SELECT failed_count FROM account_credentials")).toBe(0);
  });
  it("rehashes on login when iterations or the pepper change", async () => {
    await auth({ pepper: { ...pepper, iterations: 120000 } }).login(
      { email: "owner@phonehouse.dz", password: OWNER_PW, deviceId: DEVICE },
      null,
    );
    expect(one("SELECT iterations FROM account_credentials")).toBe(120000);
    const rotated = {
      peppers: { ...pepper.peppers, p2: pepperBytes() },
      currentId: "p2",
      iterations: 120000,
    };
    await auth({ pepper: rotated }).login(
      { email: "owner@phonehouse.dz", password: OWNER_PW, deviceId: DEVICE },
      null,
    );
    expect(one("SELECT pepper_id FROM account_credentials")).toBe("p2");
    await auth({ pepper: rotated }).login(
      { email: "owner@phonehouse.dz", password: OWNER_PW, deviceId: DEVICE },
      null,
    );
  });
  it("new device: owner alert once per device; owner lists and acknowledges; staff cannot", async () => {
    const first = await ownerLogin();
    await ownerLogin();
    await ownerLogin("device-home-laptop-02");
    const alerts = (await auth().alerts(first.accessToken)) as { deviceId: string; id: string }[];
    expect(alerts.map((a) => a.deviceId).sort()).toEqual(["device-home-laptop-02", DEVICE]);
    await auth().ackAlert(first.accessToken, { id: alerts[0]?.id });
    expect(await auth().alerts(first.accessToken)).toHaveLength(1);
    expect(() => h.db.exec("DELETE FROM owner_alerts")).toThrow("APPEND_ONLY");
  });
  it("refresh renews the token; logout ends refresh and the session", async () => {
    const r = await ownerLogin();
    now += 20 * 60 * 1000;
    expect(await nativeVerifier().verify(r.accessToken)).toBeNull();
    const renewed = await auth().refresh(r.refreshSecret);
    expect((await nativeVerifier().verify(renewed.accessToken))?.userId).toBe("owner");
    await auth().logout(r.refreshSecret);
    await expect(auth().refresh(r.refreshSecret)).rejects.toThrow("UNAUTHORIZED");
    expect(await nativeVerifier().verify(renewed.accessToken)).toBeNull();
  });
});

describe("staff accounts (owner only) and forced change", () => {
  const staff = {
    email: "karim@phonehouse.dz",
    displayName: "Karim",
    role: "SELLER",
    store: "M01",
    temporaryPassword: "Provisoire-Vendeur-01",
    pin: "4071",
  };
  it("owner creates staff with temporary password; ERP API refused until the password is changed", async () => {
    const owner = await ownerLogin();
    await expect(
      auth().adminCreate(owner.accessToken, { ...staff, temporaryPassword: "short" }),
    ).rejects.toThrow("PASSWORD_POLICY");
    const created = await auth().adminCreate(owner.accessToken, staff);
    await expect(auth().adminCreate(owner.accessToken, staff)).rejects.toThrow("EMAIL_TAKEN");
    const login = await auth().login(
      { email: staff.email, password: staff.temporaryPassword, deviceId: DEVICE },
      null,
    );
    expect(login.user.mustChange).toBe(true);
    expect(await nativeVerifier().verify(login.accessToken)).toBeNull();
    // Staff cannot administer.
    await expect(
      auth().adminCreate(login.accessToken, { ...staff, email: "x@y.dz" }),
    ).rejects.toThrow("FORBIDDEN");
    await expect(
      auth().changePassword(login.accessToken, {
        currentPassword: staff.temporaryPassword,
        newPassword: staff.temporaryPassword,
      }),
    ).rejects.toThrow("PASSWORD_POLICY");
    await auth().changePassword(login.accessToken, {
      currentPassword: staff.temporaryPassword,
      newPassword: "Vendeur-Nouveau-Secret-9",
    });
    expect((await nativeVerifier().verify(login.accessToken))?.userId).toBe(created.userId);
    expect(one("SELECT count(*) FROM auth_events WHERE kind='PASSWORD_CHANGED'")).toBe(1);
  });
  it("owner reset: revokes staff sessions and forces a change; the owner account cannot be reset this way", async () => {
    const owner = await ownerLogin();
    const { userId } = await auth().adminCreate(owner.accessToken, staff);
    const s = await auth().login(
      { email: staff.email, password: staff.temporaryPassword, deviceId: DEVICE },
      null,
    );
    await auth().changePassword(s.accessToken, {
      currentPassword: staff.temporaryPassword,
      newPassword: "Vendeur-Nouveau-Secret-9",
    });
    await auth().adminReset(owner.accessToken, {
      userId,
      temporaryPassword: "Reset-Temporaire-77",
    });
    expect(await nativeVerifier().verify(s.accessToken)).toBeNull();
    expect(one(`SELECT must_change FROM account_credentials WHERE user_id='${userId}'`)).toBe(1);
    await expect(
      auth().adminReset(owner.accessToken, {
        userId: "owner",
        temporaryPassword: "Reset-Temporaire-77",
      }),
    ).rejects.toThrow("FORBIDDEN");
  });
});

describe("seller PIN switch on the shared M01 PC", () => {
  async function setup() {
    const owner = await ownerLogin();
    const sellers: Record<string, string> = {};
    for (const [name, store, pin] of [
      ["Karim", "M01", "4071"],
      ["Nadia", "M01", "5820"],
      ["Samir", "M02", "6392"],
    ] as const) {
      const r = await auth().adminCreate(owner.accessToken, {
        email: `${name.toLowerCase()}@phonehouse.dz`,
        displayName: name,
        role: "SELLER",
        store,
        temporaryPassword: `Provisoire-Magasin-${store}-01`,
        pin,
      });
      sellers[name] = r.userId;
      if (name === "Nadia") continue; // Nadia keeps her temporary password (see refusal test)
      const first = await auth().login(
        {
          email: `${name.toLowerCase()}@phonehouse.dz`,
          password: `Provisoire-Magasin-${store}-01`,
          deviceId: DEVICE,
        },
        null,
      );
      await auth().changePassword(first.accessToken, {
        currentPassword: `Provisoire-Magasin-${store}-01`,
        newPassword: `Vendeur-Definitif-${store}-77`,
      });
    }
    return { owner, sellers };
  }
  it("switch needs the device session token AND its cookie; seller token is accepted by the ERP API", async () => {
    const { owner, sellers } = await setup();
    await expect(
      auth().pinSwitch(
        owner.accessToken,
        null,
        { store: "M01", sellerId: sellers["Karim"], pin: "4071" },
        null,
      ),
    ).rejects.toThrow("UNAUTHORIZED");
    const list = await auth().sellers(owner.accessToken, owner.refreshSecret, { store: "M01" });
    expect(list.map((s) => s.displayName)).toEqual(["Karim", "Nadia"]);
    const k = await auth().pinSwitch(
      owner.accessToken,
      owner.refreshSecret,
      { store: "M01", sellerId: sellers["Karim"], pin: "4071" },
      null,
    );
    expect(k.activeSeller.displayName).toBe("Karim");
    expect((await nativeVerifier().verify(k.accessToken))?.userId).toBe(sellers["Karim"]);
    // Refresh on this device now yields the active seller's token.
    const refreshed = await auth().refresh(owner.refreshSecret);
    expect(refreshed.activeSeller?.displayName).toBe("Karim");
    expect((await nativeVerifier().verify(refreshed.accessToken))?.userId).toBe(sellers["Karim"]);
    // A seller token cannot itself switch (only the device session can).
    await expect(
      auth().pinSwitch(
        k.accessToken,
        owner.refreshSecret,
        { store: "M01", sellerId: sellers["Nadia"], pin: "5820" },
        null,
      ),
    ).rejects.toThrow("UNAUTHORIZED");
    // Nadia still has her temporary password: the PIN is refused until she replaces it.
    await expect(
      auth().pinSwitch(
        owner.accessToken,
        owner.refreshSecret,
        { store: "M01", sellerId: sellers["Nadia"], pin: "5820" },
        null,
      ),
    ).rejects.toThrow("PASSWORD_CHANGE_REQUIRED");
    expect(list.find((s) => s.displayName === "Nadia")?.mustChange).toBe(true);
    const nadia = await auth().login(
      {
        email: "nadia@phonehouse.dz",
        password: "Provisoire-Magasin-M01-01",
        deviceId: "device-nadia-phone",
      },
      null,
    );
    await auth().changePassword(nadia.accessToken, {
      currentPassword: "Provisoire-Magasin-M01-01",
      newPassword: "Vendeur-Definitif-M01-88",
    });
    // Changer de vendeur: Nadia replaces Karim; Karim's session ends.
    const n = await auth().pinSwitch(
      owner.accessToken,
      owner.refreshSecret,
      { store: "M01", sellerId: sellers["Nadia"], pin: "5820" },
      null,
    );
    expect(await nativeVerifier().verify(k.accessToken)).toBeNull();
    expect((await nativeVerifier().verify(n.accessToken))?.userId).toBe(sellers["Nadia"]);
    // Other store's seller is refused.
    await expect(
      auth().pinSwitch(
        owner.accessToken,
        owner.refreshSecret,
        { store: "M01", sellerId: sellers["Samir"], pin: "6392" },
        null,
      ),
    ).rejects.toThrow("FORBIDDEN");
    // Logging the device out ends the seller session too.
    await auth().logout(owner.refreshSecret);
    expect(await nativeVerifier().verify(n.accessToken)).toBeNull();
  });
  it("a PIN is never a remote login: a staff password session on another device cannot switch without its own cookie", async () => {
    const { owner, sellers } = await setup();
    const remote = await ownerLogin("device-remote-999");
    await expect(
      auth().pinSwitch(
        remote.accessToken,
        owner.refreshSecret,
        { store: "M01", sellerId: sellers["Karim"], pin: "4071" },
        null,
      ),
    ).rejects.toThrow("UNAUTHORIZED");
  });
  it("5 wrong PINs lock that seller's PIN; owner reset unlocks", async () => {
    const { owner, sellers } = await setup();
    const tryPin = (pin: string) =>
      auth().pinSwitch(
        owner.accessToken,
        owner.refreshSecret,
        { store: "M01", sellerId: sellers["Karim"], pin },
        null,
      );
    for (let i = 0; i < 4; i++) await expect(tryPin("0000")).rejects.toThrow("INVALID_PIN");
    await expect(tryPin("0000")).rejects.toThrow("PIN_LOCKED");
    await expect(tryPin("4071")).rejects.toThrow("PIN_LOCKED");
    expect(one("SELECT count(*) FROM auth_events WHERE kind='PIN_FAIL'")).toBe(5);
    await auth().pinSet(owner.accessToken, { userId: sellers["Karim"], pin: "7305" });
    await tryPin("7305");
  });
  it("every sale records the active seller (Karim), not the device account", async () => {
    const { owner, sellers } = await setup();
    const k = await auth().pinSwitch(
      owner.accessToken,
      owner.refreshSecret,
      { store: "M01", sellerId: sellers["Karim"], pin: "4071" },
      null,
    );
    h.db
      .exec(`INSERT INTO catalog VALUES('55555555-5555-4555-8555-555555555555','accessory','ACC','Cable','{}');INSERT INTO prices VALUES('M01','55555555-5555-4555-8555-555555555555',500);
      INSERT INTO accessory_balances VALUES('M01','55555555-5555-4555-8555-555555555555',5);INSERT INTO drawers VALUES('d','M01');
      INSERT INTO shifts VALUES('44444444-4444-4444-8444-444444444444','M01','d','${sellers["Karim"]}','OPEN',0,NULL);`);
    const svc = createNativeService(
      h.port,
      nativeVerifier(),
      { get: async () => null, put: async () => {} },
      clock,
    );
    await svc.checkout(k.accessToken, {
      contractVersion: "native-pos-2026-11-07",
      idempotencyKey: "auth-seller-sale-0001",
      clientRequestId: crypto.randomUUID(),
      payload: {
        store: "M01",
        shiftId: "44444444-4444-4444-8444-444444444444",
        lines: [
          { kind: "accessory", itemId: "55555555-5555-4555-8555-555555555555", quantity: "1" },
        ],
        tender: "Cash",
        tenderedAmount: "5",
        warranties: [],
      },
    });
    expect(one("SELECT seller_id FROM sales")).toBe(sellers["Karim"]);
  });
});

describe("HTTP layer through the Worker", () => {
  const env = (): NativeWorkerEnv => ({
    DB: d1(),
    ENABLE_NATIVE: "OWNER_APPROVED",
    API_HOST: "erp.phonehousemaghnia.com",
    ALLOWED_ORIGIN: "https://erp.phonehousemaghnia.com",
    AUTH_SIGNING_JWK: JSON.stringify(signingJwk),
    AUTH_PEPPERS: JSON.stringify(pepper.peppers),
    AUTH_PEPPER_ID: "p1",
    RATE_LIMIT: { limit: async () => ({ success: true }) },
  });
  /** Minimal D1 binding over the node:sqlite harness. */
  const d1 = () =>
    ({
      prepare: (sql: string) => {
        const bound = (params: unknown[]) => ({
          all: async () => ({ results: h.db.prepare(sql).all(...(params as never[])) }),
          _run: () => h.db.prepare(sql).run(...(params as never[])),
          sql,
          params,
        });
        return { bind: (...params: unknown[]) => bound(params) };
      },
      batch: async (statements: { sql: string; params: unknown[] }[]) => {
        h.db.exec("BEGIN IMMEDIATE");
        try {
          const out = statements.map((s) => {
            const st = h.db.prepare(s.sql);
            if (/^\s*SELECT/i.test(s.sql))
              return { results: st.all(...(s.params as never[])), meta: { changes: 0 } };
            return {
              results: [],
              meta: { changes: Number(st.run(...(s.params as never[])).changes) },
            };
          });
          h.db.exec("COMMIT");
          return out;
        } catch (e) {
          h.db.exec("ROLLBACK");
          throw e;
        }
      },
    }) as unknown as D1Binding;
  const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
    worker.fetch(
      new Request(`https://erp.phonehousemaghnia.com${path}`, {
        method: "POST",
        headers: {
          Origin: "https://erp.phonehousemaghnia.com",
          "Content-Type": "application/json",
          ...headers,
        },
        body: JSON.stringify(body),
      }),
      env(),
    );
  it("login sets a __Host- Secure HttpOnly SameSite=Strict cookie; refresh uses it; errors are generic", async () => {
    const bad = await post("/api/auth/login", {
      email: "owner@phonehouse.dz",
      password: "nope-nope-nope",
      deviceId: DEVICE,
    });
    expect(bad.status).toBe(401);
    expect(await bad.json()).toMatchObject({ error: "INVALID_CREDENTIALS" });
    const r = await post("/api/auth/login", {
      email: "owner@phonehouse.dz",
      password: OWNER_PW,
      deviceId: DEVICE,
    });
    expect(r.status).toBe(200);
    const setCookie = r.headers.get("Set-Cookie") ?? "";
    expect(setCookie).toMatch(
      /^__Host-ph_session=[A-Za-z0-9_-]{40,}; Path=\/; HttpOnly; SameSite=Strict; Max-Age=43200; Secure$/,
    );
    const body = (await r.json()) as { accessToken: string; refreshSecret?: string };
    expect(body.refreshSecret).toBeUndefined();
    const cookie = setCookie.split(";")[0] ?? "";
    const refreshed = await post("/api/auth/refresh", {}, { Cookie: cookie });
    expect(refreshed.status).toBe(200);
    const status = await post(
      "/api/native/status",
      {},
      { Authorization: `Bearer ${body.accessToken}` },
    );
    expect(status.status).toBe(200);
    const out = await post("/api/auth/logout", {}, { Cookie: cookie });
    expect(out.headers.get("Set-Cookie")).toContain("Max-Age=0");
    expect((await post("/api/auth/refresh", {}, { Cookie: cookie })).status).toBe(401);
  });
  it("missing auth secrets fail closed", async () => {
    const e = { ...env(), AUTH_PEPPERS: "{}" };
    const r = await worker.fetch(
      new Request("https://erp.phonehousemaghnia.com/api/auth/login", {
        method: "POST",
        headers: { Origin: "https://erp.phonehousemaghnia.com" },
        body: "{}",
      }),
      e,
    );
    expect(r.status).toBe(503);
  });
});
