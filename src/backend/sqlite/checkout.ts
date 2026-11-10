import { membershipSql } from "@/domain/permissions";
import { transactionEnvelope, transactionPayloads } from "@/domain/transaction-contracts";
import type { SqlStatement, VerifiedIdentity } from "./port";

export function toCentimes(value: string): number {
  if (!/^[0-9]+(\.[0-9]{1,2})?$/.test(value)) throw new Error("INVALID_MONEY");
  const [a = "0", b = ""] = value.split(".");
  const minor = BigInt(a) * 100n + BigInt(b.padEnd(2, "0"));
  if (minor > 99999999999999n) throw new Error("MONEY_BOUND");
  return Number(minor);
}
export function fromCentimes(value: number): string {
  if (!Number.isSafeInteger(value) || value < 0 || value > 99999999999999)
    throw new Error("INVALID_CENTIMES");
  const minor = BigInt(value);
  return `${minor / 100n}.${(minor % 100n).toString().padStart(2, "0")}`;
}
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`)
      .join(",")}}`;
  return JSON.stringify(value) ?? "null";
}
/** Explicit composition points for the retail checkout; no SQL string patching. */
export interface CheckoutPlanOptions {
  /** Replaces the default existing-customer guard (placed right after the shift guard). */
  customerStatements?: SqlStatement[];
  /** Inserted immediately before the command completion statement. */
  beforeCompletion?: SqlStatement[];
  /** Include the idempotency key in the stored response. */
  responseKey?: boolean;
  /** Canonical payload recorded in the audit event (defaults to the parsed envelope). */
  auditPayload?: string;
}
export function planCheckout(
  input: unknown,
  identity: VerifiedIdentity,
  payloadHash: string,
  transactionId: string,
  now: number,
  options: CheckoutPlanOptions = {},
): SqlStatement[] {
  if (identity.expiresAt <= now) throw new Error("AUTH_EXPIRED");
  if (!identity.sessionId) throw new Error("SESSION_REQUIRED");
  const envelope = transactionEnvelope.parse(input);
  const p = transactionPayloads["pos.checkout"].parse(envelope.payload);
  if (!/^[a-f0-9]{64}$/.test(payloadHash)) throw new Error("HASH_REQUIRED");
  const quantities = new Map<
    string,
    { itemId: string; kind: "phone" | "accessory"; quantity: number }
  >();
  for (const line of p.lines) {
    const key = `${line.kind}:${line.itemId}`;
    const previous = quantities.get(key);
    if (line.kind === "phone" && (previous || line.quantity !== "1"))
      throw new Error("DUPLICATE_PHONE");
    const quantity = (previous?.quantity ?? 0) + Number(line.quantity);
    if (quantity > 2147483647) throw new Error("QUANTITY_BOUND");
    quantities.set(key, { itemId: line.itemId, kind: line.kind, quantity });
  }
  const credit = toCentimes(p.creditAmount ?? "0");
  const discount = toCentimes(p.discountAmount ?? "0");
  const bank = p.bankAmount === undefined ? null : toCentimes(p.bankAmount);
  const cash = p.cashAmount === undefined ? null : toCentimes(p.cashAmount);
  if (p.tender === "Split" && (bank === null || cash === null || !p.bankMethod))
    throw new Error("PAYMENT_MISMATCH");
  const key = envelope.idempotencyKey,
    actor = identity.userId;
  const statements: SqlStatement[] = [];
  const add = (sql: string, ...params: SqlStatement["params"]) => statements.push({ sql, params });
  const pending = `EXISTS(SELECT 1 FROM commands WHERE key=? AND state='STARTED')`;
  const guard = (condition: string, params: SqlStatement["params"]) =>
    add(
      `INSERT INTO command_guards(key,ok) SELECT ?,CASE WHEN (${condition}) THEN 1 ELSE 0 END WHERE ${pending}`,
      key,
      ...params,
      key,
    );
  add(
    `INSERT OR IGNORE INTO commands(key,actor_id,store_id,operation,payload_hash,state,transaction_id,created_at) VALUES(?,?,?,'pos.checkout',?,'STARTED',?,?)`,
    key,
    actor,
    p.store,
    payloadHash,
    transactionId,
    now,
  );
  // Replay must satisfy identity and payload binding too. Deliberate CHECK
  // failure rolls back the entire batch; zero affected rows alone never reject.
  add(
    `INSERT INTO command_guards(key,ok) SELECT ?,CASE WHEN actor_id=? AND store_id=? AND operation='pos.checkout' AND payload_hash=? THEN 1 ELSE 0 END FROM commands WHERE key=?`,
    key,
    actor,
    p.store,
    payloadHash,
    key,
  );
  // Revalidate active account and actual Seller membership within the batch.
  add(
    `INSERT INTO command_guards(key,ok) VALUES(?,CASE WHEN EXISTS(SELECT 1 FROM accounts a JOIN memberships m ON m.user_id=a.id WHERE a.id=? AND a.active=1 AND ${membershipSql("pos.checkout", "m")}) THEN 1 ELSE 0 END)`,
    key,
    actor,
    p.store,
  );
  if (identity.sessionId)
    add(
      `INSERT INTO command_guards VALUES(?,CASE WHEN EXISTS(SELECT 1 FROM sessions WHERE id=? AND user_id=? AND revoked=0 AND expires_at>?) THEN 1 ELSE 0 END)`,
      key,
      identity.sessionId,
      actor,
      now,
    );
  guard(`EXISTS(SELECT 1 FROM shifts WHERE id=? AND store_id=? AND state='OPEN')`, [
    p.shiftId,
    p.store,
  ]);
  if (options.customerStatements) statements.push(...options.customerStatements);
  else if (p.customerId)
    guard(`EXISTS(SELECT 1 FROM customers WHERE id=? AND store_id=? AND length(trim(name))>0)`, [
      p.customerId,
      p.store,
    ]);
  const linesJson = JSON.stringify([...quantities.values()]);
  guard(
    `NOT EXISTS(SELECT 1 FROM json_each(?) j LEFT JOIN phones ph ON json_extract(j.value,'$.kind')='phone' AND ph.id=json_extract(j.value,'$.itemId') LEFT JOIN prices pr ON pr.store_id=? AND pr.item_id=CASE WHEN json_extract(j.value,'$.kind')='phone' THEN ph.catalog_id ELSE json_extract(j.value,'$.itemId') END LEFT JOIN accessory_balances b ON b.store_id=? AND b.item_id=json_extract(j.value,'$.itemId') WHERE pr.amount_minor IS NULL OR (json_extract(j.value,'$.kind')='phone' AND(ph.id IS NULL OR ph.store_id<>? OR ph.state<>'AVAILABLE' OR (NOT EXISTS(SELECT 1 FROM phone_identifiers WHERE phone_id=ph.id AND slot=1) AND length(trim(COALESCE(ph.serial,'')))=0))) OR (json_extract(j.value,'$.kind')='accessory' AND(b.quantity IS NULL OR b.quantity<json_extract(j.value,'$.quantity'))))`,
    [linesJson, p.store, p.store, p.store],
  );
  const subtotalSql = `(SELECT sum(pr.amount_minor*json_extract(j.value,'$.quantity')) FROM json_each(?) j LEFT JOIN phones ph ON json_extract(j.value,'$.kind')='phone' AND ph.id=json_extract(j.value,'$.itemId') JOIN prices pr ON pr.store_id=? AND pr.item_id=CASE WHEN json_extract(j.value,'$.kind')='phone' THEN ph.catalog_id ELSE json_extract(j.value,'$.itemId') END)`;
  const totalSql = `${subtotalSql}-?`;
  const limitSql = `(SELECT CASE WHEN instr(json_extract(value_json,'$'),'.')=0 THEN CAST(json_extract(value_json,'$') AS INTEGER)*100 ELSE CAST(substr(json_extract(value_json,'$'),1,instr(json_extract(value_json,'$'),'.')-1) AS INTEGER)*100+CAST(substr(substr(json_extract(value_json,'$'),instr(json_extract(value_json,'$'),'.')+1)||'00',1,2) AS INTEGER) END FROM app_settings WHERE key='pos.discountLimitDzd' AND json_extract(value_json,'$')<>'')`;
  guard(
    `?=0 OR (${limitSql} IS NOT NULL AND (?<=${limitSql} OR EXISTS(SELECT 1 FROM memberships WHERE user_id=? AND role='SUPER_ADMIN' AND store_id='GLOBAL')))`,
    [discount, discount, actor],
  );
  if (credit > 0)
    guard(
      `EXISTS(SELECT 1 FROM memberships WHERE user_id=? AND ${membershipSql("credit.checkout")})`,
      [actor, p.store],
    );
  if (p.tender === "Split")
    guard(`?+?+?=${totalSql} AND ?>=?`, [
      cash,
      bank,
      credit,
      linesJson,
      p.store,
      discount,
      toCentimes(p.tenderedAmount),
      cash,
    ]);
  add(
    `INSERT INTO sales(id,command_key,store_id,shift_id,seller_id,customer_id,total_minor,tender,tendered_minor,change_minor,bank_reference)
 SELECT ?,?,?,?,?,?,sum(pr.amount_minor*json_extract(j.value,'$.quantity'))-?,?,?,CASE WHEN ?='Bank' THEN 0 WHEN ?='Split' THEN ?-? ELSE ?-(sum(pr.amount_minor*json_extract(j.value,'$.quantity'))-?-?) END,NULL
 FROM json_each(?) j LEFT JOIN phones ph ON json_extract(j.value,'$.kind')='phone' AND ph.id=json_extract(j.value,'$.itemId') JOIN prices pr ON pr.store_id=? AND pr.item_id=CASE WHEN json_extract(j.value,'$.kind')='phone' THEN ph.catalog_id ELSE json_extract(j.value,'$.itemId') END WHERE ${pending} HAVING count(*)>0`,
    transactionId,
    key,
    p.store,
    p.shiftId,
    actor,
    p.customerId ?? null,
    discount,
    p.tender === "Bank" ? "Bank" : "Cash",
    p.tender === "Split"
      ? Number((cash ?? 0) + (bank ?? 0) + toCentimes(p.tenderedAmount) - (cash ?? 0) + credit)
      : toCentimes(p.tenderedAmount) + credit,
    p.tender,
    p.tender,
    toCentimes(p.tenderedAmount),
    cash ?? 0,
    toCentimes(p.tenderedAmount),
    discount,
    credit,
    linesJson,
    p.store,
    key,
  );
  add(
    `INSERT INTO sale_settlements SELECT id,CASE WHEN ?='Bank' THEN 0 WHEN ?='Split' THEN ? ELSE total_minor-? END,CASE WHEN ?='Bank' THEN total_minor-? WHEN ?='Split' THEN ? ELSE 0 END,CASE WHEN ?='Bank' THEN 0 ELSE ? END,?,?,?,${limitSql} FROM sales WHERE command_key=? AND ${pending}`,
    p.tender,
    p.tender,
    cash ?? 0,
    credit,
    p.tender,
    credit,
    p.tender,
    bank ?? 0,
    p.tender,
    toCentimes(p.tenderedAmount),
    p.bankMethod ?? null,
    discount,
    actor,
    key,
    key,
  );
  add(
    `INSERT INTO sale_lines(sale_id,item_id,kind,quantity,unit_minor) SELECT s.id,json_extract(j.value,'$.itemId'),json_extract(j.value,'$.kind'),json_extract(j.value,'$.quantity'),pr.amount_minor FROM sales s,json_each(?) j LEFT JOIN phones ph ON json_extract(j.value,'$.kind')='phone' AND ph.id=json_extract(j.value,'$.itemId') JOIN prices pr ON pr.store_id=? AND pr.item_id=CASE WHEN json_extract(j.value,'$.kind')='phone' THEN ph.catalog_id ELSE json_extract(j.value,'$.itemId') END WHERE s.command_key=? AND ${pending}`,
    linesJson,
    p.store,
    key,
    key,
  );
  add(
    `UPDATE phones SET state='SOLD' WHERE id IN(SELECT item_id FROM sale_lines WHERE sale_id=? AND kind='phone') AND ${pending}`,
    transactionId,
    key,
  );
  add(
    `UPDATE accessory_balances SET quantity=quantity-(SELECT quantity FROM sale_lines WHERE sale_id=? AND item_id=accessory_balances.item_id AND kind='accessory') WHERE store_id=? AND item_id IN(SELECT item_id FROM sale_lines WHERE sale_id=? AND kind='accessory') AND ${pending}`,
    transactionId,
    p.store,
    transactionId,
    key,
  );
  add(
    `INSERT INTO stock_movements(id,command_key,store_id,item_id,delta,reason) SELECT ?||':'||item_id,?,?,item_id,-quantity,'SALE' FROM sale_lines WHERE sale_id=? AND ${pending}`,
    transactionId,
    key,
    p.store,
    transactionId,
    key,
  );
  add(
    `INSERT INTO payments SELECT id,tender,total_minor FROM sales WHERE command_key=? AND ${pending}`,
    key,
    key,
  );
  add(
    `INSERT INTO cash_movements SELECT s.id,s.command_key,s.shift_id,s.seller_id,p.cash_minor,'SALE' FROM sales s JOIN sale_settlements p ON p.sale_id=s.id WHERE s.command_key=? AND p.cash_minor>0 AND ${pending}`,
    key,
    key,
  );
  add(
    `INSERT INTO audit_events(id,command_key,actor_id,store_id,operation,at,payload_json) SELECT transaction_id,key,actor_id,store_id,operation,?,json_set(?,'$.settlement',json((SELECT json_object('cashMinor',cash_minor,'bankMinor',bank_minor,'bankMethod',bank_method,'discountMinor',discount_minor,'discountActor',discount_actor,'discountLimitMinor',discount_limit_minor) FROM sale_settlements WHERE sale_id=commands.transaction_id))) FROM commands WHERE key=? AND ${pending}`,
    now,
    options.auditPayload ?? canonicalJson(envelope),
    key,
    key,
  );
  add(
    `INSERT INTO journals(command_key,account,debit_minor,credit_minor) SELECT s.command_key,'CASH',p.cash_minor,0 FROM sales s JOIN sale_settlements p ON p.sale_id=s.id WHERE s.command_key=? AND p.cash_minor>0 AND ${pending}`,
    key,
    key,
  );
  add(
    `INSERT INTO journals(command_key,account,debit_minor,credit_minor,bank_method) SELECT s.command_key,'BANK_UNRECONCILED',p.bank_minor,0,p.bank_method FROM sales s JOIN sale_settlements p ON p.sale_id=s.id WHERE s.command_key=? AND p.bank_minor>0 AND ${pending}`,
    key,
    key,
  );
  if (credit > 0) {
    guard(
      `EXISTS(SELECT 1 FROM sales s JOIN customer_details d ON d.customer_id=s.customer_id WHERE s.command_key=? AND length(trim(d.surname))>0 AND length(trim(d.given_name))>0 AND length(trim(d.contact))>0 AND s.total_minor>=?)`,
      [key, credit],
    );
    add(
      `INSERT INTO sale_credits SELECT id,customer_id,?,? FROM sales WHERE command_key=? AND ${pending}`,
      credit,
      p.dueDate ?? "",
      key,
      key,
    );
    add(
      `INSERT INTO journals SELECT ?,'CUSTOMER_CREDIT',?,0,NULL WHERE ${pending}`,
      key,
      credit,
      key,
    );
  }
  add(
    `INSERT INTO journals(command_key,account,debit_minor,credit_minor) SELECT command_key,'SALES' ,0,total_minor FROM sales WHERE command_key=? AND ${pending}`,
    key,
    key,
  );
  guard(
    `EXISTS(SELECT 1 FROM sales WHERE command_key=?) AND (SELECT sum(debit_minor-credit_minor) FROM journals WHERE command_key=?)=0`,
    [key, key],
  );
  statements.push(...(options.beforeCompletion ?? []));
  add(
    `UPDATE commands SET state='DONE',response_json=(SELECT json_object(${options.responseKey ? "'key',command_key," : ""}'saleId',id,'totalMinor',total_minor,'changeMinor',change_minor) FROM sales WHERE command_key=?) WHERE key=? AND state='STARTED'`,
    key,
    key,
  );
  add(`DELETE FROM command_guards WHERE key=?`, key);
  add(`SELECT transaction_id,response_json FROM commands WHERE key=? AND state='DONE'`, key);
  return statements;
}
