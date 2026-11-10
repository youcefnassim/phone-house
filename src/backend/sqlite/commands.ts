import { planRetailCheckout } from "./retail-checkout";
import { planBatch4b, savRemainingRefundableSql } from "./batch4b-commands";
import { membershipSql, transferApprovalSql } from "@/domain/permissions";
import { nativeEnvelope, nativePayloads, type NativeOperation } from "@/domain/native-commands";
import { canonicalJson, toCentimes } from "./checkout";
import type { SqlStatement, VerifiedIdentity } from "./port";
import type { z } from "zod";
export function planNativeCommand(
  input: unknown,
  principal: VerifiedIdentity,
  hash: string,
  tx: string,
  now: number,
): SqlStatement[] {
  const e = nativeEnvelope.parse(input);
  const actor = principal.userId;
  if (!principal.sessionId || principal.expiresAt <= now) throw new Error("UNAUTHORIZED");
  if (!/^[a-f0-9]{64}$/.test(hash)) throw new Error("HASH_REQUIRED");
  const operation = e.operation;
  const parsed = nativePayloads[operation].parse(e.payload);
  const store = parsed.store;
  const out: SqlStatement[] = [];
  const add = (sql: string, ...params: SqlStatement["params"]) => out.push({ sql, params });
  const pending = `EXISTS(SELECT 1 FROM commands WHERE key=? AND state='STARTED')`;
  const write = (sql: string, params: SqlStatement["params"] = []) => add(sql, ...params, e.key);
  const guard = (sql: string, params: SqlStatement["params"] = []) =>
    write(
      `INSERT INTO command_guards SELECT ?,CASE WHEN (${sql}) THEN 1 ELSE 0 END WHERE ${pending}`,
      [e.key, ...params],
    );
  add(
    `INSERT OR IGNORE INTO commands(key,actor_id,store_id,operation,payload_hash,state,transaction_id,response_json,created_at) VALUES(?,?,?,?,?,'STARTED',?,NULL,?)`,
    e.key,
    actor,
    store,
    operation,
    hash,
    tx,
    now,
  );
  add(
    `INSERT INTO command_guards SELECT ?,CASE WHEN actor_id=? AND store_id=? AND operation=? AND payload_hash=? THEN 1 ELSE 0 END FROM commands WHERE key=?`,
    e.key,
    actor,
    store,
    operation,
    hash,
    e.key,
  );
  add(
    `INSERT INTO command_guards VALUES(?,CASE WHEN EXISTS(SELECT 1 FROM sessions s JOIN accounts a ON a.id=s.user_id WHERE s.id=? AND s.user_id=? AND a.active=1 AND s.revoked=0 AND s.expires_at>?) THEN 1 ELSE 0 END)`,
    e.key,
    principal.sessionId,
    actor,
    now,
  );
  if (operation !== "transfer.approve")
    add(
      `INSERT INTO command_guards VALUES(?,CASE WHEN EXISTS(SELECT 1 FROM memberships WHERE user_id=? AND ${membershipSql(operation)}) THEN 1 ELSE 0 END)`,
      e.key,
      actor,
      store,
    );
  const p = <K extends NativeOperation>(name: K): z.infer<(typeof nativePayloads)[K]> =>
    nativePayloads[name].parse(e.payload) as z.infer<(typeof nativePayloads)[K]>;
  // Audit precedes upserts so before_json captures the previous row (atomic batch).
  const before = beforeRow(operation, parsed as Record<string, unknown>, store);
  write(
    `INSERT INTO audit_events(id,command_key,actor_id,store_id,operation,at,payload_json,before_json) SELECT transaction_id,key,actor_id,store_id,operation,?,?,${before.sql} FROM commands WHERE key=? AND ${pending}`,
    [
      now,
      canonicalJson(
        operation === "used.purchase"
          ? { ...e, payload: { store, phoneId: (parsed as Record<string, unknown>)["id"] } }
          : operation === "sav.exchange"
            ? {
                ...e,
                payload: {
                  ...p("sav.exchange"),
                  checkout: {
                    ...p("sav.exchange").checkout,
                    payload: Object.fromEntries(
                      Object.entries(p("sav.exchange").checkout.payload).filter(
                        ([k]) => k !== "buyer",
                      ),
                    ),
                  },
                },
              }
            : e,
      ),
      ...before.params,
      e.key,
    ],
  );
  let status: "RECORDED" | "DRAFT" | "POLICY_BLOCKED" = "RECORDED";
  switch (operation) {
    case "sav.exchange": {
      const v = p(operation);
      guard(
        `EXISTS(SELECT 1 FROM service_cases c JOIN sales s ON s.id=c.sale_id JOIN sale_lines l ON l.sale_id=s.id AND l.item_id=c.phone_id AND l.kind='phone' WHERE c.id=? AND c.customer_id=? AND s.store_id=?)`,
        [v.caseId, v.checkout.payload.customerId ?? null, store],
      );
      guard(`NOT EXISTS(SELECT 1 FROM commands WHERE key=?)`, [v.checkout.idempotencyKey]);
      const zeroRefund = toCentimes(v.refundAmount) === 0;
      out.push(
        ...planBatch4b(
          "sav.outcome",
          zeroRefund
            ? { store, caseId: v.caseId, outcome: "REFUND", note: v.note }
            : {
                store,
                caseId: v.caseId,
                outcome: "REFUND",
                note: v.note,
                amount: v.refundAmount,
                method: v.method,
                ...(v.shiftId ? { shiftId: v.shiftId } : {}),
                ...(v.bankMethod ? { bankMethod: v.bankMethod } : {}),
                ...(v.declineReason ? { declineReason: v.declineReason } : {}),
              },
          e.key,
          tx,
          actor,
          now,
        ),
      );
      // P1: a zero-refund exchange is allowed only when the remaining debt absorbs the return.
      if (zeroRefund) guard(`${savRemainingRefundableSql} <= 0`, [v.caseId]);
      out.push(...planRetailCheckout(v.checkout, principal, hash, crypto.randomUUID(), now));
      write(`INSERT INTO sav_exchanges SELECT ?,?,?,? WHERE ${pending}`, [
        v.caseId,
        e.key,
        v.checkout.idempotencyKey,
        now,
      ]);
      break;
    }
    case "sav.track":
    case "sav.outcome":
    case "sav.restock":
    case "used.purchase":
      out.push(...planBatch4b(operation, e.payload, e.key, tx, actor, now));
      break;
    case "supplier.cost": {
      const v = p(operation);
      guard(`EXISTS(SELECT 1 FROM suppliers WHERE id=?)`, [v.supplierId]);
      guard(
        `EXISTS(SELECT 1 FROM standalone_receipts r WHERE r.id=? AND r.store_id=? AND (CASE WHEN ? IS NULL THEN EXISTS(SELECT 1 FROM catalog WHERE id=r.item_id AND kind='accessory') ELSE EXISTS(SELECT 1 FROM standalone_phone_receipts WHERE phone_id=? AND receipt_id=r.id) END)) OR EXISTS(SELECT 1 FROM receipt_sources r JOIN purchases pu ON pu.id=(SELECT purchase_id FROM receiving WHERE id=r.receiving_id) JOIN catalog c ON c.id=pu.item_id WHERE r.id=? AND r.store_id=? AND ((? IS NULL AND c.kind='accessory') OR r.phone_id=?))`,
        [
          v.sourceId,
          store,
          v.phoneId ?? null,
          v.phoneId ?? null,
          v.sourceId,
          store,
          v.phoneId ?? null,
          v.phoneId ?? null,
        ],
      );
      write(`INSERT INTO supplier_costs SELECT ?,?,?,?,?,?,?,?,? WHERE ${pending}`, [
        tx,
        e.key,
        store,
        v.sourceId,
        v.phoneId ?? null,
        v.supplierId,
        toCentimes(v.amount),
        actor,
        now,
      ]);
      break;
    }
    case "supplier.payment": {
      const v = p(operation);
      guard(`EXISTS(SELECT 1 FROM suppliers WHERE id=?)`, [v.supplierId]);
      if (v.method === "Cash")
        guard(`EXISTS(SELECT 1 FROM shifts WHERE id=? AND store_id=? AND state='OPEN')`, [
          v.shiftId ?? null,
          store,
        ]);
      write(`INSERT INTO supplier_payments SELECT ?,?,?,?,?,?,?,?,?,? WHERE ${pending}`, [
        tx,
        e.key,
        v.supplierId,
        store,
        toCentimes(v.amount),
        v.method,
        v.bankMethod ?? null,
        v.shiftId ?? null,
        actor,
        now,
      ]);
      if (v.method === "Cash")
        write(`INSERT INTO cash_adjustments SELECT ?,?,?,?,?,?,?,? WHERE ${pending}`, [
          tx,
          e.key,
          v.shiftId ?? null,
          actor,
          -toCentimes(v.amount),
          "Paiement fournisseur",
          "",
          now,
        ]);
      write(`INSERT INTO journals SELECT ?,?,0,?,? WHERE ${pending}`, [
        e.key,
        v.method === "Cash" ? "CASH" : "BANK_UNRECONCILED",
        toCentimes(v.amount),
        v.bankMethod ?? null,
      ]);
      write(`INSERT INTO journals SELECT ?,'SUPPLIER_PAYABLE',?,0,NULL WHERE ${pending}`, [
        e.key,
        toCentimes(v.amount),
      ]);
      break;
    }
    case "count.open": {
      const v = p(operation);
      write(`INSERT INTO stock_counts SELECT ?,?,?,'OPEN',?,?,NULL WHERE ${pending}`, [
        v.id,
        store,
        v.month,
        actor,
        now,
      ]);
      write(
        `INSERT INTO count_expected SELECT ?,item_id,'accessory',quantity FROM accessory_balances WHERE store_id=? AND ${pending}`,
        [v.id, store],
      );
      write(
        `INSERT INTO count_expected SELECT ?,id,'phone',1 FROM phones WHERE store_id=? AND state='AVAILABLE' AND ${pending}`,
        [v.id, store],
      );
      break;
    }
    case "count.entry": {
      const v = p(operation);
      guard(`EXISTS(SELECT 1 FROM stock_counts WHERE id=? AND store_id=? AND state='OPEN')`, [
        v.countId,
        store,
      ]);
      guard(
        v.kind === "phone"
          ? `? IN(0,1) AND EXISTS(SELECT 1 FROM phones WHERE id=? AND store_id=?)`
          : `EXISTS(SELECT 1 FROM catalog WHERE id=? AND kind='accessory')`,
        v.kind === "phone" ? [v.quantity, v.itemId, store] : [v.itemId],
      );
      write(
        `INSERT INTO count_entries SELECT ?,?,?,? WHERE ${pending} ON CONFLICT(count_id,item_id,kind) DO UPDATE SET quantity=excluded.quantity`,
        [v.countId, v.itemId, v.kind, v.quantity],
      );
      break;
    }
    case "count.submit": {
      const v = p(operation);
      guard(`EXISTS(SELECT 1 FROM stock_counts WHERE id=? AND store_id=? AND state='OPEN')`, [
        v.countId,
        store,
      ]);
      write(`UPDATE stock_counts SET state='SUBMITTED',submitted_at=? WHERE id=? AND ${pending}`, [
        now,
        v.countId,
      ]);
      break;
    }
    case "stock.adjust": {
      const v = p(operation);
      guard(
        `EXISTS(SELECT 1 FROM accessory_balances WHERE store_id=? AND item_id=? AND quantity+? BETWEEN 0 AND 2147483647)`,
        [store, v.itemId, v.delta],
      );
      if (v.countId)
        guard(
          `EXISTS(SELECT 1 FROM stock_counts WHERE id=? AND store_id=? AND state='SUBMITTED')`,
          [v.countId, store],
        );
      write(`INSERT INTO stock_adjustments SELECT ?,?,?,?,?,?,?,?,? WHERE ${pending}`, [
        tx,
        e.key,
        store,
        v.itemId,
        v.delta,
        v.reason,
        v.countId ?? null,
        actor,
        now,
      ]);
      write(
        `UPDATE accessory_balances SET quantity=quantity+? WHERE store_id=? AND item_id=? AND ${pending}`,
        [v.delta, store, v.itemId],
      );
      write(`INSERT INTO stock_movements SELECT ?,?,?,?,?,'ADJUSTMENT' WHERE ${pending}`, [
        tx,
        e.key,
        store,
        v.itemId,
        v.delta,
      ]);
      break;
    }
    case "stock.review": {
      const v = p(operation);
      guard(`EXISTS(SELECT 1 FROM stock_adjustments WHERE id=? AND store_id=?)`, [
        v.adjustmentId,
        store,
      ]);
      write(`INSERT INTO stock_adjustment_reviews SELECT ?,?,?,?,?,? WHERE ${pending}`, [
        v.adjustmentId,
        e.key,
        v.outcome,
        v.note,
        actor,
        now,
      ]);
      break;
    }
    case "transfer.resolve":
    case "transfer.cancel": {
      const v = p(operation);
      guard(
        `EXISTS(SELECT 1 FROM transfers WHERE id=? AND source_store=?) AND EXISTS(SELECT 1 FROM transfer_dispatches WHERE transfer_id=?) AND NOT EXISTS(SELECT 1 FROM transfer_cancellations WHERE transfer_id=?)`,
        [v.transferId, store, v.transferId, v.transferId],
      );
      const cancel = operation === "transfer.cancel";
      if (!cancel) {
        const r = p("transfer.resolve");
        guard(
          `EXISTS(SELECT 1 FROM transfer_discrepancies WHERE transfer_id=? AND item_id=?) AND NOT EXISTS(SELECT 1 FROM transfer_resolutions WHERE transfer_id=? AND item_id=?)`,
          [r.transferId, r.itemId, r.transferId, r.itemId],
        );
        write(`INSERT INTO transfer_resolutions SELECT ?,?,?,?,?,?,? WHERE ${pending}`, [
          r.transferId,
          r.itemId,
          r.outcome,
          r.reason,
          e.key,
          actor,
          now,
        ]);
      }
      const returning = cancel || p("transfer.resolve").outcome === "RETURN";
      const source = cancel
        ? `SELECT l.item_id,l.kind,l.quantity FROM transfer_lines l WHERE l.transfer_id=? AND NOT EXISTS(SELECT 1 FROM transfer_receipts WHERE transfer_id=l.transfer_id) UNION ALL SELECT l.item_id,l.kind,d.quantity FROM transfer_discrepancies d JOIN transfer_lines l USING(transfer_id,item_id) WHERE d.transfer_id=? AND NOT EXISTS(SELECT 1 FROM transfer_resolutions r WHERE r.transfer_id=d.transfer_id AND r.item_id=d.item_id)`
        : `SELECT l.item_id,l.kind,d.quantity FROM transfer_discrepancies d JOIN transfer_lines l USING(transfer_id,item_id) WHERE d.transfer_id=? AND d.item_id=?`;
      const args = cancel
        ? [v.transferId, v.transferId]
        : [v.transferId, p("transfer.resolve").itemId];
      if (returning) {
        write(
          `UPDATE phones SET state='AVAILABLE',store_id=? WHERE id IN(SELECT item_id FROM (${source}) WHERE kind='phone') AND state='IN_TRANSIT' AND ${pending}`,
          [store, ...args],
        );
        write(
          `INSERT INTO accessory_balances SELECT ?,item_id,quantity FROM (${source}) WHERE kind='accessory' AND ${pending} ON CONFLICT(store_id,item_id) DO UPDATE SET quantity=quantity+excluded.quantity`,
          [store, ...args],
        );
        write(
          `INSERT INTO stock_movements SELECT ?||':'||item_id,?,?,item_id,quantity,'TRANSFER_RETURN' FROM (${source}) WHERE ${pending}`,
          [tx, e.key, store, ...args],
        );
      } else
        write(
          `UPDATE phones SET state='RETURN_BLOCKED' WHERE id IN(SELECT item_id FROM (${source}) WHERE kind='phone') AND state='IN_TRANSIT' AND ${pending}`,
          args,
        );
      if (cancel) {
        write(
          `INSERT INTO transfer_resolutions SELECT d.transfer_id,d.item_id,'RETURN',?,?,?,? FROM transfer_discrepancies d WHERE d.transfer_id=? AND NOT EXISTS(SELECT 1 FROM transfer_resolutions r WHERE r.transfer_id=d.transfer_id AND r.item_id=d.item_id) AND ${pending}`,
          [p("transfer.cancel").reason, e.key, actor, now, v.transferId],
        );
        write(`INSERT INTO transfer_cancellations SELECT ?,?,?,?,? WHERE ${pending}`, [
          v.transferId,
          e.key,
          actor,
          p("transfer.cancel").reason,
          now,
        ]);
        write(`UPDATE transfers SET stage='COMPLETED' WHERE id=? AND ${pending}`, [v.transferId]);
      }
      break;
    }
    case "cash.movement": {
      const v = p(operation);
      guard(`EXISTS(SELECT 1 FROM shifts WHERE id=? AND store_id=? AND state='OPEN')`, [
        v.shiftId,
        store,
      ]);
      guard(
        `EXISTS(SELECT 1 FROM json_each(COALESCE((SELECT value_json FROM app_settings WHERE key='cash.movementReasons'),'["Loyer","Électricité","Salaires","Frais","Autre"]')) j WHERE j.value=?) AND (?<>'Autre' OR length(trim(?))>0)`,
        [v.reason, v.reason, v.note],
      );
      write(`INSERT INTO cash_adjustments SELECT ?,?,?,?,?,?,?,? WHERE ${pending}`, [
        tx,
        e.key,
        v.shiftId,
        actor,
        toCentimes(v.amount) * (v.direction === "IN" ? 1 : -1),
        v.reason,
        v.note,
        now,
      ]);
      break;
    }
    case "repayment.record": {
      const v = p(operation);
      guard(
        `EXISTS(SELECT 1 FROM credit_balances c JOIN sales s ON s.id=c.sale_id WHERE c.sale_id=? AND s.store_id=? AND c.state='OPEN' AND c.balance_minor>=?)`,
        [v.debtId, store, toCentimes(v.amount)],
      );
      if (v.method === "Cash")
        guard(`EXISTS(SELECT 1 FROM shifts WHERE id=? AND store_id=? AND state='OPEN')`, [
          v.shiftId ?? null,
          store,
        ]);
      write(`INSERT INTO credit_repayments SELECT ?,?,?,?,?,?,?,?,? WHERE ${pending}`, [
        tx,
        e.key,
        v.debtId,
        toCentimes(v.amount),
        v.method,
        v.bankMethod ?? null,
        v.shiftId ?? null,
        actor,
        now,
      ]);
      write(`INSERT INTO journals SELECT ?,?,?,0,? WHERE ${pending}`, [
        e.key,
        v.method === "Cash" ? "CASH" : "BANK_UNRECONCILED",
        toCentimes(v.amount),
        v.bankMethod ?? null,
      ]);
      write(`INSERT INTO journals SELECT ?,'CUSTOMER_CREDIT',0,?,NULL WHERE ${pending}`, [
        e.key,
        toCentimes(v.amount),
      ]);
      break;
    }
    case "repayment.reverse": {
      const v = p(operation);
      guard(
        `EXISTS(SELECT 1 FROM credit_repayments r JOIN sales s ON s.id=r.sale_id WHERE r.id=? AND s.store_id=?) AND NOT EXISTS(SELECT 1 FROM credit_repayment_reversals WHERE repayment_id=?)`,
        [v.repaymentId, store, v.repaymentId],
      );
      guard(
        `EXISTS(SELECT 1 FROM credit_repayments r WHERE r.id=? AND (r.method='Bank' OR EXISTS(SELECT 1 FROM shifts WHERE id=? AND store_id=? AND state='OPEN')))`,
        [v.repaymentId, v.shiftId ?? null, store],
      );
      write(`INSERT INTO credit_repayment_reversals SELECT ?,?,?,?,?,? WHERE ${pending}`, [
        v.repaymentId,
        e.key,
        actor,
        now,
        v.reason,
        v.shiftId ?? null,
      ]);
      write(
        `INSERT INTO journals SELECT ?,CASE WHEN method='Cash' THEN 'CASH' ELSE 'BANK_UNRECONCILED' END,0,amount_minor,bank_method FROM credit_repayments WHERE id=? AND ${pending}`,
        [e.key, v.repaymentId],
      );
      write(
        `INSERT INTO journals SELECT ?,'CUSTOMER_CREDIT',amount_minor,0,NULL FROM credit_repayments WHERE id=? AND ${pending}`,
        [e.key, v.repaymentId],
      );
      break;
    }
    case "sale.void": {
      const v = p(operation);
      guard(
        `EXISTS(SELECT 1 FROM sales s JOIN shifts sh ON sh.id=s.shift_id WHERE s.id=? AND s.store_id=? AND sh.state='OPEN') AND NOT EXISTS(SELECT 1 FROM sale_voids WHERE sale_id=?)`,
        [v.saleId, store, v.saleId],
      );
      guard(
        `NOT EXISTS(SELECT 1 FROM sale_lines l LEFT JOIN phones ph ON ph.id=l.item_id WHERE l.sale_id=? AND l.kind='phone' AND (ph.state<>'SOLD' OR ph.store_id<>?))`,
        [v.saleId, store],
      );
      write(`INSERT INTO sale_voids SELECT ?,?,?,?,? WHERE ${pending}`, [
        v.saleId,
        e.key,
        actor,
        now,
        v.reason,
      ]);
      write(
        `UPDATE phones SET state='AVAILABLE' WHERE id IN(SELECT item_id FROM sale_lines WHERE sale_id=? AND kind='phone') AND ${pending}`,
        [v.saleId],
      );
      write(
        `UPDATE accessory_balances SET quantity=quantity+(SELECT quantity FROM sale_lines WHERE sale_id=? AND item_id=accessory_balances.item_id AND kind='accessory') WHERE store_id=? AND item_id IN(SELECT item_id FROM sale_lines WHERE sale_id=? AND kind='accessory') AND ${pending}`,
        [v.saleId, store, v.saleId],
      );
      write(
        `INSERT INTO stock_movements SELECT ?||':'||item_id,?,?,item_id,quantity,'SALE_VOID' FROM sale_lines WHERE sale_id=? AND ${pending}`,
        [tx, e.key, store, v.saleId],
      );
      write(
        `INSERT INTO cash_reversals SELECT s.id,?,s.shift_id,?,COALESCE(p.cash_minor,CASE WHEN s.tender='Cash' THEN s.total_minor ELSE 0 END) FROM sales s LEFT JOIN sale_settlements p ON p.sale_id=s.id WHERE s.id=? AND COALESCE(p.cash_minor,CASE WHEN s.tender='Cash' THEN s.total_minor ELSE 0 END)>0 AND ${pending}`,
        [e.key, actor, v.saleId],
      );
      write(
        `INSERT INTO bank_reversals SELECT s.id,?,COALESCE(p.bank_minor,CASE WHEN s.tender='Bank' THEN s.total_minor ELSE 0 END),p.bank_method FROM sales s LEFT JOIN sale_settlements p ON p.sale_id=s.id WHERE s.id=? AND COALESCE(p.bank_minor,CASE WHEN s.tender='Bank' THEN s.total_minor ELSE 0 END)>0 AND ${pending}`,
        [e.key, v.saleId],
      );
      write(
        `INSERT INTO journals(command_key,account,debit_minor,credit_minor) SELECT ?,'CASH',0,amount_minor FROM cash_reversals WHERE sale_id=? AND ${pending}`,
        [e.key, v.saleId],
      );
      write(
        `INSERT INTO journals(command_key,account,debit_minor,credit_minor,bank_method) SELECT ?,'BANK_UNRECONCILED',0,amount_minor,bank_method FROM bank_reversals WHERE sale_id=? AND ${pending}`,
        [e.key, v.saleId],
      );
      write(
        `INSERT INTO journals(command_key,account,debit_minor,credit_minor) SELECT ?,'SALES',total_minor,0 FROM sales WHERE id=? AND ${pending}`,
        [e.key, v.saleId],
      );
      write(
        `INSERT INTO warranty_voids SELECT sale_id,phone_id,'VOID' FROM warranty_requests WHERE sale_id=? AND ${pending}`,
        [v.saleId],
      );
      write(
        `INSERT INTO journals SELECT ?,'CUSTOMER_CREDIT',0,amount_minor,NULL FROM sale_credits WHERE sale_id=? AND ${pending}`,
        [e.key, v.saleId],
      );
      guard(`(SELECT sum(debit_minor-credit_minor) FROM journals WHERE command_key=?)=0`, [e.key]);
      break;
    }
    case "customer.save": {
      const v = p(operation);
      guard(`NOT EXISTS(SELECT 1 FROM customers WHERE id=? AND store_id<>?)`, [v.id, store]);
      write(
        `INSERT INTO customers SELECT ?,?,?,? WHERE ${pending} ON CONFLICT(id) DO UPDATE SET name=excluded.name,reference=excluded.reference`,
        [v.id, store, v.name, v.reference],
      );
      break;
    }
    case "supplier.save": {
      const v = p(operation);
      guard(`NOT EXISTS(SELECT 1 FROM suppliers WHERE id=? AND store_id<>?)`, [v.id, store]);
      write(
        `INSERT INTO suppliers(id,store_id,name,reference) SELECT ?,?,?,? WHERE ${pending} ON CONFLICT(id) DO UPDATE SET name=excluded.name,reference=excluded.reference`,
        [v.id, store, v.name, v.reference],
      );
      write(
        `INSERT INTO supplier_contacts SELECT ?,? WHERE ${pending} ON CONFLICT(supplier_id) DO UPDATE SET phone=excluded.phone`,
        [v.id, v.phone],
      );
      break;
    }
    case "catalog.save": {
      const v = p(operation);
      guard(`NOT EXISTS(SELECT 1 FROM catalog WHERE id=? AND kind<>?)`, [v.id, v.kind]);
      write(
        `INSERT INTO catalog SELECT ?,?,?,?,? WHERE ${pending} ON CONFLICT(id) DO UPDATE SET sku=excluded.sku,name=excluded.name,attributes_json=excluded.attributes_json`,
        [v.id, v.kind, v.sku, v.name, JSON.stringify(v.attributes)],
      );
      break;
    }
    case "price.set": {
      const v = p(operation);
      write(
        `INSERT INTO prices SELECT ?,?,? WHERE ${pending} ON CONFLICT(store_id,item_id) DO UPDATE SET amount_minor=excluded.amount_minor`,
        [store, v.itemId, toCentimes(v.amount)],
      );
      break;
    }
    case "settings.save": {
      const v = p(operation);
      write(
        `INSERT INTO app_settings SELECT ?,?,? WHERE ${pending} ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json,updated_at=excluded.updated_at`,
        [v.key, canonicalJson(v.value), now],
      );
      break;
    }
    case "purchase.save": {
      const v = p(operation);
      status = "DRAFT";
      guard(
        `NOT EXISTS(SELECT 1 FROM purchases WHERE id=? AND(store_id<>? OR state NOT IN('DRAFT','POLICY_BLOCKED')))`,
        [v.id, store],
      );
      write(
        `INSERT INTO purchases(id,store_id,supplier_id,item_id,quantity,state,evidence) SELECT ?,?,?,?,?,'DRAFT',? WHERE ${pending} ON CONFLICT(id) DO UPDATE SET supplier_id=excluded.supplier_id,item_id=excluded.item_id,quantity=excluded.quantity,evidence=excluded.evidence`,
        [v.id, store, v.supplierId, v.itemId, v.quantity, v.evidence],
      );
      break;
    }
    case "purchase.finance": {
      const v = p(operation);
      guard(
        `EXISTS(SELECT 1 FROM purchases WHERE id=? AND store_id=? AND state IN('DRAFT','POLICY_BLOCKED'))`,
        [v.purchaseId, store],
      );
      write(
        `INSERT INTO confidential_purchase_finance SELECT ?,?,? WHERE ${pending} ON CONFLICT(purchase_id) DO UPDATE SET cost_minor=excluded.cost_minor,obligation_minor=excluded.obligation_minor`,
        [
          v.purchaseId,
          v.cost === null ? null : toCentimes(v.cost),
          v.obligation === null ? null : toCentimes(v.obligation),
        ],
      );
      break;
    }
    case "stock.receive": {
      const v = p(operation);
      guard(
        `EXISTS(SELECT 1 FROM purchases WHERE id=? AND store_id=? AND state='AUTHORIZED' AND length(trim(evidence))>0)`,
        [v.purchaseId, store],
      );
      const json = JSON.stringify(v.phones);
      guard(
        `EXISTS(SELECT 1 FROM purchases p JOIN catalog c ON c.id=p.item_id WHERE p.id=? AND((c.kind='phone' AND ?=? AND ?>0) OR(c.kind='accessory' AND ?=0)))`,
        [v.purchaseId, v.phones.length, v.quantity, v.quantity, v.phones.length],
      );
      write(
        `INSERT INTO receiving(id,purchase_id,quantity,evidence_key,actor_id,command_key) SELECT ?,?,?,?,?,? WHERE ${pending}`,
        [tx, v.purchaseId, v.quantity, v.evidence, actor, e.key],
      );
      write(
        `INSERT INTO phones(id,store_id,catalog_id,barcode,state,attributes_json,serial) SELECT json_extract(j.value,'$.id'),?,p.item_id,json_extract(j.value,'$.barcode'),'AVAILABLE',json_extract(j.value,'$.attributes'),json_extract(j.value,'$.serial') FROM purchases p,json_each(?) j WHERE p.id=? AND ${pending}`,
        [store, json, v.purchaseId],
      );
      write(
        `INSERT INTO phone_identifiers SELECT json_extract(value,'$.imei1'),json_extract(value,'$.id'),1 FROM json_each(?) WHERE ${pending}`,
        [json],
      );
      write(
        `INSERT INTO phone_identifiers SELECT json_extract(value,'$.imei2'),json_extract(value,'$.id'),2 FROM json_each(?) WHERE json_extract(value,'$.imei2') IS NOT NULL AND ${pending}`,
        [json],
      );
      write(
        `INSERT INTO phone_receipts SELECT json_extract(value,'$.id'),?,? FROM json_each(?) WHERE ${pending}`,
        [v.purchaseId, tx, json],
      );
      write(
        `INSERT INTO receipt_sources(id,store_id,phone_id,receiving_id,supplier_id,quantity,received_at,actor_id,reference) SELECT ?||':'||json_extract(j.value,'$.id'),?,json_extract(j.value,'$.id'),?,p.supplier_id,1,?,?,? FROM purchases p,json_each(?) j WHERE p.id=? AND ${pending}`,
        [tx, store, tx, now, actor, v.evidence, json, v.purchaseId],
      );
      write(
        `INSERT INTO receipt_sources(id,store_id,receiving_id,supplier_id,quantity,received_at,actor_id,reference) SELECT ?,?,?,p.supplier_id,?,?,?,? FROM purchases p JOIN catalog c ON c.id=p.item_id WHERE p.id=? AND c.kind='accessory' AND ${pending}`,
        [tx, store, tx, v.quantity, now, actor, v.evidence, v.purchaseId],
      );
      write(
        `INSERT INTO accessory_balances SELECT ?,p.item_id,? FROM purchases p JOIN catalog c ON c.id=p.item_id WHERE p.id=? AND c.kind='accessory' AND ${pending} ON CONFLICT(store_id,item_id) DO UPDATE SET quantity=quantity+excluded.quantity`,
        [store, v.quantity, v.purchaseId],
      );
      write(
        `INSERT INTO stock_movements SELECT ?||':'||json_extract(value,'$.id'),?,?,json_extract(value,'$.id'),1,'RECEIPT' FROM json_each(?) WHERE ${pending}`,
        [tx, e.key, store, json],
      );
      write(
        `INSERT INTO stock_movements SELECT ?,?,?,p.item_id,?,'RECEIPT' FROM purchases p JOIN catalog c ON c.id=p.item_id WHERE p.id=? AND c.kind='accessory' AND ${pending}`,
        [tx, e.key, store, v.quantity, v.purchaseId],
      );
      write(
        `UPDATE purchases SET state=CASE WHEN (SELECT sum(quantity) FROM receiving WHERE purchase_id=?)=quantity THEN 'RECEIVED' ELSE 'AUTHORIZED' END WHERE id=? AND ${pending}`,
        [v.purchaseId, v.purchaseId],
      );
      break;
    }
    case "cash.open": {
      const v = p(operation);
      write(`INSERT INTO shifts SELECT ?,?,?,?,'OPEN',?,NULL WHERE ${pending}`, [
        v.id,
        store,
        v.drawerId,
        actor,
        toCentimes(v.opening),
      ]);
      break;
    }
    case "cash.close": {
      const v = p(operation);
      guard(`EXISTS(SELECT 1 FROM shifts WHERE id=? AND store_id=? AND state='OPEN')`, [
        v.shiftId,
        store,
      ]);
      write(
        `INSERT INTO cash_counts SELECT id,?,opening_minor+COALESCE((SELECT sum(amount_minor) FROM effective_cash_movements WHERE shift_id=shifts.id),0),?,'POLICY_BLOCKED' FROM shifts WHERE id=? AND ${pending}`,
        [toCentimes(v.counted), actor, v.shiftId],
      );
      write(
        `INSERT INTO shift_closures SELECT id,?,?,?,opening_minor+COALESCE((SELECT sum(amount_minor) FROM effective_cash_movements WHERE shift_id=shifts.id),0),'',CASE WHEN store_id='M01' THEN 'PENDING' ELSE 'OPTIONAL' END FROM shifts WHERE id=? AND ${pending}`,
        [now, actor, toCentimes(v.counted), v.shiftId],
      );
      write(`UPDATE shifts SET state='CLOSED',counted_minor=? WHERE id=? AND ${pending}`, [
        toCentimes(v.counted),
        v.shiftId,
      ]);
      break;
    }
    case "cash.review": {
      const v = p(operation);
      guard(
        `EXISTS(SELECT 1 FROM shifts WHERE id=? AND store_id=? AND state='CLOSED') AND EXISTS(SELECT 1 FROM shift_closures WHERE shift_id=?)`,
        [v.shiftId, store, v.shiftId],
      );
      write(`INSERT INTO shift_reviews SELECT ?,?,?,?,?,? WHERE ${pending}`, [
        tx,
        v.shiftId,
        actor,
        now,
        v.outcome,
        v.note,
      ]);
      break;
    }
    case "session.revoke": {
      const v = p(operation);
      guard(
        `EXISTS(SELECT 1 FROM sessions s JOIN memberships m ON m.user_id=s.user_id WHERE s.id=? AND s.id<>? AND ((m.store_id=? AND m.role IN('SELLER','MANAGER')) OR m.store_id=?))`,
        [v.sessionId, principal.sessionId, store, store],
      );
      write(`UPDATE sessions SET revoked=1 WHERE id=? AND ${pending}`, [v.sessionId]);
      break;
    }
    case "cash.evidence": {
      const v = p(operation);
      status = "POLICY_BLOCKED";
      guard(`EXISTS(SELECT 1 FROM shifts WHERE id=? AND store_id=? AND state='OPEN')`, [
        v.shiftId,
        store,
      ]);
      write(`INSERT INTO cash_evidence SELECT ?,?,?,?,?,?,'POLICY_BLOCKED' WHERE ${pending}`, [
        tx,
        v.shiftId,
        v.direction,
        toCentimes(v.amount),
        v.reference,
        actor,
      ]);
      break;
    }
    case "debt.draft": {
      const v = p(operation);
      status = "POLICY_BLOCKED";
      guard(`EXISTS(SELECT 1 FROM sales WHERE id=? AND store_id=? AND customer_id=?)`, [
        v.saleId,
        store,
        v.customerId,
      ]);
      write(`INSERT INTO debts SELECT ?,?,?,?,'POLICY_BLOCKED' WHERE ${pending}`, [
        v.id,
        v.customerId,
        v.saleId,
        toCentimes(v.amount),
      ]);
      break;
    }
    case "repayment.draft": {
      const v = p(operation);
      status = "DRAFT";
      guard(
        `EXISTS(SELECT 1 FROM debts d JOIN customers c ON c.id=d.customer_id WHERE d.id=? AND c.store_id=?)`,
        [v.debtId, store],
      );
      write(`INSERT INTO repayments SELECT ?,?,?,?,'DRAFT' WHERE ${pending}`, [
        tx,
        v.debtId,
        toCentimes(v.amount),
        v.reference,
      ]);
      break;
    }
    case "transfer.create": {
      const v = p(operation);
      status = "DRAFT";
      write(`INSERT INTO transfers SELECT ?,?,?,'APPROVALS' WHERE ${pending}`, [
        v.id,
        store,
        v.destination,
      ]);
      write(
        `INSERT INTO transfer_lines SELECT ?,json_extract(value,'$.itemId'),json_extract(value,'$.kind'),json_extract(value,'$.quantity'),json_extract(value,'$.code') FROM json_each(?) WHERE ${pending}`,
        [v.id, JSON.stringify(v.lines)],
      );
      break;
    }
    case "transfer.approve": {
      const v = p(operation);
      guard(`EXISTS(SELECT 1 FROM memberships WHERE user_id=? AND ${transferApprovalSql("?")})`, [
        actor,
        v.approval,
        v.approval,
      ]);
      guard(
        `EXISTS(SELECT 1 FROM transfers WHERE id=? AND(source_store=? OR destination_store=?) AND stage='APPROVALS')`,
        [v.transferId, store, store],
      );
      write(`INSERT INTO transfer_approvals SELECT ?,?,? WHERE ${pending}`, [
        v.transferId,
        v.approval,
        actor,
      ]);
      break;
    }
    case "transfer.scan": {
      const v = p(operation);
      guard(
        `EXISTS(SELECT 1 FROM transfers t JOIN transfer_lines l ON l.transfer_id=t.id WHERE t.id=? AND l.item_id=? AND l.code=? AND l.quantity>=? AND ((t.source_store=? AND t.stage='APPROVALS') OR(t.destination_store=? AND t.stage='IN_TRANSIT')))`,
        [v.transferId, v.itemId, v.code, v.quantity, store, store],
      );
      if (store === p(operation).store) {
        write(
          `INSERT INTO transfer_arrivals SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM transfers WHERE id=? AND destination_store=? AND stage='IN_TRANSIT') AND ${pending} ON CONFLICT(transfer_id,item_id) DO UPDATE SET quantity=excluded.quantity,damaged=excluded.damaged`,
          [v.transferId, v.itemId, v.quantity, v.damaged ? 1 : 0, v.transferId, store],
        );
      }
      write(
        `INSERT INTO transfer_scans SELECT ?,?,?,? WHERE ${pending} ON CONFLICT(transfer_id,item_id) DO UPDATE SET code=excluded.code,quantity=excluded.quantity`,
        [v.transferId, v.itemId, v.code, v.quantity],
      );
      break;
    }
    case "transfer.dispatch":
    case "transfer.receive": {
      const v = p(operation);
      const dispatch = operation === "transfer.dispatch";
      guard(
        `EXISTS(SELECT 1 FROM transfers WHERE id=? AND ${dispatch ? "source_store" : "destination_store"}=? AND stage=?)`,
        [v.transferId, store, dispatch ? "APPROVALS" : "IN_TRANSIT"],
      );
      guard(
        `(SELECT count(*) FROM transfer_approvals WHERE transfer_id=?)=2 AND EXISTS(SELECT 1 FROM transfer_lines WHERE transfer_id=?) AND (NOT EXISTS(SELECT 1 FROM transfer_lines l LEFT JOIN transfer_scans s ON s.transfer_id=l.transfer_id AND s.item_id=l.item_id WHERE l.transfer_id=? AND(s.item_id IS NULL OR s.code<>l.code OR s.quantity<>l.quantity)) OR (?=0 AND EXISTS(SELECT 1 FROM transfer_dispatches WHERE transfer_id=? AND carrier<>'')))`,
        [v.transferId, v.transferId, v.transferId, dispatch ? 1 : 0, v.transferId],
      );
      // Current approver roles must still be valid; a stale signature cannot move stock.
      guard(
        `NOT EXISTS(SELECT 1 FROM transfer_approvals ap WHERE ap.transfer_id=? AND NOT EXISTS(SELECT 1 FROM memberships m JOIN accounts a ON a.id=m.user_id WHERE a.active=1 AND m.user_id=ap.actor_id AND${transferApprovalSql("ap.approval", "m")}))`,
        [v.transferId],
      );
      guard(
        `NOT EXISTS(SELECT 1 FROM transfer_lines l JOIN transfers t ON t.id=l.transfer_id LEFT JOIN phones ph ON ph.id=l.item_id LEFT JOIN accessory_balances b ON b.item_id=l.item_id AND b.store_id=t.source_store WHERE l.transfer_id=? AND((l.kind='phone' AND(l.quantity<>1 OR ph.id IS NULL OR ph.barcode<>l.code OR ph.store_id<>t.source_store OR ph.state<>?)) OR(l.kind='accessory' AND ${dispatch ? "(b.quantity IS NULL OR b.quantity<l.quantity OR NOT EXISTS(SELECT 1 FROM catalog WHERE id=l.item_id AND sku=l.code AND kind='accessory'))" : "NOT EXISTS(SELECT 1 FROM stock_movements WHERE command_key IN(SELECT command_key FROM transfer_dispatches WHERE transfer_id=?) AND item_id=l.item_id AND delta=-l.quantity AND reason='TRANSFER_OUT')"})))`,
        dispatch ? [v.transferId, "AVAILABLE"] : [v.transferId, "IN_TRANSIT", v.transferId],
      );
      if (dispatch) {
        write(
          `UPDATE phones SET state='IN_TRANSIT' WHERE id IN(SELECT item_id FROM transfer_lines WHERE transfer_id=? AND kind='phone') AND ${pending}`,
          [v.transferId],
        );
        write(
          `UPDATE accessory_balances SET quantity=quantity-(SELECT quantity FROM transfer_lines WHERE transfer_id=? AND item_id=accessory_balances.item_id AND kind='accessory') WHERE store_id=? AND item_id IN(SELECT item_id FROM transfer_lines WHERE transfer_id=? AND kind='accessory') AND ${pending}`,
          [v.transferId, store, v.transferId],
        );
        write(
          `INSERT INTO transfer_dispatches(transfer_id,actor_id,evidence,command_key,carrier) SELECT ?,?,?,?,? WHERE ${pending}`,
          [v.transferId, actor, v.evidence, e.key, p("transfer.dispatch").carrier ?? ""],
        );
      } else {
        // Require a distinct receiving actor; no silent self-receipt.
        guard(`EXISTS(SELECT 1 FROM transfer_dispatches WHERE transfer_id=? AND actor_id<>?)`, [
          v.transferId,
          actor,
        ]);
        write(
          `INSERT INTO transfer_discrepancies SELECT l.transfer_id,l.item_id,l.quantity-CASE WHEN a.damaged=0 THEN COALESCE(a.quantity,0) ELSE 0 END,CASE WHEN a.damaged=1 THEN 'DAMAGED' ELSE 'MISSING' END FROM transfer_lines l LEFT JOIN transfer_arrivals a USING(transfer_id,item_id) WHERE l.transfer_id=? AND (a.damaged=1 OR COALESCE(a.quantity,0)<l.quantity) AND ${pending}`,
          [v.transferId],
        );
        write(
          `UPDATE phones SET state='AVAILABLE',store_id=? WHERE id IN(SELECT l.item_id FROM transfer_lines l JOIN transfer_arrivals a USING(transfer_id,item_id) WHERE l.transfer_id=? AND l.kind='phone' AND a.damaged=0) AND ${pending}`,
          [store, v.transferId],
        );
        write(
          `INSERT INTO accessory_balances SELECT ?,l.item_id,a.quantity FROM transfer_lines l JOIN transfer_arrivals a USING(transfer_id,item_id) WHERE l.transfer_id=? AND l.kind='accessory' AND a.damaged=0 AND ${pending} ON CONFLICT(store_id,item_id) DO UPDATE SET quantity=quantity+excluded.quantity`,
          [store, v.transferId],
        );
        write(`INSERT INTO transfer_receipts SELECT ?,?,? WHERE ${pending}`, [
          v.transferId,
          actor,
          v.evidence,
        ]);
      }
      write(
        dispatch
          ? `INSERT INTO stock_movements SELECT ?||':'||item_id,?,?,item_id,quantity*? ,? FROM transfer_lines WHERE transfer_id=? AND ${pending}`
          : `INSERT INTO stock_movements SELECT ?||':'||l.item_id,?,?,l.item_id,a.quantity*?,? FROM transfer_lines l JOIN transfer_arrivals a USING(transfer_id,item_id) WHERE l.transfer_id=? AND a.damaged=0 AND ${pending}`,
        [
          tx,
          e.key,
          store,
          dispatch ? -1 : 1,
          dispatch ? "TRANSFER_OUT" : "TRANSFER_IN",
          v.transferId,
        ],
      );
      write(`UPDATE transfers SET stage=? WHERE id=? AND ${pending}`, [
        dispatch ? "IN_TRANSIT" : "COMPLETED",
        v.transferId,
      ]);
      write(`DELETE FROM transfer_scans WHERE transfer_id=? AND ${pending}`, [v.transferId]);
      break;
    }
    case "facility.draft": {
      const v = p(operation);
      status = "POLICY_BLOCKED";
      write(`INSERT INTO facilities SELECT ?,'M01',?,?,?,?, 'POLICY_BLOCKED' WHERE ${pending}`, [
        v.id,
        v.customerId,
        v.employer,
        toCentimes(v.cashPrice),
        toCentimes(v.schedule.contractPrice),
      ]);
      write(
        `INSERT INTO installments SELECT ?,json_extract(value,'$.month'),json_extract(value,'$.amount') FROM json_each(?) WHERE ${pending}`,
        [
          v.id,
          JSON.stringify(
            v.schedule.installments.map((i) => ({ month: i.month, amount: toCentimes(i.amount) })),
          ),
        ],
      );
      break;
    }
    case "facility.evidence": {
      const v = p(operation);
      status = "POLICY_BLOCKED";
      guard(`EXISTS(SELECT 1 FROM facilities WHERE id=? AND store_id='M01')`, [v.facilityId]);
      write(`INSERT INTO facility_evidence SELECT ?,?,?,?,?, 'UNVERIFIED' WHERE ${pending}`, [
        tx,
        v.facilityId,
        v.kind,
        toCentimes(v.amount),
        v.document,
      ]);
      break;
    }
    case "sav.open": {
      const v = p(operation);
      guard(
        `EXISTS(SELECT 1 FROM sales WHERE (id=? OR public_ref=?) AND store_id=?) AND EXISTS(SELECT 1 FROM sale_lines l JOIN phone_identifiers i ON i.phone_id=l.item_id WHERE l.sale_id=(SELECT id FROM sales WHERE (id=? OR public_ref=?) AND store_id=?) AND l.kind='phone' AND l.item_id=? AND i.identifier=?)`,
        [v.saleId, v.saleId, store, v.saleId, v.saleId, store, v.phoneId, v.imei],
      );
      write(
        `INSERT INTO service_cases SELECT ?,(SELECT id FROM sales WHERE (id=? OR public_ref=?) AND store_id=?),?,?,'INSPECTION',? WHERE ${pending}`,
        [v.id, v.saleId, v.saleId, store, v.phoneId, v.customerId, v.issue],
      );
      break;
    }
    case "sav.event": {
      const v = p(operation);
      guard(
        `EXISTS(SELECT 1 FROM service_cases c JOIN sales s ON s.id=c.sale_id WHERE c.id=? AND s.store_id=?)`,
        [v.caseId, store],
      );
      write(`INSERT INTO service_events SELECT ?,?,?,?,? WHERE ${pending}`, [
        tx,
        v.caseId,
        actor,
        v.note,
        v.evidence,
      ]);
      break;
    }
    case "sav.refund.review": {
      const v = p(operation);
      status = "POLICY_BLOCKED";
      guard(
        `EXISTS(SELECT 1 FROM service_cases c JOIN sales s ON s.id=c.sale_id WHERE c.id=? AND s.store_id=?)`,
        [v.caseId, store],
      );
      write(`INSERT INTO refund_reviews SELECT ?,?,?,?,'POLICY_BLOCKED' WHERE ${pending}`, [
        tx,
        v.caseId,
        toCentimes(v.amount),
        v.evidence,
      ]);
      break;
    }
    case "expense.draft": {
      const v = p(operation);
      status = "POLICY_BLOCKED";
      write(`INSERT INTO expenses SELECT ?,?,?,?,'POLICY_BLOCKED' WHERE ${pending}`, [
        v.id,
        store,
        toCentimes(v.amount),
        v.evidence,
      ]);
      break;
    }
    case "account.provision":
    case "role.replace": {
      const v = p(operation);
      guard(
        `?<>? AND NOT EXISTS(SELECT 1 FROM memberships WHERE user_id=? AND role='SUPER_ADMIN')`,
        [v.userId, actor, v.userId],
      );
      if (operation === "account.provision")
        write(`INSERT INTO accounts SELECT ?,1 WHERE ${pending}`, [v.userId]);
      else {
        guard(`EXISTS(SELECT 1 FROM accounts WHERE id=?)`, [v.userId]);
        write(`UPDATE accounts SET active=1 WHERE id=? AND ${pending}`, [v.userId]);
        write(`DELETE FROM memberships WHERE user_id=? AND ${pending}`, [v.userId]);
      }
      write(`INSERT INTO memberships SELECT ?,?,? WHERE ${pending}`, [
        v.userId,
        v.targetStore,
        v.role,
      ]);
      write(`UPDATE sessions SET revoked=1 WHERE user_id=? AND ${pending}`, [v.userId]);
      break;
    }
    case "account.revoke": {
      const v = p(operation);
      guard(
        `?<>? AND EXISTS(SELECT 1 FROM accounts WHERE id=?) AND NOT EXISTS(SELECT 1 FROM memberships WHERE user_id=? AND role='SUPER_ADMIN')`,
        [v.userId, actor, v.userId, v.userId],
      );
      write(`UPDATE accounts SET active=0 WHERE id=? AND ${pending}`, [v.userId]);
      write(`UPDATE sessions SET revoked=1 WHERE user_id=? AND ${pending}`, [v.userId]);
      break;
    }
    case "document.register": {
      const v = p(operation);
      status = "DRAFT";
      write(`INSERT INTO documents SELECT ?,?,?,?,?,'PENDING' WHERE ${pending}`, [
        v.id,
        store,
        `${store}/${v.id}`,
        actor,
        v.mime,
      ]);
      write(`INSERT INTO document_integrity SELECT ?,?,? WHERE ${pending}`, [
        v.id,
        v.size,
        v.sha256,
      ]);
      break;
    }
  }
  write(`INSERT INTO command_status SELECT ?,? WHERE ${pending}`, [e.key, status]);
  add(
    `UPDATE commands SET state='DONE',response_json=json_object('key',key,'transactionId',transaction_id,'status',?) WHERE key=? AND state='STARTED'`,
    status,
    e.key,
  );
  add(`DELETE FROM command_guards WHERE key=?`, e.key);
  add(`SELECT response_json FROM commands WHERE key=? AND state='DONE'`, e.key);
  return out;
}

