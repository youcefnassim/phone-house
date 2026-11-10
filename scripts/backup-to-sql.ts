// Usage: bun scripts/backup-to-sql.ts <backup.json.gz> <sha256-from-R2-metadata> > restore.sql
// Verifies the whole-file SHA-256 and every table digest, prints SQL on stdout and the
// row-count manifest on stderr. Local only: talks to no Cloudflare service.
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { parseSnapshot, snapshotToSql } from "../src/backend/backup";

const [file, sha256] = process.argv.slice(2);
if (!file || !sha256) {
  console.error("usage: bun scripts/backup-to-sql.ts <backup.json.gz> <sha256>");
  process.exit(2);
}
const snapshot = await parseSnapshot(gunzipSync(readFileSync(file)).toString("utf8"), sha256);
process.stdout.write(snapshotToSql(snapshot));
console.error(`snapshot ${snapshot.environment} ${snapshot.createdAt}`);
for (const [table, m] of Object.entries(snapshot.manifest)) console.error(`${m.rows}\t${table}`);
