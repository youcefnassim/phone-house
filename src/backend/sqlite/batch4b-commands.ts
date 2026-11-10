import { nativePayloads, type NativeOperation } from "@/domain/native-commands";
import { toCentimes } from "./checkout";
import type { SqlStatement } from "./port";
import { membershipSql } from "@/domain/permissions";
/**
 * Remaining refundable centimes for the sale of SAV case `?` (one param: case id).
 * Server-side check written inline, independent of the 0019 views, so either layer alone
 * blocks an over-refund. Net line = gross - ceil(discount * gross / sale gross) (discount split
 * by price); refundable = min(paid, max(0, returned net - outstanding debt)) - already refunded.
 * REFUND outcomes already written earlier in the same batch are included.
 */
export const savRemainingRefundableSql = `(WITH k AS (SELECT sale_id id FROM service_cases WHERE id=?),
g AS (SELECT s.total_minor total,(SELECT sum(l.unit_minor*l.quantity) FROM sale_lines l WHERE l.sale_id=s.id) gross FROM sales s JOIN k ON k.id=s.id),
r AS (SELECT COALESCE(sum(l.unit_minor*l.quantity-((max(0,g.gross-g.total)*l.unit_minor*l.quantity+g.gross-1)/g.gross)),0) net FROM sav_outcomes o JOIN service_cases c ON c.id=o.case_id JOIN k ON k.id=c.sale_id JOIN sale_lines l ON l.sale_id=c.sale_id AND l.item_id=c.phone_id AND l.kind='phone' CROSS JOIN g WHERE o.outcome='REFUND'),
m AS (SELECT COALESCE((SELECT cash_minor+bank_minor FROM sale_settlements WHERE sale_id=k.id),(SELECT amount_minor FROM payments WHERE sale_id=k.id),0) paid,COALESCE((SELECT amount_minor FROM sale_credits WHERE sale_id=k.id),0) credit,COALESCE((SELECT sum(x.amount_minor) FROM credit_repayments x WHERE x.sale_id=k.id AND NOT EXISTS(SELECT 1 FROM credit_repayment_reversals y WHERE y.repayment_id=x.id)),0) repaid,COALESCE((SELECT sum(amount_minor) FROM sav_refunds WHERE sale_id=k.id),0) refunded FROM k)
SELECT min(m.paid+m.repaid,max(0,r.net-max(0,m.credit-m.repaid)))-m.refunded FROM m CROSS JOIN r)`;
export function planBatch4b(
  operation: NativeOperation,
  payload: unknown,
  key: string,
  tx: string,
  actor: string,
  now: number,
): SqlStatement[] {
  const out: SqlStatement[] = [];
  const pending = "EXISTS(SELECT 1 FROM commands WHERE key=? AND state='STARTED')";
  const write = (sql: string, params: SqlStatement["params"]) =>
    out.push({ sql, params: [...params, key] });
  const guard = (sql: string, params: SqlStatement["params"]) =>
    write(
      `INSERT INTO command_guards SELECT ?,CASE WHEN (${sql}) THEN 1 ELSE 0 END WHERE ${pending}`,
      [key, ...params],
    );
  if (operation === "used.purchase") {
    const v = nativePayloads[operation].parse(payload);
    guard(
      `EXISTS(SELECT 1 FROM catalog WHERE id=? AND kind='phone' AND json_extract(attributes_json,'$.condition')='USED')`,
      [v.catalogId],
    );
    guard(`EXISTS(SELECT 1 FROM shifts WHERE id=? AND store_id=? AND state='OPEN')`, [
      v.shiftId,
      v.store,
    ]);
    guard(
      `EXISTS(SELECT 1 FROM memberships WHERE user_id=? AND ${membershipSql("used.purchase")})`,
      [actor, v.store],
    );
    write(
      `INSERT INTO phones(id,store_id,catalog_id,barcode,state,attributes_json,serial) SELECT ?,?,?,?,'AVAILABLE','{"condition":"USED"}',? WHERE ${pending}`,
      [v.id, v.store, v.catalogId, v.barcode, v.serial],
    );
    write(`INSERT INTO phone_identifiers SELECT ?,?,1 WHERE ${pending}`, [v.imei, v.id]);
    write(`INSERT INTO individual_purchases SELECT ?,?,?,?,?,?,1,?,?,? WHERE ${pending}`, [
      v.id,
      key,
      v.store,
      v.surname,
      v.givenName,
      v.phone,
      toCentimes(v.amount),
      actor,
      now,
    ]);
    write(`INSERT INTO cash_adjustments SELECT ?,?,?,?,?,?,?,? WHERE ${pending}`, [
      tx,
      key,
      v.shiftId,
      actor,
      -toCentimes(v.amount),
      "USED_PURCHASE",
      "",
      now,
    ]);
    write(`INSERT INTO stock_movements SELECT ?,?,?,?,1,'USED_PURCHASE' WHERE ${pending}`, [
      tx,
      key,
      v.store,
      v.id,
    ]);
    write(`INSERT INTO journals SELECT ?,'CASH',0,?,NULL WHERE ${pending}`, [
      key,
      toCentimes(v.amount),
    ]);
    write(`INSERT INTO journals SELECT ?,'INVENTORY',?,0,NULL WHERE ${pending}`, [
      key,
      toCentimes(v.amount),
    ]);
  } else if (operation === "sav.restock") {
    const v = nativePayloads[operation].parse(payload);
    guard(
      `EXISTS(SELECT 1 FROM sav_holding h JOIN phones p ON p.id=h.phone_id WHERE p.id=? AND p.store_id=? AND p.state='RETURN_BLOCKED')`,
      [v.phoneId, v.store],
    );
    write(`INSERT INTO sav_restocks SELECT ?,?,?,?,? WHERE ${pending}`, [
      v.phoneId,
      key,
      actor,
      v.note,
      now,
    ]);
    write(`UPDATE phones SET state='AVAILABLE' WHERE id=? AND ${pending}`, [v.phoneId]);
  } else if (operation === "sav.track" || operation === "sav.outcome") {
    const v = nativePayloads[operation].parse(payload);
    guard(
      `EXISTS(SELECT 1 FROM service_cases c JOIN sales s ON s.id=c.sale_id WHERE c.id=? AND s.store_id=?) AND NOT EXISTS(SELECT 1 FROM sav_outcomes WHERE case_id=?)`,
      [v.caseId, v.store, v.caseId],
    );
    if (operation === "sav.track") {
      const v = nativePayloads[operation].parse(payload);
      if (v.status === "SENT_DISTRIBUTOR" || v.status === "RETURNED") {
        guard(
          `EXISTS(SELECT 1 FROM service_cases c JOIN warranty_requests w ON w.sale_id=c.sale_id AND w.phone_id=c.phone_id WHERE c.id=? AND w.provider='MANUFACTURER' AND w.requested=1)`,
          [v.caseId],
        );
        if (v.status === "RETURNED")
          guard(
            `(SELECT status FROM sav_tracking WHERE case_id=? ORDER BY at DESC,rowid DESC LIMIT 1)='SENT_DISTRIBUTOR'`,
            [v.caseId],
          );
      }
      write(`INSERT INTO sav_tracking SELECT ?,?,?,?,?,?,?,? WHERE ${pending}`, [
        tx,
        key,
        v.caseId,
        v.status,
        v.paidRepairNeeded ? 1 : 0,
        v.note,
        actor,
        now,
      ]);
    } else {
      const v = nativePayloads[operation].parse(payload);
      write(`INSERT INTO sav_outcomes SELECT ?,?,?,?,?,? WHERE ${pending}`, [
        v.caseId,
        key,
        v.outcome,
        v.note,
        actor,
        now,
      ]);
      if (v.outcome === "REFUND") {
        guard(
          `EXISTS(SELECT 1 FROM service_cases c JOIN phones p ON p.id=c.phone_id WHERE c.id=? AND p.store_id=? AND p.state='SOLD')`,
          [v.caseId, v.store],
        );
        write(
          `INSERT INTO sav_holding SELECT phone_id,id FROM service_cases WHERE id=? AND ${pending}`,
          [v.caseId],
        );
        write(
          `UPDATE phones SET state='RETURN_BLOCKED' WHERE id=(SELECT phone_id FROM service_cases WHERE id=?) AND ${pending}`,
          [v.caseId],
        );
        if (v.amount) {
          // P0: never refund more than the returned line's net amount not absorbed by debt.
          guard(`? <= ${savRemainingRefundableSql}`, [toCentimes(v.amount), v.caseId]);
          write(
            `INSERT INTO sav_refunds SELECT ?,?,?,sale_id,?,?,?,?,?,? FROM service_cases WHERE id=? AND ${pending}`,
            [
              tx,
              key,
              v.caseId,
              toCentimes(v.amount ?? "0"),
              v.method ?? null,
              v.bankMethod ?? null,
              v.shiftId ?? null,
              actor,
              now,
              v.caseId,
            ],
          );
          if (v.method === "Cash")
            write(`INSERT INTO cash_adjustments SELECT ?,?,?,?,?,?,?,? WHERE ${pending}`, [
              tx,
              key,
              v.shiftId ?? null,
              actor,
              -toCentimes(v.amount ?? "0"),
              "SAV_REFUND",
              "",
              now,
            ]);
          write(`INSERT INTO journals SELECT ?,?,0,?,? WHERE ${pending}`, [
            key,
            v.method === "Cash" ? "CASH" : "BANK_UNRECONCILED",
            toCentimes(v.amount ?? "0"),
            v.bankMethod ?? null,
          ]);
          write(`INSERT INTO journals SELECT ?,'SAV_REFUND',?,0,NULL WHERE ${pending}`, [
            key,
            toCentimes(v.amount ?? "0"),
          ]);
          if (v.declineReason) {
            // Partial refund: the exact unrefunded remainder is waived with a reason (append-only).
            guard(`${savRemainingRefundableSql} > 0`, [v.caseId]);
            write(
              `INSERT INTO sav_refund_declines SELECT ?,?,${savRemainingRefundableSql},?,?,? WHERE ${pending}`,
              [v.caseId, key, v.caseId, v.declineReason, actor, now],
            );
          } else {
            // No reason: the refund must settle everything still due (never a silent remainder).
            guard(`${savRemainingRefundableSql} <= 0`, [v.caseId]);
          }
        } else if (v.refundDeclined) {
          // 3b: explicit, reasoned waiver of money actually due; records the waived amount.
          // Role is enforced by permissions (sav.outcome) and again by the 0020 trigger.
          guard(`${savRemainingRefundableSql} > 0`, [v.caseId]);
          write(
            `INSERT INTO sav_refund_declines SELECT ?,?,${savRemainingRefundableSql},?,?,? WHERE ${pending}`,
            [v.caseId, key, v.caseId, v.declineReason ?? "", actor, now],
          );
        } else {
          // 3b: no amount and no decline is only allowed when nothing is due (debt absorbs it).
          guard(`${savRemainingRefundableSql} <= 0`, [v.caseId]);
        }
      }
    }
  }
  return out;
}
