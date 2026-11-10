import { describe, it, expect } from "vitest";
import { generateKeyPair, exportJWK, SignJWT } from "jose";
import { createJwtIdentityVerifier } from "@/backend/sqlite/jwt-identity";
import { sqliteHarness } from "./sqlite-harness";
describe("real cryptographic JWT / local SQLite only", () => {
  const setup = async () => {
    const h = sqliteHarness();
    h.db.exec(
      "INSERT INTO accounts VALUES('user',1);INSERT INTO sessions VALUES('session','user',200000,0);INSERT INTO identity_subjects VALUES('https://id.invalid','subject','user');",
    );
    const keys = await generateKeyPair("ES256");
    const jwk = { ...(await exportJWK(keys.publicKey)), kid: "trusted" };
    const config = { issuer: "https://id.invalid", audience: "phonehouse", jwks: { keys: [jwk] } };
    const sign = async (aud = "phonehouse", exp = 100) =>
      new SignJWT({ sid: "session" })
        .setProtectedHeader({ alg: "ES256", kid: "trusted" })
        .setIssuer(config.issuer)
        .setAudience(aud)
        .setSubject("subject")
        .setIssuedAt(1)
        .setExpirationTime(exp)
        .sign(keys.privateKey);
    return { h, config, sign, verify: createJwtIdentityVerifier(config, h.port, () => 10000) };
  };
  it("rejects unconfigured identity", async () => {
    const h = sqliteHarness();
    try {
      expect(await createJwtIdentityVerifier(undefined, h.port).verify("token")).toBe(null);
    } finally {
      h.db.close();
    }
  });
  it("verifies actual signature and server subject/session mapping", async () => {
    const s = await setup();
    try {
      expect(await s.verify.verify(await s.sign())).toEqual({
        userId: "user",
        sessionId: "session",
        expiresAt: 100000,
      });
    } finally {
      s.h.db.close();
    }
  });
  it("rejects wrong audience, expiry and altered signature", async () => {
    const s = await setup();
    try {
      expect(await s.verify.verify(await s.sign("other"))).toBe(null);
      expect(await s.verify.verify(await s.sign("phonehouse", 9))).toBe(null);
      const t = await s.sign();
      expect(await s.verify.verify(t.slice(0, -10) + "XXXXXXXXXX")).toBe(null);
    } finally {
      s.h.db.close();
    }
  });
  it("rejects inactive staff and revoked session", async () => {
    const s = await setup();
    try {
      const t = await s.sign();
      s.h.db.exec("UPDATE accounts SET active=0");
      expect(await s.verify.verify(t)).toBe(null);
      s.h.db.exec("UPDATE accounts SET active=1;UPDATE sessions SET revoked=1");
      expect(await s.verify.verify(t)).toBe(null);
    } finally {
      s.h.db.close();
    }
  });
});