/** Previous-row projection for upsert operations; NULL for append-only operations. */
function beforeRow(
  operation: NativeOperation,
  v: Record<string, unknown>,
  store: string,
): { sql: string; params: SqlStatement["params"] } {
  const id = String(v["id"] ?? "");
  switch (operation) {
    case "customer.save":
      return {
        sql: "(SELECT json_object('id',id,'store',store_id,'name',name,'reference',reference) FROM customers WHERE id=?)",
        params: [id],
      };
    case "supplier.save":
      return {
        sql: "(SELECT json_object('id',id,'store',store_id,'name',name,'reference',reference) FROM suppliers WHERE id=?)",
        params: [id],
      };
    case "catalog.save":
      return {
        sql: "(SELECT json_object('id',id,'kind',kind,'sku',sku,'name',name,'attributes',json(attributes_json)) FROM catalog WHERE id=?)",
        params: [id],
      };
    case "settings.save":
      return {
        sql: "(SELECT json_object('key',key,'value',json(value_json),'updatedAt',updated_at) FROM app_settings WHERE key=?)",
        params: [String(v["key"] ?? "")],
      };
    case "price.set":
      return {
        sql: "(SELECT json_object('store',store_id,'itemId',item_id,'amountMinor',amount_minor) FROM prices WHERE store_id=? AND item_id=?)",
        params: [store, String(v["itemId"] ?? "")],
      };
    case "purchase.save":
      return {
        sql: "(SELECT json_object('id',id,'store',store_id,'supplierId',supplier_id,'itemId',item_id,'quantity',quantity,'state',state,'evidence',evidence) FROM purchases WHERE id=?)",
        params: [id],
      };
    default:
      return { sql: "NULL", params: [] };
  }
}
