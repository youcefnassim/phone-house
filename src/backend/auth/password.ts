// Password / PIN hashing for Cloudflare Workers (WebCrypto only, no native modules).
// hash = HMAC-SHA-256(pepper, PBKDF2-SHA-256(secret, 16-byte random salt, iterations))
// - The pepper is a Worker secret (never in D1), so a D1 dump alone cannot be cracked offline.
// - Algorithm, iterations and pepper id are stored with every hash; login rehashes when they change.
// - Iterations default to 100,000: the historical hosted-Workers PBKDF2 cap. Raise PBKDF2_ITERATIONS only
//   after a staging deployment proves the hosted runtime accepts more (local workerd does not enforce it).
export const HASH_ALGORITHM = "PBKDF2-SHA256+HMAC-SHA256" as const;
export const DEFAULT_ITERATIONS = 100_000;
export const MIN_ITERATIONS = 100_000;

export interface PepperConfig {
  /** id -> base64 secret (>= 32 bytes). Several ids allow rotation. */
  peppers: Record<string, string>;
  currentId: string;
  iterations: number;
}
export interface StoredHash {
  algorithm: string;
  iterations: number;
  salt: string;
  hash: string;
  pepperId: string;
}

const enc = new TextEncoder();
export const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
export const fromBase64 = (value: string): Uint8Array<ArrayBuffer> =>
  Uint8Array.from(atob(value), (c) => c.charCodeAt(0));

export function parsePepperConfig(
  peppersJson: string | undefined,
  currentId: string | undefined,
  iterations?: string,
) {
  if (!peppersJson || !currentId) return null;
  let peppers: unknown;
  try {
    peppers = JSON.parse(peppersJson);
  } catch {
    return null;
  }
  if (!peppers || typeof peppers !== "object") return null;
  const map = peppers as Record<string, unknown>;
  for (const value of Object.values(map))
    if (typeof value !== "string" || fromBase64(value).length < 32) return null;
  if (typeof map[currentId] !== "string") return null;
  const n = iterations ? Number(iterations) : DEFAULT_ITERATIONS;
  if (!Number.isSafeInteger(n) || n < MIN_ITERATIONS || n > 10_000_000) return null;
  return {
    peppers: map as Record<string, string>,
    currentId,
    iterations: n,
  } satisfies PepperConfig;
}

async function derive(
  secret: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number,
  pepper: Uint8Array<ArrayBuffer>,
) {
  const material = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret.normalize("NFC")),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: "PBKDF2", hash: "SHA-256", salt, iterations },
      material,
      256,
    ),
  );
  const mac = await crypto.subtle.importKey(
    "raw",
    pepper,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", mac, bits));
}

export async function hashSecret(secret: string, config: PepperConfig): Promise<StoredHash> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const pepper = fromBase64(config.peppers[config.currentId] ?? "");
  const hash = await derive(secret, salt, config.iterations, pepper);
  return {
    algorithm: HASH_ALGORITHM,
    iterations: config.iterations,
    salt: toBase64(salt),
    hash: toBase64(hash),
    pepperId: config.currentId,
  };
}

/** Constant-time comparison of equal-length byte arrays (length is not secret: always 32). */
export function timingSafeEqual(a: Uint8Array, b: Uint8Array) {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

/** Verifies; `stored` null still burns one full derivation so unknown accounts take the same time. */
export async function verifySecret(
  secret: string,
  stored: StoredHash | null,
  config: PepperConfig,
) {
  const usable =
    stored &&
    stored.algorithm === HASH_ALGORITHM &&
    stored.iterations >= MIN_ITERATIONS &&
    typeof config.peppers[stored.pepperId] === "string";
  const salt = usable ? fromBase64(stored.salt) : new Uint8Array(16);
  const iterations = usable ? stored.iterations : config.iterations;
  const pepper = fromBase64(config.peppers[usable ? stored.pepperId : config.currentId] ?? "");
  const computed = await derive(secret, salt, iterations, pepper);
  const expected = usable ? fromBase64(stored.hash) : new Uint8Array(32).fill(1);
  const ok = timingSafeEqual(computed, expected) && !!usable;
  const needsRehash =
    ok && (stored.iterations !== config.iterations || stored.pepperId !== config.currentId);
  return { ok, needsRehash };
}

// Most common passwords of 12+ characters (and common bases padded to 12+), compared lowercased.
const COMMON = new Set(
  [
    "123456789012",
    "1234567890123",
    "12345678910",
    "123456789123",
    "111111111111",
    "000000000000",
    "123123123123",
    "qwertyuiopas",
    "qwertyuiop123",
    "qwerty123456",
    "1q2w3e4r5t6y",
    "1qaz2wsx3edc",
    "zaq12wsxcde3",
    "password1234",
    "password12345",
    "password123456",
    "passwordpassword",
    "motdepasse123",
    "motdepasse1234",
    "azertyuiop123",
    "azerty123456",
    "azertyuiopqs",
    "iloveyou1234",
    "abcdefghijkl",
    "abc123456789",
    "aaaaaaaaaaaa",
    "welcome12345",
    "letmein12345",
    "admin1234567",
    "administrator",
    "changeme1234",
    "football1234",
    "baseball1234",
    "sunshine1234",
    "princess1234",
    "superman1234",
    "starwars1234",
    "computer1234",
    "trustno11234",
    "phonehouse123",
    "phonehouse2026",
    "phonehousemaghnia",
    "maghnia123456",
    "algerie12345",
    "algeria12345",
    "dz1234567890",
    "bismillah123",
    "bismillah1234",
    "samsung12345",
    "iphone123456",
    "q1w2e3r4t5y6",
    "asdfghjkl123",
    "zxcvbnm12345",
    "passw0rd1234",
    "p@ssw0rd1234",
    "p@ssword1234",
    "1234qwerasdf",
    "qwertyqwerty",
    "azertyazerty",
    "987654321098",
  ].map((p) => p.toLowerCase()),
);
export type PasswordProblem = "TOO_SHORT" | "TOO_LONG" | "TOO_COMMON";
export function passwordProblem(password: string, email = ""): PasswordProblem | null {
  const length = [...password].length;
  if (length < 12) return "TOO_SHORT";
  if (length > 256) return "TOO_LONG";
  const lower = password.toLowerCase();
  const local = email.split("@")[0]?.toLowerCase() ?? "";
  if (
    COMMON.has(lower) ||
    /^(.)\1+$/.test(password) ||
    (local.length >= 4 && lower.includes(local))
  )
    return "TOO_COMMON";
  return null;
}
/** PIN: 4-8 digits, not all identical, not a straight ascending/descending run. */
export function pinProblem(pin: string): "PIN_FORMAT" | "PIN_WEAK" | null {
  if (!/^\d{4,8}$/.test(pin)) return "PIN_FORMAT";
  const d = [...pin].map(Number);
  const step = (k: number) => d.every((x, i) => i === 0 || x === ((d[i - 1] ?? 0) + k + 10) % 10);
  if (/^(\d)\1+$/.test(pin) || step(1) || step(-1)) return "PIN_WEAK";
  return null;
}
