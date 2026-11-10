import { membershipSql } from "@/domain/permissions";
import { z } from "zod";
import { canonicalJson } from "./checkout";
import { nativeStandaloneCorrection } from "@/domain/native-operations";
import { provenanceQuery, provenanceResult } from "@/domain/native-provenance";
import type { AtomicSqlPort, IdentityVerifier, SqlStatement } from "./port";
const correction = z
  .object({
    key: z.string().min(16).max(160),
    store: z.enum(["M01", "M02"]),
    sourceId: z.string().min(1),
    supplierId: z.string().min(1).nullable(),
    reason: z.string().trim().min(1).max(500),
  })
  .strict();
/** Inactive injected native source; never trusts local role preview. */
export function createSupplierProvenanceService(
  db: AtomicSqlPort,
  verifier: IdentityVerifier,
  clock: () => number = Date.now,
) {
  async function owner(token: string) {
    const i = await verifier.verify(token);
    if (!i?.sessionId || i.expiresAt <= clock()) throw new Error("UNAUTHORIZED");
    const rows = await db.read({
      sql: `SELECT m.user_id FROM memberships m JOIN accounts a ON a.id=m.user_id JOIN sessions s ON s.user_id=a.id WHERE a.id=? AND a.active=1 AND s.id=? AND s.revoked=0 AND s.expires_at>? AND ${membershipSql("owner.read", "m").replace("store_id=?", "store_id IS NULL")}`,
      params: [i.userId, i.sessionId, clock()],
    });
    if (!rows.length) throw new Error("FORBIDDEN");
    return i;
  }
  return {
    async history(token: string, input: unknown) {
      const q = provenanceQuery.parse(input);
      const identity = await owner(token);
      const gate = `EXISTS(SELECT 1 FROM accounts a JOIN sessions s ON s.user_id=a.id JOIN memberships m ON m.user_id=a.id WHERE a.id=? AND a.active=1 AND s.id=? AND s.revoked=0 AND s.expires_at>? AND ${membershipSql("owner.read", "m").replace("store_id=?", "store_id IS NULL")})`;
      const rows = await db.read({
        sql: `SELECT r.*,s.name originalSupplierName FROM (
          SELECT r.id,'PURCHASE_LINKED' kind,COALESCE(r.phone_id,p.item_id) itemId,r.quantity,r.received_at receivedAt,r.actor_id actorId,r.reference,r.supplier_id originalSupplierId,r.store_id FROM receipt_sources r LEFT JOIN receiving rc ON rc.id=r.receiving_id LEFT JOIN purchases p ON p.id=rc.purchase_id
          UNION ALL SELECT id,'STANDALONE',item_id,quantity,received_at,actor_id,reference,supplier_id,store_id FROM standalone_receipts
        ) r LEFT JOIN suppliers s ON s.id=r.originalSupplierId WHERE r.store_id=? AND ${gate} ORDER BY r.receivedAt DESC,r.kind,r.id LIMIT ? OFFSET ?`,
        params: [
          q.store,
          identity.userId,
          identity.sessionId ?? null,
          clock(),
          q.limit + 1,
          q.offset,
        ],
      });
      const receipts = await Promise.all(
        rows.slice(0, q.limit).map(async (row) => {
          const standalone = row["kind"] === "STANDALONE";
          const reviews = await db.read({
            sql: `SELECT actor_id actorId,reviewed_at reviewedAt,reason,old_supplier_id oldSupplierId,new_supplier_id newSupplierId FROM ${standalone ? "standalone_source_reviews" : "supplier_source_reviews"} WHERE ${standalone ? "receipt_id" : "source_id"}=? AND ${gate} ORDER BY id`,
            params: [String(row["id"]), identity.userId, identity.sessionId ?? null, clock()],
          });
          const { store_id, originalSupplierId, ...rest } = row;
          return {
            ...rest,
            originalSupplierId,
            effectiveSupplierId: reviews.length
              ? reviews.at(-1)?.["newSupplierId"]
              : originalSupplierId,
            reviews,
          };
        }),
      );
      // Recheck after the multi-query assembly; a revoked owner cannot get an
      // assembled history merely because the initial precheck succeeded.
      await owner(token);
      return provenanceResult.parse({
        source: "SERVER",
        store: q.store,
        receipts,
        hasMore: rows.length > q.limit,
      });
    },
    async read(token: string, store: "M01" | "M02") {
      await owner(token);
      const linked = await db.read({
        sql: `SELECT r.*,s.name supplier_name,CASE WHEN EXISTS(SELECT 1 FROM supplier_source_reviews WHERE source_id=r.id) THEN (SELECT new_supplier_id FROM supplier_source_reviews WHERE source_id=r.id ORDER BY id DESC LIMIT 1) ELSE r.supplier_id END effective_supplier_id FROM receipt_sources r LEFT JOIN suppliers s ON s.id=r.supplier_id WHERE r.store_id=? ORDER BY r.received_at DESC`,
        params: [store],
      });
      const standalone = await db.read({
        sql: `SELECT r.*,r.id standalone_receipt_id,s.name supplier_name,CASE WHEN EXISTS(SELECT 1 FROM standalone_source_reviews WHERE receipt_id=r.id) THEN(SELECT new_supplier_id FROM standalone_source_reviews WHERE receipt_id=r.id ORDER BY id DESC LIMIT 1) ELSE r.supplier_id END effective_supplier_id FROM standalone_receipts r LEFT JOIN suppliers s ON s.id=r.supplier_id WHERE r.store_id=? ORDER BY r.received_at DESC`,
        params: [store],
      });
      return [...linked, ...standalone];
    },
    async correct(token: string, input: unknown) {
      const i = await owner(token);
      const v = correction.parse(input);
      const bytes = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(canonicalJson(v)),
      );
      const hash = Array.from(new Uint8Array(bytes), (x) => x.toString(16).padStart(2, "0")).join(
        "",
      );
      const now = clock();
      const statements: SqlStatement[] = [
        {
          sql: `INSERT OR IGNORE INTO commands(key,actor_id,store_id,operation,payload_hash,state,transaction_id,response_json,created_at) VALUES(?,?,?,'supplier.source.review',?,'STARTED',?,NULL,?)`,
          params: [v.key, i.userId, v.store, hash, v.key, now],
        },
        {
          sql: `INSERT INTO audit_events(id,command_key,actor_id,store_id,operation,at,payload_json) SELECT key,key,actor_id,store_id,operation,?,? FROM commands WHERE key=? AND state='STARTED'`,
          params: [now, canonicalJson(v), v.key],
        },
        {
          sql: `INSERT INTO command_guards SELECT ?,CASE WHEN actor_id=? AND store_id=? AND payload_hash=? AND operation='supplier.source.review' THEN 1 ELSE 0 END FROM commands WHERE key=?`,
          params: [v.key, i.userId, v.store, hash, v.key],
        },
        {
          sql: `INSERT INTO command_guards VALUES(?,CASE WHEN EXISTS(SELECT 1 FROM memberships m JOIN accounts a ON a.id=m.user_id JOIN sessions s ON s.user_id=a.id WHERE a.id=? AND a.active=1 AND s.id=? AND s.revoked=0 AND s.expires_at>? AND ${membershipSql("owner.read", "m").replace("store_id=?", "store_id IS NULL")}) THEN 1 ELSE 0 END)`,
          params: [v.key, i.userId, i.sessionId ?? null, now],
        },
        {
          sql: `INSERT INTO command_guards VALUES(?,CASE WHEN EXISTS(SELECT 1 FROM receipt_sources WHERE id=? AND store_id=?) THEN 1 ELSE 0 END)`,
          params: [v.key, v.sourceId, v.store],
        },
        {
          sql: `INSERT INTO command_guards VALUES(?,CASE WHEN ? IS NULL OR EXISTS(SELECT 1 FROM suppliers WHERE id=? AND store_id=?) THEN 1 ELSE 0 END)`,
          params: [v.key, v.supplierId, v.supplierId, v.store],
        },
        {
          sql: `INSERT INTO supplier_source_reviews(source_id,command_key,old_supplier_id,new_supplier_id,actor_id,reviewed_at,reason) SELECT r.id,?,CASE WHEN EXISTS(SELECT 1 FROM supplier_source_reviews WHERE source_id=r.id) THEN (SELECT new_supplier_id FROM supplier_source_reviews WHERE source_id=r.id ORDER BY id DESC LIMIT 1) ELSE r.supplier_id END,?,?,?,? FROM receipt_sources r WHERE r.id=? AND EXISTS(SELECT 1 FROM commands WHERE key=? AND state='STARTED')`,
          params: [v.key, v.supplierId, i.userId, now, v.reason, v.sourceId, v.key],
        },
        {
          sql: `UPDATE commands SET state='DONE',response_json=? WHERE key=? AND state='STARTED'`,
          params: [JSON.stringify({ key: v.key, status: "RECORDED" }), v.key],
        },
        { sql: `DELETE FROM command_guards WHERE key=?`, params: [v.key] },
      ];
      if (db.capabilities?.atomicBatch !== true) throw new Error("ATOMIC_BATCH_REQUIRED");
      await db.batch(statements);
      return { key: v.key, status: "RECORDED" as const };
    },
    // Owner-only append-only correction of a STANDALONE receipt's supplier.
    // The original receipt row is immutable (APPEND_ONLY triggers); each review
    // records old/new supplier, actor, time and mandatory reason.
    async correctStandalone(token: string, input: unknown) {
      const i = await owner(token);
      const v = nativeStandaloneCorrection.parse(input);
      const bytes = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(canonicalJson(v)),
      );
      const hash = Array.from(new Uint8Array(bytes), (x) => x.toString(16).padStart(2, "0")).join(
        "",
      );
      const now = clock();
      const statements: SqlStatement[] = [
        {
          sql: `INSERT OR IGNORE INTO commands(key,actor_id,store_id,operation,payload_hash,state,transaction_id,response_json,created_at) VALUES(?,?,?,'supplier.standalone.review',?,'STARTED',?,NULL,?)`,
          params: [v.key, i.userId, v.store, hash, v.key, now],
        },
        {
          sql: `INSERT INTO audit_events(id,command_key,actor_id,store_id,operation,at,payload_json) SELECT key,key,actor_id,store_id,operation,?,? FROM commands WHERE key=? AND state='STARTED'`,
          params: [now, canonicalJson(v), v.key],
        },
        {
          sql: `INSERT INTO command_guards SELECT ?,CASE WHEN actor_id=? AND store_id=? AND payload_hash=? AND operation='supplier.standalone.review' THEN 1 ELSE 0 END FROM commands WHERE key=?`,
          params: [v.key, i.userId, v.store, hash, v.key],
        },
        {
          sql: `INSERT INTO command_guards VALUES(?,CASE WHEN EXISTS(SELECT 1 FROM memberships m JOIN accounts a ON a.id=m.user_id JOIN sessions s ON s.user_id=a.id WHERE a.id=? AND a.active=1 AND s.id=? AND s.revoked=0 AND s.expires_at>? AND ${membershipSql("owner.read", "m").replace("store_id=?", "store_id IS NULL")}) THEN 1 ELSE 0 END)`,
          params: [v.key, i.userId, i.sessionId ?? null, now],
        },
        {
          sql: `INSERT INTO command_guards VALUES(?,CASE WHEN EXISTS(SELECT 1 FROM standalone_receipts WHERE id=? AND store_id=?) THEN 1 ELSE 0 END)`,
          params: [v.key, v.receiptId, v.store],
        },
        {
          sql: `INSERT INTO command_guards VALUES(?,CASE WHEN ? IS NULL OR EXISTS(SELECT 1 FROM suppliers WHERE id=? AND store_id=?) THEN 1 ELSE 0 END)`,
          params: [v.key, v.supplierId, v.supplierId, v.store],
        },
        {
          sql: `INSERT INTO standalone_source_reviews(receipt_id,command_key,old_supplier_id,new_supplier_id,actor_id,reviewed_at,reason) SELECT r.id,?,CASE WHEN EXISTS(SELECT 1 FROM standalone_source_reviews WHERE receipt_id=r.id) THEN (SELECT new_supplier_id FROM standalone_source_reviews WHERE receipt_id=r.id ORDER BY id DESC LIMIT 1) ELSE r.supplier_id END,?,?,?,? FROM standalone_receipts r WHERE r.id=? AND EXISTS(SELECT 1 FROM commands WHERE key=? AND state='STARTED')`,
          params: [v.key, v.supplierId, i.userId, now, v.reason, v.receiptId, v.key],
        },
        {
          sql: `UPDATE commands SET state='DONE',response_json=? WHERE key=? AND state='STARTED'`,
          params: [JSON.stringify({ key: v.key, status: "RECORDED" }), v.key],
        },
        { sql: `DELETE FROM command_guards WHERE key=?`, params: [v.key] },
      ];
      if (db.capabilities?.atomicBatch !== true) throw new Error("ATOMIC_BATCH_REQUIRED");
      await db.batch(statements);
      return { key: v.key, status: "RECORDED" as const };
    },
  };
}
