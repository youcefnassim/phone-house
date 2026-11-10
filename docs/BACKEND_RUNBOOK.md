# Backend Connection & Deployment Runbook — DRAFT

**Current execution gate:** `FIRST_REAL_POSTGRESQL_HANDOFF.md` supersedes all older local execution sequencing below. Lovable Docker execution is BLOCKED; first real acceptance requires an independently attested disposable host and two distinct owner-approved stages. No connection, SQL execution or backend activation is authorized.

Status: **Review09 corrected source, database acceptance NOT RUN**. Current mandatory gate: `REVIEW09_EXECUTION_CHECKPOINT.md`; old loopback/DSN activation procedures below are superseded and MUST NOT be followed. Seven command RPCs and fresh proposals 0001–0010 now exist. Read `REVIEW07_IMPLEMENTATION.md`, `REVIEW07_AUTHORIZATION.md` and `REVIEW07_TEST_MATRIX.md` first; historical Review06 findings remain useful but do not describe the revised schemas.
The real database connection is
postponed until explicit owner authorization. Do not enable Lovable Cloud or
connect Supabase automatically.

## Prerequisites before any backend work

1. Written owner authorization to connect a real database.
2. A dedicated, owner-controlled PostgreSQL test environment, fully separate
   from the Antigravity implementation.
3. Owner decisions on the OPEN items in
   `docs/OPEN_DECISIONS_AND_CONFLICTS.md` that gate implementation
   (OD-01/08/09/11/12/13 at minimum).
4. Agreement on the authorization matrix in `docs/POSTGRES_INTEGRATION.md`.

## Historical hosted connection sequence — NOT this approval scope

The steps below require a later, separately approved hosted stage; do not run them during the Review09 local SQL checkpoint.

**Current next checkpoint is approved networkless disposable container TEST ONLY**, not remote connection. See the exact owner authorization scope in `REVIEW07_IMPLEMENTATION.md`. Apply fresh proposals 0001–0010 manually as reviewed postgres creator with stop-on-error; no script connects or migrates automatically. Individual files have transactions: stop at the first failure, retain sanitized error evidence and repair/recreate the disposable environment. Do not run old Review06 permission design or old-schema upgrade assumptions. Tests reset synthetic fixtures destructively and must never target existing data. For this test stage rollback is deletion/recreation of the disposable environment, not dropping live tables. Production rollback requires separately measured backup/restore and reviewed forward repair; not tested here.

1. Owner creates a NEW dedicated project in their own Supabase organization,
   confirms project reference/region and explicit authorization for TEST only.
   Never reuse another project or any Antigravity resource.
2. In Lovable open **Settings → General → External Supabase → Connect**.
   Owner completes browser OAuth and selects that exact project. This cannot
   be linked from chat. Do not activate Lovable Cloud for this procedure.
3. Inspect generated integration files/config without overwriting custom
   middleware; verify browser publishable and server private key separation.
4. Developer closes the SQL audit blockers and submits reviewed SQL diff.
   Apply TEST ONLY in order 0001 through 0010 using
   an authorized migration operator with stop-on-error and per-file transaction.
   CURRENT files are not fit for operational activation: real PostgreSQL compilation/permissions/concurrency and unresolved posting/policy acceptance remain missing.
   `legacy/db/security/REVIEW06_PERMISSION_DESIGN.sql` is review-only, not migration 0007.
5. Provision independent synthetic Auth users, active profiles and store-bound role assignments in the disposable test project before authenticated tests.
   Follow the explicit UUID bootstrap in REVIEW06_AUTHORIZATION; no self-role
   assignment. Confirm provider/profile choices before writing real auth code.
6. Implement generated-client authenticated TanStack wrappers around the
   inactive repository/gateway; never service-role for ordinary operations.
   Replace direct demo imports via injected repository before switching modes.
7. Run real account/store/negative/concurrency/rollback tests and verify
   readback through authenticated application pages, plus direct PostgREST.
   Run a published TEST Worker smoke check; local Node is insufficient.
8. Verify backups with a measured restore into another isolated environment;
   approve RPO/RTO/maintenance under OD-16. Migration rollback is not destructive
   DROP on live data; use tested restoration or reviewed forward repair.
9. Only after test evidence and a separate production authorization: apply
   reviewed migrations, explicit owner bootstrap and activation. No operational
   offline or official document issuance before their mandatory decisions.

## What must never happen

- No privileged database function without an internal authenticated identity
  - scope check and restricted EXECUTE privileges.
- No owner purchase costs in ordinary operational API responses.
- No claim that PostgreSQL, RLS, transaction isolation or offline
  reliability is tested until it is tested against a real database.

## Private GitHub synchronization (manual, owner-authorized only)

The repository is not connected or published. When the owner authorizes a
private mirror:

1. Create a **private** GitHub repository under the owner's account.
2. Locally: `git remote add origin git@github.com:<owner>/<repo>.git`
   (use the owner's SSH key, never a shared credential).
3. Verify `.gitignore` excludes `.env*`, `node_modules/`, build output and
   any credential files: `git status --ignored`.
4. `git push -u origin main` and confirm the repository visibility is
   Private in GitHub settings.
5. Protect `main` (require review) before inviting collaborators.

Do not perform these steps without explicit owner authorization.
