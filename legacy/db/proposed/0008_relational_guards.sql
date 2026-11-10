-- REVIEW07 SOURCE ONLY / NOT RUN. Owner approval required before execution.
BEGIN;
CREATE FUNCTION private.catalog_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF (NEW.id,NEW.kind,NEW.barcode) IS DISTINCT FROM (OLD.id,OLD.kind,OLD.barcode) THEN RAISE EXCEPTION 'Catalog identity immutable' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER catalog_identity BEFORE UPDATE ON public.catalog_entries FOR EACH ROW EXECUTE FUNCTION private.catalog_immutable();
CREATE FUNCTION private.repayment_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE cap numeric;
BEGIN
 SELECT amount INTO cap FROM public.debts WHERE id=NEW.debt_id FOR UPDATE;
 IF NEW.amount+COALESCE((SELECT sum(amount) FROM public.repayments WHERE debt_id=NEW.debt_id),0)>cap THEN RAISE EXCEPTION 'Cumulative repayment exceeds debt' USING ERRCODE='23514'; END IF;
 IF NEW.method='Cash' THEN PERFORM private.lock_shift(NEW.shift_id,NEW.store_id); END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER repayment_cap BEFORE INSERT ON public.repayments FOR EACH ROW EXECUTE FUNCTION private.repayment_guard();
CREATE FUNCTION private.refund_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE cap numeric;
BEGIN
 SELECT total INTO cap FROM public.sales WHERE id=NEW.sale_id AND store_id=NEW.store_id FOR UPDATE;
 IF NEW.amount+COALESCE((SELECT sum(amount) FROM public.refunds WHERE sale_id=NEW.sale_id),0)>cap THEN RAISE EXCEPTION 'Cumulative refund exceeds original sale' USING ERRCODE='23514'; END IF;
 -- Commercial eligibility remains OPEN; no callable refund command is granted.
 RETURN NEW;
END $$;
CREATE TRIGGER refund_cap BEFORE INSERT ON public.refunds FOR EACH ROW EXECUTE FUNCTION private.refund_guard();
CREATE FUNCTION private.warranty_identity() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.sale_lines l JOIN public.phone_units p ON p.id=l.phone_unit_id WHERE l.id=NEW.sale_line_id AND l.sale_id=NEW.sale_id AND NEW.imei IN (p.imei1,p.imei2)) THEN RAISE EXCEPTION 'Original sold identity required' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER warranty_sale_identity BEFORE INSERT OR UPDATE ON public.warranty_cases FOR EACH ROW EXECUTE FUNCTION private.warranty_identity();
CREATE FUNCTION private.facility_total() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE fid uuid;
BEGIN
 -- DELETE has no NEW record; never access an unassigned event record.
 IF TG_OP='DELETE' THEN
  fid:=OLD.facility_id;
 ELSIF TG_TABLE_NAME='facility_contracts' THEN
  fid:=NEW.id;
 ELSE
  fid:=NEW.facility_id;
 END IF;
 PERFORM 1 FROM public.facility_contracts WHERE id=fid FOR UPDATE;
 IF EXISTS(SELECT 1 FROM public.facility_contracts f WHERE f.id=fid AND f.contract_price<>(SELECT COALESCE(sum(amount),0) FROM public.facility_installments WHERE facility_id=f.id)) THEN RAISE EXCEPTION 'Explicit schedule must equal approved contract total' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER facility_schedule_total AFTER INSERT OR UPDATE ON public.facility_contracts DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION private.facility_total();
