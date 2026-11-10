import { membershipSql } from "@/domain/permissions";
import { nativeReceiving } from "@/domain/native-receiving";
import { normalizedBuyer } from "@/domain/sales-review";
import { canonicalJson } from "./checkout";
import type { SqlStatement, VerifiedIdentity } from "./port";
export function planStandaloneReceiving(
  input: unknown,
  i: VerifiedIdentity,
  hash: string,
  tx: string,
  now: number,
): SqlStatement[] {
  const v = nativeReceiving.parse(input);
  if (!i.sessionId || i.expiresAt <= now) throw new Error("UNAUTHORIZED");
  if (!/^[a-f0-9]{64}$/.test(hash)) throw new Error("HASH_REQUIRED");
  const out: SqlStatement[] = [];
  const add = (sql: string, ...params: SqlStatement["params"]) => out.push({ sql, params });
  const pending = `EXISTS(SELECT 1 FROM commands WHERE key=? AND state='STARTED')`;
  const write = (sql: string, ...params: SqlStatement["params"]) => add(sql, ...params, v.key);
  const guard = (sql: string, ...params: SqlStatement["params"]) =>
    write(
      `INSERT INTO command_guards SELECT ?,CASE WHEN (${sql}) THEN 1 ELSE 0 END WHERE ${pending}`,
      v.key,
      ...params,
    );
  add(
    `INSERT OR IGNORE INTO commands(key,actor_id,store_id,operation,payload_hash,state,transaction_id,response_json,created_at) VALUES(?,?,?,'stock.standalone',?,'STARTED',?,NULL,?)`,
    v.key,
    i.userId,
    v.store,
    hash,
    tx,
    now,
  );
  add(
    `INSERT INTO command_guards SELECT ?,CASE WHEN actor_id=? AND store_id=? AND operation='stock.standalone' AND payload_hash=? THEN 1 ELSE 0 END FROM commands WHERE key=?`,
    v.key,
    i.userId,
    v.store,
    hash,
    v.key,
  );
  // Authentication is checked even for completed key readback.
  add(
    `INSERT INTO command_guards VALUES(?,CASE WHEN EXISTS(SELECT 1 FROM accounts a JOIN sessions s ON s.user_id=a.id JOIN memberships m ON m.user_id=a.id WHERE a.id=? AND a.active=1 AND s.id=? AND s.revoked=0 AND s.expires_at>? AND ${membershipSql("stock.standalone", "m")}) THEN 1 ELSE 0 END)`,
    v.key,
    i.userId,
    i.sessionId,
    now,
    v.store,
  );
  guard(
    `EXISTS(SELECT 1 FROM catalog WHERE id=? AND ((kind='phone' AND ?=? AND ?>0) OR(kind='accessory' AND ?=0)))`,
    v.itemId,
    v.phones.length,
    v.quantity,
    v.quantity,
    v.phones.length,
  );
  let supplier = v.supplierId ?? null;
  if (v.newSupplierName) {
    supplier = `supplier-${tx}`;
    // Dedup key folds case/whitespace/accents/Arabic tatweel (same folding as
    // customer keys); lower(trim(name)) keeps matching legacy rows without a
    // key. Genuinely different names never merge.
    const normalized = normalizedBuyer(v.newSupplierName);
    const legacy = v.newSupplierName.trim().toLowerCase();
    write(
      `INSERT INTO suppliers(id,store_id,name,reference,name_key) SELECT ?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM suppliers WHERE store_id=? AND (name_key=? OR lower(trim(name))=?)) AND ${pending}`,
      supplier,
      v.store,
      v.newSupplierName,
      `SOURCE-${tx}`,
      normalized,
      v.store,
      normalized,
      legacy,
    );
  }
  if (supplier && !v.newSupplierName)
    guard(`EXISTS(SELECT 1 FROM suppliers WHERE id=? AND store_id=?)`, supplier, v.store);
  const source = v.newSupplierName
    ? `(SELECT id FROM suppliers WHERE store_id=? AND (id=? OR name_key=? OR lower(trim(name))=?) ORDER BY id=? DESC LIMIT 1)`
    : "?";
  const supplierParams = v.newSupplierName
    ? [
        v.store,
        supplier,
        normalizedBuyer(v.newSupplierName),
        v.newSupplierName.trim().toLowerCase(),
        supplier,
      ]
    : [supplier];
  write(
    `INSERT INTO standalone_receipts SELECT ?,?,?,?,${source},?,?,?,? WHERE ${pending}`,
    tx,
    v.key,
    v.store,
    v.itemId,
    ...supplierParams,
    v.quantity,
    now,
    i.userId,
    v.reference,
  );
  const json = JSON.stringify(
    v.phones.map((p) => ({
      ...p,
      attributes: { ...p.attributes, packaging: p.attributes["packaging"] ?? "UNKNOWN" },
    })),
  );
  write(
    `INSERT INTO phones(id,store_id,catalog_id,barcode,state,attributes_json,serial) SELECT json_extract(value,'$.id'),?, ?,json_extract(value,'$.barcode'),'AVAILABLE',json_extract(value,'$.attributes'),json_extract(value,'$.serial') FROM json_each(?) WHERE ${pending}`,
    v.store,
    v.itemId,
    json,
  );
  for (const slot of [1, 2])
    write(
      `INSERT INTO phone_identifiers SELECT json_extract(value,'$.imei${slot}'),json_extract(value,'$.id'),${slot} FROM json_each(?) WHERE json_extract(value,'$.imei${slot}') IS NOT NULL AND ${pending}`,
      json,
    );
  write(
    `INSERT INTO standalone_phone_receipts SELECT json_extract(value,'$.id'),? FROM json_each(?) WHERE ${pending}`,
    tx,
    json,
  );
  write(
    `INSERT INTO accessory_balances SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM catalog WHERE id=? AND kind='accessory') AND ${pending} ON CONFLICT(store_id,item_id) DO UPDATE SET quantity=quantity+excluded.quantity`,
    v.store,
    v.itemId,
    v.quantity,
    v.itemId,
  );
  write(
    `INSERT INTO stock_movements SELECT ?||':'||json_extract(value,'$.id'),?,?,json_extract(value,'$.id'),1,'RECEIPT' FROM json_each(?) WHERE ${pending}`,
    tx,
    v.key,
    v.store,
    json,
  );
  write(
    `INSERT INTO stock_movements SELECT ?,?,?,?,?,'RECEIPT' WHERE EXISTS(SELECT 1 FROM catalog WHERE id=? AND kind='accessory') AND ${pending}`,
    tx,
    v.key,
    v.store,
    v.itemId,
    v.quantity,
    v.itemId,
  );
  write(
    `INSERT INTO audit_events(id,command_key,actor_id,store_id,operation,at,payload_json) SELECT ?,?,?,?,'stock.standalone',?,? WHERE ${pending}`,
    tx,
    v.key,
    i.userId,
    v.store,
    now,
    canonicalJson(v),
  );
  add(
    `UPDATE commands SET state='DONE',response_json=json_object('key',key,'transactionId',transaction_id,'status','RECORDED') WHERE key=? AND state='STARTED'`,
    v.key,
  );
  add(`DELETE FROM command_guards WHERE key=?`, v.key);
  add(`SELECT response_json FROM commands WHERE key=? AND state='DONE'`, v.key);
  return out;
}
