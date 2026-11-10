// AGENCY BREAK-GLASS: bootstrap the first owner, or recover the owner account (no email provider yet).
// This script NEVER touches a database. It prints SQL that a human then runs with wrangler, e.g.
//   bun scripts/auth-break-glass.ts --email owner@example.dz --name "Owner" --issuer https://erp.phonehousemaghnia.com > /tmp/bg.sql
//   npx wrangler d1 execute DB --config wrangler.jsonc --env production --remote --file /tmp/bg.sql
//   shred -u /tmp/bg.sql   (the file contains a password hash)
// Inputs:
//   - the temporary password is read from STDIN (never argv / shell history); min 12 chars, policy-checked
//   - AUTH_PEPPERS / AUTH_PEPPER_ID / PBKDF2_ITERATIONS from the environment (the agency's secret store),
//     identical to the Worker secrets of the target environment
// Effect of the SQL: creates the owner (SUPER_ADMIN, GLOBAL) if absent; otherwise sets a new temporary
// password with forced change, clears the lockout and revokes every owner session. Recorded in auth_events.
// Full procedure: docs/AUTH_BREAK_GLASS.md
import { hashSecret, parsePepperConfig, passwordProblem } from "../src/backend/auth/password";

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const email = arg("email")?.trim().toLowerCase();
const name = arg("name")?.trim();
const issuer = arg("issuer");
if (
  !email ||
  !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
  !name ||
  !issuer?.startsWith("https://")
) {
  console.error(
    'Usage: bun scripts/auth-break-glass.ts --email <owner email> --name "<display name>" --issuer https://<API_HOST>',
  );
  process.exit(2);
}
const pepper = parsePepperConfig(
  process.env["AUTH_PEPPERS"],
  process.env["AUTH_PEPPER_ID"],
  process.env["PBKDF2_ITERATIONS"],
);
if (!pepper) {
  console.error(
    "AUTH_PEPPERS / AUTH_PEPPER_ID (and optional PBKDF2_ITERATIONS) must match the target Worker secrets.",
  );
  process.exit(2);
}
let input = "";
for await (const chunk of process.stdin) input += chunk;
const password = input.replace(/\r?\n$/, "");
const problem = passwordProblem(password, email);
if (problem) {
  console.error(`Temporary password rejected: ${problem}`);
  process.exit(2);
}
const h = await hashSecret(password, pepper);
const q = (v: string) => `'${v.replace(/'/g, "''")}'`;
const now = Date.now();
const id = `owner-${crypto.randomUUID()}`;
// Existing owner credentials are matched by email; a new owner gets a fresh account id.
console.log(`-- break-glass ${new Date(now).toISOString()} for ${email}
INSERT INTO accounts SELECT ${q(id)},1 WHERE NOT EXISTS(SELECT 1 FROM account_credentials WHERE email=${q(email)});
INSERT INTO memberships SELECT ${q(id)},'GLOBAL','SUPER_ADMIN' WHERE EXISTS(SELECT 1 FROM accounts WHERE id=${q(id)});
INSERT INTO identity_subjects SELECT ${q(issuer)},${q(id)},${q(id)} WHERE EXISTS(SELECT 1 FROM accounts WHERE id=${q(id)});
INSERT INTO account_credentials SELECT ${q(id)},${q(email)},${q(name)},${q(h.algorithm)},${h.iterations},${q(h.salt)},${q(h.hash)},${q(h.pepperId)},1,0,NULL,${now} WHERE EXISTS(SELECT 1 FROM accounts WHERE id=${q(id)});
UPDATE account_credentials SET algorithm=${q(h.algorithm)},iterations=${h.iterations},salt=${q(h.salt)},hash=${q(h.hash)},pepper_id=${q(h.pepperId)},must_change=1,failed_count=0,locked_until=NULL,updated_at=${now} WHERE email=${q(email)} AND user_id<>${q(id)} AND EXISTS(SELECT 1 FROM memberships WHERE user_id=account_credentials.user_id AND role='SUPER_ADMIN');
UPDATE sessions SET revoked=1 WHERE user_id=(SELECT user_id FROM account_credentials WHERE email=${q(email)});
INSERT INTO auth_events SELECT ${q(crypto.randomUUID())},user_id,'PASSWORD_RESET',NULL,'break-glass',NULL,${now} FROM account_credentials WHERE email=${q(email)};`);
