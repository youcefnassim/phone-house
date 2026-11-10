import type { D1Binding } from "./sqlite/d1-port";

/**
 * Logical D1 backup to private R2, and restore into an EMPTY database.
 *
 * - Snapshot: one D1 batch (one transaction) reads the schema and every table, so the
 *   copy is consistent even if a sale is posted while the cron runs.
 * - Restore: tables first, then rows, then indexes, views and triggers. Triggers are
 *   created last so restoring never fires append-only guards or audit side effects.
 * - Verify: per-table row count and SHA-256 digest must equal the snapshot manifest.
 * D1 Time Travel (point-in-time, 30 days) remains the first recovery path; this export
 * is the independent copy outside D1. See docs/BACKUP_RESTORE_RUNBOOK.md.
 */

export const SNAPSHOT_FORMAT = "phonehouse-d1-snapshot";
export const SNAPSHOT_VERSION = 1;

export interface SchemaEntry {
  type: "table" | "index" | "view" | "trigger";
  name: string;
  sql: string;
}
export type Row = Record<string, string | number | null>;
export interface TableManifest {
  rows: number;
  sha256: string;
}
export interface Snapshot {
  format: typeof SNAPSHOT_FORMAT;
  version: typeof SNAPSHOT_VERSION;
  createdAt: string;
  environment: string;
  schema: SchemaEntry[];
  data: Record<string, Row[]>;
  manifest: Record<string, TableManifest>;
}

export interface R2Like {
  put(
    key: string,
    value: ArrayBuffer | Uint8Array | string,
    options?: {
      httpMetadata?: { contentType?: string; contentEncoding?: string };
      customMetadata?: Record<string, string>;
    },
  ): Promise<unknown>;
  get(key: string): Promise<{
    arrayBuffer(): Promise<ArrayBuffer>;
    customMetadata?: Record<string, string>;
  } | null>;
}

/** D1/SQLite internals that are never copied (wrangler's d1_migrations IS copied). */
const internal = (name: string) => /^(sqlite_|_cf_)/.test(name);
const quote = (name: string) => `"${name.replaceAll('"', '""')}"`;

