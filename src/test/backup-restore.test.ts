// @vitest-environment node
import { describe, expect, it } from "vitest";
import { localD1AdapterHarness } from "./local-d1-adapter-harness";
import {
  backupKey,
  readBackup,
  restoreSnapshot,
  snapshotToSql,
  writeBackup,
  type R2Like,
} from "@/backend/backup";
import { runScheduledBackup } from "@/backend/scheduled";

/** Miniflare R2 binding, narrowed to what the test uses. */
interface Bucket extends R2Like {
  head(key: string): Promise<{ customMetadata?: Record<string, string> } | null>;
  list(o: { prefix: string }): Promise<{ objects: unknown[] }>;
}

const native = process.getBuiltinModule("module").createRequire(`${process.cwd()}/package.json`);
const { DatabaseSync } = native("node:sqlite") as typeof import("node:sqlite");

const phone = "11111111-1111-4111-8111-111111111111";
const shift = "33333333-3333-4333-8333-333333333333";
const at = new Date("2026-11-10T02:00:00.000Z");

type H = Awaited<ReturnType<typeof localD1AdapterHarness>>;
const bucket = (h: H) => h.backups as unknown as Bucket;
/** Real signed checkout over HTTP so sales, cash, warranty and audit rows all exist. */
async function seedSale(h: H) {
  await h.db.exec(
    `INSERT INTO catalog VALUES('model','phone','MODEL','Phone','{"condition":"NEW"}');INSERT INTO prices VALUES('M01','model',10000);INSERT INTO phones(id,store_id,catalog_id,barcode,state,attributes_json,serial) VALUES('${phone}','M01','model','UNIT','AVAILABLE','{}','SN');INSERT INTO phone_identifiers VALUES('490154203237518','${phone}',1);INSERT INTO drawers VALUES('d','M01');INSERT INTO shifts VALUES('${shift}','M01','d','s1','OPEN',100000,NULL)`,
  );
  const { repository } = await h.repository("owner");
  await repository.checkout({
    contractVersion: "native-pos-2026-11-07",
    idempotencyKey: "backup-original-sale-key",
    clientRequestId: crypto.randomUUID(),
    payload: {
      store: "M01",
      shiftId: shift,
      buyer: { surname: "Buyer", givenName: "Name", contact: "0555555555" },
      lines: [{ kind: "phone", itemId: phone, quantity: "1" }],
      tender: "Cash",
      tenderedAmount: "100",
      warranties: [{ itemId: phone, requested: true, provider: "MANUFACTURER", months: 12 }],
    },
  });
  // Close the shift: its cash movements must still restore although the
  // cash_requires_open trigger would reject them on a live insert.
  await h.db.exec(`UPDATE shifts SET state='CLOSED' WHERE id='${shift}'`);
}
const count = async (db: H["db"], table: string) =>
  Number(await db.prepare(`SELECT count(*) n FROM ${table}`).first("n"));

