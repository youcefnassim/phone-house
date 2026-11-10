import type { DatabaseSync as SqliteDatabase } from "node:sqlite";
import type { AtomicSqlPort, SqlStatement } from "@/backend/sqlite/port";
import { sqliteMigrations } from "./sqlite-migrations";
const native = process.getBuiltinModule("module").createRequire(`${process.cwd()}/package.json`);
const { DatabaseSync } = native("node:sqlite") as typeof import("node:sqlite");
const { readFileSync } = native("node:fs") as typeof import("node:fs");
export function sqliteHarness() {
  const db: SqliteDatabase = new DatabaseSync(":memory:");
  for (const file of sqliteMigrations) db.exec(readFileSync(`db/sqlite/${file}`, "utf8"));
  const run = (plan: SqlStatement[]) => {
    db.exec("BEGIN IMMEDIATE");
    try {
      const result = plan.map((s) => {
        const st = db.prepare(s.sql);
        if (s.sql.startsWith("SELECT"))
          return { rows: st.all(...s.params) as Record<string, unknown>[], changes: 0 };
        return { rows: [], changes: Number(st.run(...s.params).changes) };
      });
      db.exec("COMMIT");
      return result;
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  };
  const port: AtomicSqlPort = {
    capabilities: { atomicBatch: true },
    batch: async (p) => run(p),
    read: async (s) => db.prepare(s.sql).all(...s.params) as Record<string, unknown>[],
  };
  return { db, run, port };
}
