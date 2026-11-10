import type { AtomicSqlPort, SqlResult } from "./port";
export interface D1Statement {
  bind(...values: (string | number | null)[]): D1Statement;
  all(): Promise<{ results: Record<string, unknown>[]; meta: { changes: number } }>;
}
export interface D1Binding {
  prepare(sql: string): D1Statement;
  batch(
    statements: D1Statement[],
  ): Promise<{ results: Record<string, unknown>[]; meta: { changes: number } }[]>;
}
/** D1 batch is sequential and atomic; never issue BEGIN/COMMIT via D1. */
export function createD1Port(binding: D1Binding): AtomicSqlPort {
  return {
    capabilities: { atomicBatch: true },
    read: async (s) =>
      (
        await binding
          .prepare(s.sql)
          .bind(...s.params)
          .all()
      ).results,
    batch: async (statements) => {
      const results = await binding.batch(
        statements.map((s) => binding.prepare(s.sql).bind(...s.params)),
      );
      return results.map((r): SqlResult => ({ rows: r.results, changes: r.meta.changes }));
    },
  };
}