describe("D1 backup to private R2 and restore into a scratch database", () => {
  it("daily export restores into an empty D1 with identical row counts and digests; triggers come back", async () => {
    const h = await localD1AdapterHarness();
    try {
      await seedSale(h);
      const written = await writeBackup(h.db, bucket(h), "test", at);
      expect(written.key).toBe(backupKey("test", at.toISOString()));
      expect(written.key).toBe("d1/test/2026/11/2026-11-10T02-00-00-000Z.json.gz");
      const head = await bucket(h).head(written.key);
      expect(head?.customMetadata?.["rows"]).toBe(String(written.rows));

      const snapshot = await readBackup(bucket(h), written.key);
      expect(snapshot.manifest["sales"]?.rows).toBe(1);
      expect(snapshot.manifest["cash_movements"]?.rows).toBeGreaterThan(0);
      expect(snapshot.manifest["audit_events"]?.rows).toBeGreaterThan(0);

      const result = await restoreSnapshot(h.restore, snapshot);
      expect(result).toMatchObject({ ok: true, mismatches: [], rows: written.rows });
      for (const table of [
        "sales",
        "cash_movements",
        "audit_events",
        "warranty_requests",
        "accounts",
      ])
        expect(await count(h.restore, table)).toBe(await count(h.db, table));
      // Append-only guards are live again on the restored copy.
      await expect(h.restore.exec("DELETE FROM audit_events")).rejects.toThrow(/APPEND_ONLY/);
      await expect(h.restore.exec("UPDATE cash_movements SET amount_minor=0")).rejects.toThrow(
        /APPEND_ONLY/,
      );
      // Never restores over an existing database.
      await expect(restoreSnapshot(h.restore, snapshot)).rejects.toThrow(
        "RESTORE_TARGET_NOT_EMPTY",
      );
    } finally {
      await h.dispose();
    }
  }, 60000);

  it("a tampered or truncated backup object is refused before any restore", async () => {
    const h = await localD1AdapterHarness();
    try {
      await seedSale(h);
      const { key } = await writeBackup(h.db, bucket(h), "test", at);
      const original = await bucket(h).get(key);
      const bytes = new Uint8Array(await original!.arrayBuffer());
      const meta = original!.customMetadata ?? {};
      // Re-compress a modified document but keep the original checksum.
      const json = await new Response(
        new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip")),
      ).text();
      const forged = json.replace('"amount_minor":10000', '"amount_minor":1');
      expect(forged).not.toBe(json);
      const gz = new Uint8Array(
        await new Response(
          new Blob([forged]).stream().pipeThrough(new CompressionStream("gzip")),
        ).arrayBuffer(),
      );
      await bucket(h).put("forged.json.gz", gz, { customMetadata: meta });
      await expect(readBackup(bucket(h), "forged.json.gz")).rejects.toThrow(
        "BACKUP_CHECKSUM_MISMATCH",
      );
      await bucket(h).put("cut.json.gz", bytes.slice(0, bytes.length / 2), {
        customMetadata: meta,
      });
      await expect(readBackup(bucket(h), "cut.json.gz")).rejects.toThrow();
      await expect(readBackup(bucket(h), "missing")).rejects.toThrow("BACKUP_NOT_FOUND");
      expect(await count(h.restore, "sqlite_master")).toBe(0);
    } finally {
      await h.dispose();
    }
  }, 60000);

  it("SQL file for `wrangler d1 execute` rebuilds the same database in SQLite", async () => {
    const h = await localD1AdapterHarness();
    try {
      await seedSale(h);
      const { key } = await writeBackup(h.db, bucket(h), "test", at);
      const snapshot = await readBackup(bucket(h), key);
      const sqlite = new DatabaseSync(":memory:");
      sqlite.exec("PRAGMA foreign_keys=ON");
      sqlite.exec(snapshotToSql(snapshot));
      for (const [table, m] of Object.entries(snapshot.manifest))
        expect(
          (sqlite.prepare(`SELECT count(*) n FROM "${table}"`).get() as { n: number }).n,
          table,
        ).toBe(m.rows);
      expect(sqlite.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
      sqlite.close();
    } finally {
      await h.dispose();
    }
  }, 60000);

  it("cron handler writes one backup and fails loudly when a binding is missing", async () => {
    const h = await localD1AdapterHarness();
    try {
      await seedSale(h);
      const out = await runScheduledBackup(
        { DB: h.db, BACKUPS: bucket(h), APP_ENV: "staging" },
        at,
      );
      expect(out.key).toBe("d1/staging/2026/11/2026-11-10T02-00-00-000Z.json.gz");
      expect((await bucket(h).list({ prefix: "d1/staging/" })).objects).toHaveLength(1);
      await expect(runScheduledBackup({ DB: h.db, APP_ENV: "staging" }, at)).rejects.toThrow(
        "BACKUP_NOT_CONFIGURED",
      );
      await expect(runScheduledBackup({ DB: h.db, BACKUPS: bucket(h) }, at)).rejects.toThrow(
        "BACKUP_NOT_CONFIGURED",
      );
    } finally {
      await h.dispose();
    }
  }, 60000);
});