CREATE CONSTRAINT TRIGGER installment_total AFTER INSERT OR UPDATE OR DELETE ON public.facility_installments DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION private.facility_total();
CREATE FUNCTION private.installment_parent_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF NEW.facility_id IS DISTINCT FROM OLD.facility_id THEN RAISE EXCEPTION 'Installment parent immutable' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
ALTER FUNCTION private.installment_parent_immutable() OWNER TO ph_engine;
REVOKE ALL ON FUNCTION private.installment_parent_immutable() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER installment_parent_identity BEFORE UPDATE ON public.facility_installments FOR EACH ROW EXECUTE FUNCTION private.installment_parent_immutable();
CREATE FUNCTION private.transfer_approval() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE r public.user_roles; t public.transfers;
BEGIN
 SELECT * INTO t FROM public.transfers WHERE id=NEW.transfer_id FOR UPDATE;
 IF t.stage NOT IN ('DRAFT','APPROVALS') OR NEW.actor_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Approval provenance denied' USING ERRCODE='42501'; END IF;
 SELECT * INTO r FROM public.user_roles WHERE id=NEW.role_assignment_id AND user_id=auth.uid() AND revoked_at IS NULL FOR SHARE;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=r.user_id AND active) OR NOT ((NEW.approval='SUPER_ADMIN' AND r.role='SUPER_ADMIN' AND r.store_id IS NULL) OR (NEW.approval='M02_MANAGER' AND r.role='MANAGER' AND r.store_id='M02')) THEN RAISE EXCEPTION 'Approval role denied' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER approval_provenance BEFORE INSERT ON public.transfer_approvals FOR EACH ROW EXECUTE FUNCTION private.transfer_approval();
CREATE FUNCTION private.transfer_line_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t public.transfers; kind text;
BEGIN
 SELECT * INTO t FROM public.transfers WHERE id=NEW.transfer_id FOR UPDATE;
 IF t.stage<>'DRAFT' OR EXISTS(SELECT 1 FROM public.transfer_approvals WHERE transfer_id=t.id) THEN RAISE EXCEPTION 'Approved manifest immutable' USING ERRCODE='23514'; END IF;
 IF NEW.phone_unit_id IS NOT NULL THEN
  IF NOT EXISTS(SELECT 1 FROM public.phone_units WHERE id=NEW.phone_unit_id AND store_id=t.from_store AND status='AVAILABLE' AND NEW.code=imei1) THEN RAISE EXCEPTION 'Phone manifest identity mismatch' USING ERRCODE='23514'; END IF;
 ELSE
  SELECT catalog_entries.kind INTO kind FROM public.catalog_entries WHERE id=NEW.catalog_id AND barcode=NEW.code;
  IF kind IS DISTINCT FROM 'accessory_sku' THEN RAISE EXCEPTION 'SKU manifest mismatch' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER manifest_guard BEFORE INSERT OR UPDATE ON public.transfer_lines FOR EACH ROW EXECUTE FUNCTION private.transfer_line_guard();
CREATE TRIGGER manifest_no_delete BEFORE DELETE ON public.transfer_lines FOR EACH ROW EXECUTE FUNCTION private.deny_change();
REVOKE DELETE,TRUNCATE ON public.transfer_lines FROM ph_engine,service_role;
CREATE FUNCTION private.transfer_scan_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t public.transfers; l public.transfer_lines;
BEGIN
 SELECT * INTO t FROM public.transfers WHERE id=NEW.transfer_id FOR UPDATE;
 PERFORM private.require_access(t.to_store);
 IF t.stage<>'RECEIPT' OR NEW.scanned_by IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Receipt actor/stage denied' USING ERRCODE='42501'; END IF;
 SELECT * INTO l FROM public.transfer_lines WHERE id=NEW.line_id AND transfer_id=t.id;
 IF NEW.code IS DISTINCT FROM l.code OR (SELECT count(*) FROM public.transfer_scans WHERE line_id=l.id)>=l.quantity THEN RAISE EXCEPTION 'Unexpected or excess scan' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER exact_scan BEFORE INSERT ON public.transfer_scans FOR EACH ROW EXECUTE FUNCTION private.transfer_scan_guard();
