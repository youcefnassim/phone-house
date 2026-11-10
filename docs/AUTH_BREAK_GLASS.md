# Owner bootstrap and recovery (agency break-glass)

There is no email or SMS provider yet, so the owner account cannot reset its own password by itself.
The **agency** performs the procedure below. Every run is recorded in `auth_events` (`PASSWORD_RESET`, actor
`NULL`, device `break-glass`) and the owner is forced to choose a new password at the next login.

Staff passwords are **not** recovered this way: the owner resets staff passwords in the app
(`/api/auth/admin/reset`), which issues a temporary password with forced change and revokes their sessions.

## Preconditions

1. The owner asks the agency through an agreed out-of-band channel (in person or a known phone number).
2. Two agency people are involved: one runs the commands, one verifies the target environment and email.
3. The operator has the target environment's `AUTH_PEPPERS` / `AUTH_PEPPER_ID` (and `PBKDF2_ITERATIONS` if set)
   from the agency secret store. They must be identical to the Worker secrets, or the password will not verify.

## Steps

```sh
# 1. Choose a temporary password (12+ characters, not common, not containing the email name).
# 2. Generate the SQL. The password is read from stdin, never from the command line.
export AUTH_PEPPERS='…'  AUTH_PEPPER_ID='…'      # from the agency secret store, this shell only
printf '%s' 'Temporary-Password-Here' | bun scripts/auth-break-glass.ts \
  --email owner@example.dz --name "Owner" --issuer https://erp.phonehousemaghnia.com > /tmp/bg.sql
# 3. Second person reviews /tmp/bg.sql (email, issuer) — it must contain no plaintext password.
# 4. Apply to the target database (production shown; requires the owner's explicit go for this action).
npx wrangler d1 execute DB --config wrangler.jsonc --env production --remote --file /tmp/bg.sql
# 5. Destroy the file and the shell variables.
shred -u /tmp/bg.sql 2>/dev/null || rm -P /tmp/bg.sql; unset AUTH_PEPPERS AUTH_PEPPER_ID
```

6. Hand the temporary password to the owner in person. At login the owner must set a new password;
   all previous owner sessions were revoked.
7. The new-device alert for the owner's next login appears in the owner's alert list — expected.

## First bootstrap

The same script creates the owner account (SUPER_ADMIN, GLOBAL) when the email does not exist yet.

## Local dev

```sh
bun scripts/auth-dev-secrets.ts                       # writes .dev.vars (git-ignored)
set -a; . ./.dev.vars; set +a
printf '%s' 'Magasin-Local-Clef-2026' | bun scripts/auth-break-glass.ts \
  --email owner@local.test --name "Owner" --issuer https://localhost:8787 > /tmp/bg.sql
npx wrangler d1 execute DB --config wrangler.jsonc --env dev --local --file /tmp/bg.sql
```

## Later

Email/SMS for owner notifications and self-service recovery are not implemented. New-device alerts are
in-app only (owner alert list) until a provider is approved.
