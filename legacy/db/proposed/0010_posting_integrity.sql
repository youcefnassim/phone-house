-- REVIEW07 SOURCE ONLY / NOT RUN. Additional invariant enforcement, not policy approval.
BEGIN;
GRANT CREATE ON SCHEMA public,private TO ph_engine;
CREATE FUNCTION private.sale_line_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF NEW.phone_unit_id IS NOT NULL THEN
  IF NOT EXISTS(SELECT 1 FROM public.phone_units WHERE id=NEW.phone_unit_id AND store_id=NEW.store_id AND status='SOLD' AND sale_price=NEW.unit_price) THEN RAISE EXCEPTION 'Sold phone store/price mismatch' USING ERRCODE='23514'; END IF;
 ELSE
  IF NOT EXISTS(SELECT 1 FROM public.catalog_entries c JOIN public.accessory_balances b ON b.catalog_id=c.id WHERE c.id=NEW.catalog_id AND c.kind='accessory_sku' AND b.store_id=NEW.store_id) THEN RAISE EXCEPTION 'Accessory subtype/store mismatch' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER sale_line_integrity BEFORE INSERT ON public.sale_lines FOR EACH ROW EXECUTE FUNCTION private.sale_line_guard();
CREATE FUNCTION private.receipt_cap() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE cap integer;
BEGIN
 SELECT quantity INTO cap FROM public.purchases WHERE id=NEW.purchase_id AND store_id=NEW.store_id FOR UPDATE;
 IF NEW.quantity+COALESCE((SELECT sum(quantity) FROM public.purchase_receipts WHERE purchase_id=NEW.purchase_id),0)>cap THEN RAISE EXCEPTION 'Receipt exceeds purchase' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER receipt_limit BEFORE INSERT ON public.purchase_receipts FOR EACH ROW EXECUTE FUNCTION private.receipt_cap();
CREATE FUNCTION private.financial_source_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE op text; source uuid; s text;
BEGIN
 op:=CASE TG_TABLE_NAME WHEN 'sales' THEN 'pos.checkout' WHEN 'cash_movements' THEN 'cash.movement' WHEN 'repayments' THEN 'debt.repayment' END;
 source:=NEW.id;s:=NEW.store_id;
 -- SALE/REPAYMENT movements are validated against their source's journal instead.
 IF TG_TABLE_NAME='cash_movements' THEN
  IF NEW.reason IN ('SALE','REPAYMENT') THEN
   source:=NEW.reference::uuid;op:=CASE NEW.reason WHEN 'SALE' THEN 'pos.checkout' ELSE 'debt.repayment' END;
  END IF;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM private.journals j JOIN private.audit_events a ON a.operation=j.operation AND a.subject_id=j.subject_id AND a.actor_id=j.actor_id AND a.store_id=j.store_id WHERE j.subject_id=source AND j.operation=op AND j.store_id=s) THEN RAISE EXCEPTION 'Posting journal/audit required' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER sale_posting_required AFTER INSERT ON public.sales DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION private.financial_source_guard();
CREATE CONSTRAINT TRIGGER movement_posting_required AFTER INSERT ON public.cash_movements DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION private.financial_source_guard();
CREATE CONSTRAINT TRIGGER repayment_posting_required AFTER INSERT ON public.repayments DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION private.financial_source_guard();
CREATE FUNCTION private.reversal_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF NEW.reversal_of IS NOT NULL AND NOT EXISTS(SELECT 1 FROM private.journals WHERE id=NEW.reversal_of AND store_id=NEW.store_id) THEN RAISE EXCEPTION 'Same-store original journal required' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER reversal_provenance BEFORE INSERT ON private.journals FOR EACH ROW EXECUTE FUNCTION private.reversal_guard();
CREATE FUNCTION private.sale_totals() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE s uuid;
BEGIN
 IF TG_TABLE_NAME='sales' THEN
  s:=NEW.id;
 ELSE
  s:=NEW.sale_id;
 END IF;
 IF EXISTS(SELECT 1 FROM public.sales WHERE id=s AND (total<>COALESCE((SELECT sum(quantity*unit_price) FROM public.sale_lines WHERE sale_id=s),0) OR total<>COALESCE((SELECT sum(amount) FROM public.sale_payments WHERE sale_id=s),0))) THEN RAISE EXCEPTION 'Sale line/payment totals mismatch' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER sale_total_required AFTER INSERT ON public.sales DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION private.sale_totals();
CREATE CONSTRAINT TRIGGER line_total_required AFTER INSERT ON public.sale_lines DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION private.sale_totals();
CREATE CONSTRAINT TRIGGER payment_total_required AFTER INSERT ON public.sale_payments DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION private.sale_totals();
ALTER FUNCTION private.sale_line_guard() OWNER TO ph_engine;
REVOKE ALL ON FUNCTION private.sale_line_guard() FROM PUBLIC,anon,authenticated,service_role;
ALTER FUNCTION private.receipt_cap() OWNER TO ph_engine;
REVOKE ALL ON FUNCTION private.receipt_cap() FROM PUBLIC,anon,authenticated,service_role;
ALTER FUNCTION private.financial_source_guard() OWNER TO ph_engine;
REVOKE ALL ON FUNCTION private.financial_source_guard() FROM PUBLIC,anon,authenticated,service_role;
ALTER FUNCTION private.reversal_guard() OWNER TO ph_engine;
REVOKE ALL ON FUNCTION private.reversal_guard() FROM PUBLIC,anon,authenticated,service_role;
ALTER FUNCTION private.sale_totals() OWNER TO ph_engine;
REVOKE ALL ON FUNCTION private.sale_totals() FROM PUBLIC,anon,authenticated,service_role;
REVOKE CREATE ON SCHEMA public,private FROM ph_engine;
COMMIT;
