-- Owner decision 2026-11-10: a partial SAV refund records the unrefunded remainder, with a reason, in the
-- same append-only sav_refund_declines ledger. Additive: 0020 is not edited; its amount trigger is replaced
-- so a decline may follow a refund row on the same case. The declined amount must still equal exactly what
-- remains refundable at insert time (so it is never zero and never more than is due).
DROP TRIGGER sav_refund_decline_amount;
CREATE TRIGGER sav_refund_decline_amount BEFORE INSERT ON sav_refund_declines WHEN NOT EXISTS(SELECT 1 FROM sav_outcomes WHERE case_id=NEW.case_id AND outcome='REFUND') OR NEW.declined_minor<>COALESCE((SELECT k.refundable_minor-k.refunded_minor FROM sale_refund_capacity k JOIN service_cases c ON c.sale_id=k.sale_id WHERE c.id=NEW.case_id),0) BEGIN SELECT RAISE(ABORT,'REJECTED'); END;