CREATE FUNCTION private.transfer_stage_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF (NEW.id,NEW.from_store,NEW.to_store) IS DISTINCT FROM (OLD.id,OLD.from_store,OLD.to_store) THEN RAISE EXCEPTION 'Transfer identity immutable' USING ERRCODE='23514'; END IF;
 IF NEW.stage=OLD.stage THEN RETURN NEW; END IF;
 IF NOT ((OLD.stage='DRAFT' AND NEW.stage='APPROVALS') OR (OLD.stage='APPROVALS' AND NEW.stage='DISPATCH') OR (OLD.stage='DISPATCH' AND NEW.stage='IN_TRANSIT') OR (OLD.stage='IN_TRANSIT' AND NEW.stage='RECEIPT') OR (OLD.stage='RECEIPT' AND NEW.stage='COMPLETED') OR (OLD.stage IN ('DRAFT','APPROVALS') AND NEW.stage='REJECTED')) THEN RAISE EXCEPTION 'Invalid transfer transition' USING ERRCODE='23514'; END IF;
 IF NEW.stage='DISPATCH' AND (SELECT count(DISTINCT a.approval) FROM public.transfer_approvals a JOIN public.user_roles r ON r.id=a.role_assignment_id JOIN public.profiles p ON p.id=r.user_id WHERE a.transfer_id=NEW.id AND r.revoked_at IS NULL AND p.active AND r.user_id=a.actor_id AND ((a.approval='SUPER_ADMIN' AND r.role='SUPER_ADMIN' AND r.store_id IS NULL) OR (a.approval='M02_MANAGER' AND r.role='MANAGER' AND r.store_id='M02')))<>2 THEN RAISE EXCEPTION 'Current dual approvals required' USING ERRCODE='23514'; END IF;
 IF NEW.stage='COMPLETED' AND (NOT EXISTS(SELECT 1 FROM public.transfer_lines WHERE transfer_id=NEW.id) OR EXISTS(SELECT 1 FROM public.transfer_lines l WHERE transfer_id=NEW.id AND quantity<>(SELECT count(*) FROM public.transfer_scans WHERE line_id=l.id))) THEN RAISE EXCEPTION 'Exact full receipt required' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER stage_integrity BEFORE UPDATE ON public.transfers FOR EACH ROW EXECUTE FUNCTION private.transfer_stage_guard();
