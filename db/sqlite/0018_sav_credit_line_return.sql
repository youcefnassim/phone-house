-- Batch 9d (interim, pending owner confirmation): a SAV return reduces the sale credit only by the returned
-- phone line amount: balance = max(0, credit - repayments - returned lines). A full sale void still voids it.
-- Additive: no row is changed; 0017 is superseded by redefining the derived view.
DROP VIEW credit_balances;
CREATE VIEW credit_balances AS SELECT c.*,
CASE WHEN v.sale_id IS NOT NULL THEN 0 ELSE max(0,c.amount_minor-COALESCE((SELECT sum(r.amount_minor) FROM credit_repayments r WHERE r.sale_id=c.sale_id AND NOT EXISTS(SELECT 1 FROM credit_repayment_reversals x WHERE x.repayment_id=r.id)),0)-COALESCE((SELECT sum(l.unit_minor*l.quantity) FROM sav_outcomes o JOIN service_cases sc ON sc.id=o.case_id JOIN sale_lines l ON l.sale_id=sc.sale_id AND l.item_id=sc.phone_id AND l.kind='phone' WHERE o.outcome='REFUND' AND sc.sale_id=c.sale_id),0)) END balance_minor,
CASE WHEN v.sale_id IS NOT NULL THEN 'VOID'
WHEN c.amount_minor=COALESCE((SELECT sum(r.amount_minor) FROM credit_repayments r WHERE r.sale_id=c.sale_id AND NOT EXISTS(SELECT 1 FROM credit_repayment_reversals x WHERE x.repayment_id=r.id)),0) THEN 'PAID'
WHEN c.amount_minor-COALESCE((SELECT sum(r.amount_minor) FROM credit_repayments r WHERE r.sale_id=c.sale_id AND NOT EXISTS(SELECT 1 FROM credit_repayment_reversals x WHERE x.repayment_id=r.id)),0)-COALESCE((SELECT sum(l.unit_minor*l.quantity) FROM sav_outcomes o JOIN service_cases sc ON sc.id=o.case_id JOIN sale_lines l ON l.sale_id=sc.sale_id AND l.item_id=sc.phone_id AND l.kind='phone' WHERE o.outcome='REFUND' AND sc.sale_id=c.sale_id),0)<=0 THEN 'VOID'
ELSE 'OPEN' END state
FROM sale_credits c LEFT JOIN sale_voids v ON v.sale_id=c.sale_id;
-- On a credit sale, cumulative refunds never exceed the returned amount not absorbed by the remaining debt.
CREATE TRIGGER sav_refund_credit_excess BEFORE INSERT ON sav_refunds WHEN EXISTS(SELECT 1 FROM sale_credits WHERE sale_id=NEW.sale_id) AND NEW.amount_minor+COALESCE((SELECT sum(amount_minor) FROM sav_refunds WHERE sale_id=NEW.sale_id),0) > max(0,COALESCE((SELECT sum(l.unit_minor*l.quantity) FROM sav_outcomes o JOIN service_cases sc ON sc.id=o.case_id JOIN sale_lines l ON l.sale_id=sc.sale_id AND l.item_id=sc.phone_id AND l.kind='phone' WHERE o.outcome='REFUND' AND sc.sale_id=NEW.sale_id),0)-((SELECT amount_minor FROM sale_credits WHERE sale_id=NEW.sale_id)-COALESCE((SELECT sum(r.amount_minor) FROM credit_repayments r WHERE r.sale_id=NEW.sale_id AND NOT EXISTS(SELECT 1 FROM credit_repayment_reversals x WHERE x.repayment_id=r.id)),0))) BEGIN SELECT RAISE(ABORT,'REJECTED'); END;
