-- Phase 1 audit fix (2026-11-10). Additive: no row is changed; 0016-0018 are not edited.
-- Agency recommendation, pending owner confirmation (docs/DECISION_REGISTER.md D-2026-11-10-01/02):
-- the sale discount is split across lines in proportion to price; a SAV return is worth the
-- returned line's NET amount = gross - ceil(discount * gross / sale_gross), i.e. floor(gross * total / sale_gross),
-- computed without multiplying two sale-sized amounts. Rounding always favours the store by < 1 centime per line.
CREATE VIEW sale_line_net AS SELECT sale_id,item_id,kind,gross_minor,gross_minor-((discount_minor*gross_minor+sale_gross_minor-1)/sale_gross_minor) net_minor FROM (SELECT l.sale_id,l.item_id,l.kind,l.unit_minor*l.quantity gross_minor,(SELECT sum(x.unit_minor*x.quantity) FROM sale_lines x WHERE x.sale_id=l.sale_id) sale_gross_minor,max(0,(SELECT sum(x.unit_minor*x.quantity) FROM sale_lines x WHERE x.sale_id=l.sale_id)-s.total_minor) discount_minor FROM sale_lines l JOIN sales s ON s.id=l.sale_id);
-- Net value of every phone line returned through a REFUND outcome (plain return or exchange).
CREATE VIEW sav_returned_net AS SELECT sc.sale_id,sum(n.net_minor) returned_net_minor FROM sav_outcomes o JOIN service_cases sc ON sc.id=o.case_id JOIN sale_line_net n ON n.sale_id=sc.sale_id AND n.item_id=sc.phone_id AND n.kind='phone' WHERE o.outcome='REFUND' GROUP BY sc.sale_id;
-- Per-sale money position. refundable = min(paid, max(0, returned net - outstanding debt before returns)).
CREATE VIEW sale_refund_capacity AS SELECT sale_id,upfront_minor,credit_minor,repaid_minor,returned_net_minor,refunded_minor,min(upfront_minor+repaid_minor,max(0,returned_net_minor-max(0,credit_minor-repaid_minor))) refundable_minor FROM (SELECT s.id sale_id,COALESCE((SELECT cash_minor+bank_minor FROM sale_settlements WHERE sale_id=s.id),(SELECT amount_minor FROM payments WHERE sale_id=s.id),0) upfront_minor,COALESCE((SELECT amount_minor FROM sale_credits WHERE sale_id=s.id),0) credit_minor,COALESCE((SELECT sum(r.amount_minor) FROM credit_repayments r WHERE r.sale_id=s.id AND NOT EXISTS(SELECT 1 FROM credit_repayment_reversals x WHERE x.repayment_id=r.id)),0) repaid_minor,COALESCE((SELECT returned_net_minor FROM sav_returned_net WHERE sale_id=s.id),0) returned_net_minor,COALESCE((SELECT sum(amount_minor) FROM sav_refunds WHERE sale_id=s.id),0) refunded_minor FROM sales s);
-- Credit return: the debt drops by the returned line's NET amount only (supersedes the gross rule of 0018).
DROP VIEW credit_balances;
CREATE VIEW credit_balances AS SELECT c.*,
CASE WHEN v.sale_id IS NOT NULL THEN 0 ELSE max(0,c.amount_minor-k.repaid_minor-k.returned_net_minor) END balance_minor,
CASE WHEN v.sale_id IS NOT NULL THEN 'VOID'
WHEN c.amount_minor=k.repaid_minor THEN 'PAID'
WHEN c.amount_minor-k.repaid_minor-k.returned_net_minor<=0 THEN 'VOID'
ELSE 'OPEN' END state
FROM sale_credits c JOIN sale_refund_capacity k ON k.sale_id=c.sale_id LEFT JOIN sale_voids v ON v.sale_id=c.sale_id;
-- Every SAV refund (cash, bank, credit or not): cumulative refunds never exceed the returned lines'
-- net amount not absorbed by remaining debt, and never exceed what was paid. The refunded case must
-- carry a REFUND outcome on the same sale. 0016/0018 caps stay in place (they are looser).
CREATE TRIGGER sav_refund_net_cap BEFORE INSERT ON sav_refunds WHEN NOT EXISTS(SELECT 1 FROM sav_outcomes o JOIN service_cases c ON c.id=o.case_id WHERE o.case_id=NEW.case_id AND o.outcome='REFUND' AND c.sale_id=NEW.sale_id) OR NEW.amount_minor+COALESCE((SELECT refunded_minor FROM sale_refund_capacity WHERE sale_id=NEW.sale_id),0) > COALESCE((SELECT refundable_minor FROM sale_refund_capacity WHERE sale_id=NEW.sale_id),0) BEGIN SELECT RAISE(ABORT,'REJECTED'); END;