async function sha256Hex(text: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function manifestOf(data: Record<string, Row[]>) {
  const manifest: Record<string, TableManifest> = {};
  for (const [table, rows] of Object.entries(data))
    manifest[table] = { rows: rows.length, sha256: await sha256Hex(JSON.stringify(rows)) };
  return manifest;
}

const schemaQuery =
  "SELECT type,name,sql FROM sqlite_master WHERE sql IS NOT NULL AND type IN ('table','index','view','trigger') ORDER BY rowid";

async function readSchema(db: D1Binding): Promise<SchemaEntry[]> {
  const { results } = await db.prepare(schemaQuery).all();
  return (results as unknown as SchemaEntry[]).filter((e) => !internal(e.name));
}

export async function takeSnapshot(
  db: D1Binding,
  environment: string,
  now = new Date(),
): Promise<Snapshot> {
  const tables = (await readSchema(db)).filter((e) => e.type === "table").map((e) => e.name);
  // Schema + every table in ONE batch = one read transaction = consistent snapshot.
  const results = await db.batch([
    db.prepare(schemaQuery),
    ...tables.map((t) => db.prepare(`SELECT * FROM ${quote(t)} ORDER BY rowid`)),
  ]);
  const schemaResult = results[0];
  if (!schemaResult || results.length !== tables.length + 1) throw new Error("BACKUP_READ_FAILED");
  const tableResults = results.slice(1);
  const schema = (schemaResult.results as unknown as SchemaEntry[]).filter(
    (e) => !internal(e.name),
  );
  const schemaTables = schema.filter((e) => e.type === "table").map((e) => e.name);
  if (schemaTables.join("\n") !== tables.join("\n")) throw new Error("BACKUP_SCHEMA_CHANGED");
  const data: Record<string, Row[]> = {};
  tables.forEach((t, i) => {
    data[t] = (tableResults[i]?.results ?? []) as Row[];
  });
  return {
    format: SNAPSHOT_FORMAT,
    version: SNAPSHOT_VERSION,
    createdAt: now.toISOString(),
    environment,
    schema,
    data,
    manifest: await manifestOf(data),
  };
}

async function gzip(text: string) {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
async function gunzip(bytes: ArrayBuffer) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  return await new Response(stream).text();
}

export function backupKey(environment: string, createdAt: string) {
  // e.g. d1/production/2026/11/2026-11-10T02-00-00-000Z.json.gz
  const stamp = createdAt.replaceAll(":", "-").replace(".", "-");
  return `d1/${environment}/${createdAt.slice(0, 4)}/${createdAt.slice(5, 7)}/${stamp}.json.gz`;
}

/** Daily cron: snapshot D1 and write it to the private BACKUPS bucket. Never deletes. */
export async function writeBackup(db: D1Binding, bucket: R2Like, environment: string, now?: Date) {
  const snapshot = await takeSnapshot(db, environment, now);
  const json = JSON.stringify(snapshot);
  const key = backupKey(environment, snapshot.createdAt);
  const totalRows = Object.values(snapshot.manifest).reduce((n, t) => n + t.rows, 0);
  await bucket.put(key, await gzip(json), {
    httpMetadata: { contentType: "application/json", contentEncoding: "gzip" },
    customMetadata: {
      format: `${SNAPSHOT_FORMAT}@${SNAPSHOT_VERSION}`,
      sha256: await sha256Hex(json),
      tables: String(Object.keys(snapshot.manifest).length),
      rows: String(totalRows),
    },
  });
  return { key, tables: Object.keys(snapshot.manifest).length, rows: totalRows };
}

/** Read a backup object back, checking the whole-file SHA-256 recorded at write time. */
export async function readBackup(bucket: R2Like, key: string): Promise<Snapshot> {
  const object = await bucket.get(key);
  if (!object) throw new Error("BACKUP_NOT_FOUND");
  return parseSnapshot(await gunzip(await object.arrayBuffer()), object.customMetadata?.["sha256"]);
}

export async function parseSnapshot(json: string, expectedSha256?: string): Promise<Snapshot> {
  if (expectedSha256 !== undefined && (await sha256Hex(json)) !== expectedSha256)
    throw new Error("BACKUP_CHECKSUM_MISMATCH");
  const snapshot = JSON.parse(json) as Snapshot;
  if (snapshot.format !== SNAPSHOT_FORMAT || snapshot.version !== SNAPSHOT_VERSION)
    throw new Error("BACKUP_FORMAT_UNSUPPORTED");
  const recomputed = await manifestOf(snapshot.data);
  for (const [table, expected] of Object.entries(snapshot.manifest)) {
    const actual = recomputed[table];
    if (!actual || actual.rows !== expected.rows || actual.sha256 !== expected.sha256)
      throw new Error(`BACKUP_TABLE_CORRUPT:${table}`);
  }
  return snapshot;
}

const literal = (v: string | number | null) =>
  v === null ? "NULL" : typeof v === "number" ? String(v) : `'${v.replaceAll("'", "''")}'`;

function insertSql(table: string, row: Row) {
  const columns = Object.keys(row);
  return `INSERT INTO ${quote(table)} (${columns.map(quote).join(",")}) VALUES (${columns
    .map(() => "?")
    .join(",")})`;
}

/** Ordered restore plan: tables, rows, then indexes/views/triggers. */
function plan(snapshot: Snapshot) {
  const tables = snapshot.schema.filter((e) => e.type === "table");
  const later = [
    ...snapshot.schema.filter((e) => e.type === "index"),
    ...snapshot.schema.filter((e) => e.type === "view"),
    ...snapshot.schema.filter((e) => e.type === "trigger"),
  ];
  return { tables, later };
}

const ROWS_PER_BATCH = 200;

/** Restore into an EMPTY D1 (scratch database). Refuses a database that already has tables. */
export async function restoreSnapshot(target: D1Binding, snapshot: Snapshot) {
  const existing = await readSchema(target);
  if (existing.length) throw new Error("RESTORE_TARGET_NOT_EMPTY");
  const { tables, later } = plan(snapshot);
  await target.batch(tables.map((e) => target.prepare(e.sql)));
  // Rows in creation order; FK checks deferred to the end of each batch.
  const inserts = tables.flatMap((e) =>
    (snapshot.data[e.name] ?? []).map((row) =>
      target.prepare(insertSql(e.name, row)).bind(...Object.values(row)),
    ),
  );
  for (let i = 0; i < inserts.length; i += ROWS_PER_BATCH)
    await target.batch([
      target.prepare("PRAGMA defer_foreign_keys = on"),
      ...inserts.slice(i, i + ROWS_PER_BATCH),
    ]);
  for (const e of later) await target.batch([target.prepare(e.sql)]);
  return verifyRestore(target, snapshot);
}

/** Row counts and per-table digests of the restored database must equal the snapshot. */
export async function verifyRestore(target: D1Binding, snapshot: Snapshot) {
  const restored = await takeSnapshot(target, snapshot.environment);
  const mismatches: string[] = [];
  for (const [table, expected] of Object.entries(snapshot.manifest)) {
    const actual = restored.manifest[table];
    if (!actual || actual.rows !== expected.rows || actual.sha256 !== expected.sha256)
      mismatches.push(table);
  }
  const schemaNames = (s: SchemaEntry[]) => s.map((e) => `${e.type}:${e.name}`).sort();
  if (schemaNames(restored.schema).join() !== schemaNames(snapshot.schema).join())
    mismatches.push("(schema)");
  return {
    ok: mismatches.length === 0,
    mismatches,
    tables: Object.keys(snapshot.manifest).length,
    rows: Object.values(restored.manifest).reduce((n, t) => n + t.rows, 0),
  };
}

/** SQL file for `wrangler d1 execute <scratch-db> --file` (same order as restoreSnapshot). */
export function snapshotToSql(snapshot: Snapshot) {
  const { tables, later } = plan(snapshot);
  const lines = ["PRAGMA defer_foreign_keys = on;"];
  for (const e of tables) lines.push(`${e.sql};`);
  for (const e of tables)
    for (const row of snapshot.data[e.name] ?? [])
      lines.push(
        `INSERT INTO ${quote(e.name)} (${Object.keys(row).map(quote).join(",")}) VALUES (${Object.values(row).map(literal).join(",")});`,
      );
  for (const e of later) lines.push(`${e.sql};`);
  return `${lines.join("\n")}\n`;
}