CREATE FUNCTION private.transfer_initial_stage() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF NEW.stage IS DISTINCT FROM 'DRAFT' THEN RAISE EXCEPTION 'Transfer must begin in DRAFT' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
ALTER FUNCTION private.transfer_initial_stage() OWNER TO ph_engine;
REVOKE ALL ON FUNCTION private.transfer_initial_stage() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER transfer_initial_stage BEFORE INSERT ON public.transfers FOR EACH ROW EXECUTE FUNCTION private.transfer_initial_stage();
-- Restrict append-only operational history and provenance, including privileged maintenance paths.
ALTER FUNCTION private.catalog_immutable() OWNER TO ph_engine;
REVOKE ALL ON FUNCTION private.catalog_immutable() FROM PUBLIC,anon,authenticated,service_role;
ALTER FUNCTION private.repayment_guard() OWNER TO ph_engine;
REVOKE ALL ON FUNCTION private.repayment_guard() FROM PUBLIC,anon,authenticated,service_role;
ALTER FUNCTION private.refund_guard() OWNER TO ph_engine;
REVOKE ALL ON FUNCTION private.refund_guard() FROM PUBLIC,anon,authenticated,service_role;
ALTER FUNCTION private.warranty_identity() OWNER TO ph_engine;
REVOKE ALL ON FUNCTION private.warranty_identity() FROM PUBLIC,anon,authenticated,service_role;
ALTER FUNCTION private.facility_total() OWNER TO ph_engine;
REVOKE ALL ON FUNCTION private.facility_total() FROM PUBLIC,anon,authenticated,service_role;
ALTER FUNCTION private.transfer_approval() OWNER TO ph_engine;
REVOKE ALL ON FUNCTION private.transfer_approval() FROM PUBLIC,anon,authenticated,service_role;
ALTER FUNCTION private.transfer_line_guard() OWNER TO ph_engine;
REVOKE ALL ON FUNCTION private.transfer_line_guard() FROM PUBLIC,anon,authenticated,service_role;
ALTER FUNCTION private.transfer_scan_guard() OWNER TO ph_engine;
REVOKE ALL ON FUNCTION private.transfer_scan_guard() FROM PUBLIC,anon,authenticated,service_role;
ALTER FUNCTION private.transfer_stage_guard() OWNER TO ph_engine;
REVOKE ALL ON FUNCTION private.transfer_stage_guard() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER immutable_history BEFORE UPDATE OR DELETE ON public.accessory_stock_ledger FOR EACH ROW EXECUTE FUNCTION private.deny_change();
REVOKE UPDATE,DELETE,TRUNCATE ON public.accessory_stock_ledger FROM ph_engine,service_role;
CREATE TRIGGER immutable_history BEFORE UPDATE OR DELETE ON public.sales FOR EACH ROW EXECUTE FUNCTION private.deny_change();
REVOKE UPDATE,DELETE,TRUNCATE ON public.sales FROM ph_engine,service_role;
CREATE TRIGGER immutable_history BEFORE UPDATE OR DELETE ON public.sale_lines FOR EACH ROW EXECUTE FUNCTION private.deny_change();
REVOKE UPDATE,DELETE,TRUNCATE ON public.sale_lines FROM ph_engine,service_role;
CREATE TRIGGER immutable_history BEFORE UPDATE OR DELETE ON public.sale_payments FOR EACH ROW EXECUTE FUNCTION private.deny_change();
REVOKE UPDATE,DELETE,TRUNCATE ON public.sale_payments FROM ph_engine,service_role;
CREATE TRIGGER immutable_history BEFORE UPDATE OR DELETE ON public.cash_movements FOR EACH ROW EXECUTE FUNCTION private.deny_change();
REVOKE UPDATE,DELETE,TRUNCATE ON public.cash_movements FROM ph_engine,service_role;
CREATE TRIGGER immutable_history BEFORE UPDATE OR DELETE ON public.repayments FOR EACH ROW EXECUTE FUNCTION private.deny_change();
REVOKE UPDATE,DELETE,TRUNCATE ON public.repayments FROM ph_engine,service_role;
CREATE TRIGGER immutable_history BEFORE UPDATE OR DELETE ON public.refunds FOR EACH ROW EXECUTE FUNCTION private.deny_change();
REVOKE UPDATE,DELETE,TRUNCATE ON public.refunds FROM ph_engine,service_role;
CREATE TRIGGER immutable_history BEFORE UPDATE OR DELETE ON public.transfer_approvals FOR EACH ROW EXECUTE FUNCTION private.deny_change();
REVOKE UPDATE,DELETE,TRUNCATE ON public.transfer_approvals FROM ph_engine,service_role;
CREATE TRIGGER immutable_history BEFORE UPDATE OR DELETE ON public.transfer_scans FOR EACH ROW EXECUTE FUNCTION private.deny_change();
REVOKE UPDATE,DELETE,TRUNCATE ON public.transfer_scans FROM ph_engine,service_role;
REVOKE UPDATE,DELETE,TRUNCATE ON private.audit_events FROM ph_engine;
REVOKE UPDATE,DELETE,TRUNCATE ON private.journals FROM ph_engine;
REVOKE UPDATE,DELETE,TRUNCATE ON private.ledger_entries FROM ph_engine;
REVOKE UPDATE,DELETE,TRUNCATE ON private.idempotency_records FROM ph_engine;
REVOKE UPDATE,DELETE,TRUNCATE ON private.phone_identifiers FROM ph_engine;
COMMIT;
