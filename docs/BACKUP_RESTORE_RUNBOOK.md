# Backup and restore runbook (D1 + private R2)

Status: implemented and tested on local Miniflare only. **No Cloudflare resource has
been created or touched.** Every `wrangler` command below that has no `--local` flag acts
on real Cloudflare and needs the owner's explicit "go" for that exact resource.

## Two independent layers

| Layer             | What                                | Window                                     | Where                       |
| ----------------- | ----------------------------------- | ------------------------------------------ | --------------------------- |
| 1. D1 Time Travel | Point-in-time restore built into D1 | 30 days (Workers Paid)                     | Inside D1                   |
| 2. Daily export   | Full logical snapshot, gzip JSON    | Kept until deleted (no retention rule yet) | Private R2 bucket `BACKUPS` |

Layer 1 is the fastest way back from a bad write. Layer 2 is the copy that survives a lost
or corrupted database, and the one used for restore drills.

## Daily export (layer 2)

- Cron `0 2 * * *` (02:00 UTC = 03:00 Algeria) in `wrangler.jsonc` → Nitro hook
  `cloudflare:scheduled` (`src/backend/nitro-scheduled.ts`) → `runScheduledBackup`
  (`src/backend/scheduled.ts`) → `writeBackup` (`src/backend/backup.ts`).
- Consistency: the schema and every table are read in **one D1 batch**, i.e. one
  transaction, so a sale posted during the export is either fully in or fully out.
- Object key: `d1/<APP_ENV>/<yyyy>/<mm>/<ISO timestamp>.json.gz`.
- R2 custom metadata: `sha256` of the whole document, `tables`, `rows`, `format`.
- Inside the document: per-table `rows` and `sha256` manifest.
- The code never deletes or overwrites backups.
- Contents include password/PIN **hashes** and customer data. The bucket must stay private
  (no public access, no r2.dev URL).
- Size limit: the export holds one snapshot in Worker memory (128 MB). This is ample for two
  shops for years. If the database ever approaches ~50 MB, switch to D1's export API.

## Restore drill (scratch database only)

Never restore over the live database; `restoreSnapshot` refuses any non-empty target.

1. Download the object (real Cloudflare, owner go required):
   `wrangler r2 object get phonehouse-erp-<env>-backups/<key> --file backup.json.gz --remote`
2. Convert it to SQL. The converter checks the SHA-256 and every table digest first:
   `bun scripts/backup-to-sql.ts backup.json.gz <sha256 from metadata> > restore.sql`
3. Create a scratch D1 database (owner go required) and load the file:
   `wrangler d1 create phonehouse-erp-restore-drill`
   `wrangler d1 execute phonehouse-erp-restore-drill --remote --file restore.sql`
4. Verify the row counts against the manifest printed by step 2:
   `wrangler d1 execute phonehouse-erp-restore-drill --remote --command "SELECT count(*) FROM sales"`
5. Delete the scratch database after the drill (owner go required).

Order inside the SQL file: tables, then rows (with foreign key checks deferred), then
indexes, views and triggers. Triggers come last on purpose: guards such as
`cash_requires_open` would otherwise reject the cash movements of closed shifts, and
append-only triggers would fire on restore.

## Time Travel (layer 1)

- `wrangler d1 time-travel info phonehouse-erp-<env>`
- `wrangler d1 time-travel restore phonehouse-erp-<env> --timestamp <ISO>`

Time Travel restore **replaces the live database**. Use it only with the owner present, and
take a fresh R2 export first.

## Evidence

`src/test/backup-restore.test.ts` runs on real workerd (Miniflare D1 + R2). It covers:

- a real signed checkout, then a closed shift;
- export, read-back, and restore into an empty D1, with identical per-table counts and digests;
- append-only triggers live again on the restored copy;
- refusal of a non-empty target, a tampered object and a truncated object;
- the SQL file rebuilding the same database in SQLite with zero foreign key violations;
- the cron handler failing loudly when a binding is missing.

## Open (owner decision)

- Retention: how long to keep daily exports, to be applied as an R2 lifecycle rule.
- Whether to encrypt exports with a separate key (bucket is private either way).
- The first real restore drill on staging, after staging resources are approved.
