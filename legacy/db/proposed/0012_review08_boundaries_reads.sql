-- REVIEW08 SOURCE ONLY / UNDEPLOYED / NOT RUN. No activation authorized.
BEGIN;
GRANT CREATE ON SCHEMA public,private TO ph_engine;
CREATE TABLE private.operating_expense_requests(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), store_id text NOT NULL REFERENCES public.stores(id),
 amount numeric NOT NULL CHECK(amount>0 AND scale(amount)<=2), description text NOT NULL,
 evidence_reference text NOT NULL, requested_by uuid NOT NULL REFERENCES auth.users(id),
 state text NOT NULL DEFAULT 'POLICY_BLOCKED' CHECK(state='POLICY_BLOCKED')
);
GRANT ALL ON private.operating_expense_requests TO ph_engine;
ALTER TABLE private.operating_expense_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY engine_access ON private.operating_expense_requests TO ph_engine USING(true) WITH CHECK(true);
-- No expense posting grant, thresholds, statutory classification or cash-balance rule invented.
CREATE FUNCTION public.command_customer_create(request jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE p jsonb:=request->'payload'; replay jsonb; customer uuid:=gen_random_uuid();
BEGIN
 replay:=private.command_begin(request,'customer.create',true); IF replay IS NOT NULL THEN RETURN replay; END IF;
 PERFORM private.reject_extra(p,ARRAY['store','name','contact','reference','address','notes']);
 IF COALESCE(length(trim(p->>'name')),0)=0 OR COALESCE(length(trim(p->>'contact')),0)=0 OR COALESCE(length(trim(p->>'reference')),0)=0 THEN RAISE EXCEPTION 'Customer identity required' USING ERRCODE='22023'; END IF;
 INSERT INTO public.customers(id,store_id,name,contact,reference,address,notes) VALUES(customer,p->>'store',p->>'name',p->>'contact',p->>'reference',COALESCE(p->>'address',''),COALESCE(p->>'notes',''));
 RETURN private.finish(request,'customer.create',customer,jsonb_build_object('customerId',customer));
END $$;
CREATE FUNCTION public.command_transfer_approve(request jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE p jsonb:=request->'payload'; replay jsonb; t public.transfers; assignment uuid;
BEGIN
 replay:=private.command_begin(request,'transfer.approve',true); IF replay IS NOT NULL THEN RETURN replay; END IF;
 PERFORM private.reject_extra(p,ARRAY['store','transferId','approval']);
 SELECT * INTO t FROM public.transfers WHERE id=(p->>'transferId')::uuid FOR UPDATE;
 IF NOT FOUND OR p->>'store' NOT IN (t.from_store,t.to_store) THEN RAISE EXCEPTION 'Transfer scope denied' USING ERRCODE='42501'; END IF;
 SELECT id INTO assignment FROM public.user_roles WHERE user_id=auth.uid() AND revoked_at IS NULL AND
 ((p->>'approval'='SUPER_ADMIN' AND role='SUPER_ADMIN' AND store_id IS NULL) OR (p->>'approval'='M02_MANAGER' AND role='MANAGER' AND store_id='M02')) FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Approval attribution denied' USING ERRCODE='42501'; END IF;
 INSERT INTO public.transfer_approvals(transfer_id,approval,actor_id,role_assignment_id) VALUES(t.id,p->>'approval',auth.uid(),assignment);
 IF t.stage='DRAFT' THEN UPDATE public.transfers SET stage='APPROVALS' WHERE id=t.id; END IF;
 RETURN private.finish(request,'transfer.approve',t.id,jsonb_build_object('transferId',t.id,'stage','APPROVALS'));
END $$;
CREATE FUNCTION public.read_inventory_snapshot(requested_scope text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE scopes text[];
BEGIN
 IF requested_scope IS NULL OR requested_scope NOT IN ('ALL','M01','M02') THEN RAISE EXCEPTION 'Scope invalid' USING ERRCODE='22023'; END IF;
 SELECT array_agg(id) INTO scopes FROM public.stores WHERE public.can_access_store(id) AND (requested_scope='ALL' OR id=requested_scope);
 IF scopes IS NULL THEN RAISE EXCEPTION 'Store denied' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object(
 'phones',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',p.id,'brandId',m.brand_id,'modelId',p.catalog_id,'variantId',p.variant_id,'store',p.store_id,'imei1',p.imei1,'imei2',p.imei2,'serial',p.serial,'barcode',p.barcode,'condition',p.condition,'packaging',p.packaging,'color',p.color,'storage',p.storage,'batteryHealth',p.battery_health,'conditionRemarks',p.condition_remarks,'salePrice',p.sale_price::text,'status',p.status,'receiptId',p.receipt_id)) FROM public.phone_units p JOIN public.phone_models m ON m.id=p.catalog_id WHERE p.store_id=ANY(scopes)),'[]'::jsonb),
 'accessories',COALESCE((SELECT jsonb_agg(jsonb_build_object('store',store_id,'skuId',catalog_id,'quantity',quantity)) FROM public.accessory_balances WHERE store_id=ANY(scopes)),'[]'::jsonb),
 'receipts',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',id,'purchaseId',purchase_id,'store',store_id,'quantity',quantity,'receivedBy',received_by,'reference',reference)) FROM public.purchase_receipts WHERE store_id=ANY(scopes)),'[]'::jsonb),
 'shifts',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',id,'store',store_id,'drawerId',drawer_id,'state',state)) FROM public.cash_shifts WHERE store_id=ANY(scopes)),'[]'::jsonb));
END $$;
-- Controlled owner read only AFTER submission. Never includes open-shift expected balances.
CREATE FUNCTION public.owner_closed_shift(shift uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF NOT public.has_role(auth.uid(),'SUPER_ADMIN') THEN RAISE EXCEPTION 'Owner required' USING ERRCODE='42501'; END IF;
 RETURN (SELECT jsonb_build_object('shiftId',id,'countedAmount',counted_amount::text,'discrepancy',discrepancy::text) FROM public.cash_shifts WHERE id=shift AND state='CLOSED');
END $$;
CREATE OR REPLACE FUNCTION private.receipt_cap() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE purchase public.purchases; approval private.purchase_receiving_authorizations; received bigint;
BEGIN
 SELECT * INTO purchase FROM public.purchases WHERE id=NEW.purchase_id AND store_id=NEW.store_id FOR UPDATE;
 IF NOT FOUND OR NEW.received_by IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Receipt provenance denied' USING ERRCODE='42501'; END IF;
 SELECT * INTO approval FROM private.purchase_receiving_authorizations WHERE purchase_id=purchase.id AND catalog_id=purchase.catalog_id AND revoked_at IS NULL FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Receipt authorization required' USING ERRCODE='42501'; END IF;
 SELECT COALESCE(sum(quantity),0) INTO received FROM public.purchase_receipts WHERE purchase_id=purchase.id;
 IF received+NEW.quantity>purchase.quantity OR received+NEW.quantity>approval.authorized_quantity THEN RAISE EXCEPTION 'Receipt exceeds authorization' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER receipt_immutable BEFORE UPDATE OR DELETE ON public.purchase_receipts FOR EACH ROW EXECUTE FUNCTION private.deny_change();
-- Phone receipts are one physical unit; accessories remain quantity-managed.
CREATE UNIQUE INDEX one_phone_per_receipt ON public.phone_units(receipt_id);
CREATE FUNCTION private.phone_receipt_identity() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF TG_OP='UPDATE' AND (NEW.receipt_id,NEW.variant_id,NEW.color,NEW.storage) IS DISTINCT FROM (OLD.receipt_id,OLD.variant_id,OLD.color,OLD.storage) THEN RAISE EXCEPTION 'Physical provenance immutable' USING ERRCODE='23514'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.purchase_receipts r JOIN public.purchases p ON p.id=r.purchase_id WHERE r.id=NEW.receipt_id AND r.quantity=1 AND r.store_id=NEW.store_id AND p.catalog_id=NEW.catalog_id AND p.kind='Phone') AND TG_OP='INSERT' THEN RAISE EXCEPTION 'Phone receipt identity conflict' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER phone_receipt_guard BEFORE INSERT OR UPDATE ON public.phone_units FOR EACH ROW EXECUTE FUNCTION private.phone_receipt_identity();
CREATE FUNCTION private.open_shift_posting() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 PERFORM private.lock_shift(NEW.shift_id,NEW.store_id);
 RETURN NEW;
END $$;
CREATE TRIGGER movement_open_shift BEFORE INSERT ON public.cash_movements FOR EACH ROW EXECUTE FUNCTION private.open_shift_posting();
CREATE TRIGGER sale_open_shift BEFORE INSERT ON public.sales FOR EACH ROW EXECUTE FUNCTION private.open_shift_posting();
CREATE OR REPLACE FUNCTION private.reversal_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF NEW.reversal_of IS NOT NULL THEN RAISE EXCEPTION 'Reversal policy unconfigured' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $$;
ALTER FUNCTION public.command_customer_create(jsonb) OWNER TO ph_engine;
ALTER FUNCTION public.command_transfer_approve(jsonb) OWNER TO ph_engine;
ALTER FUNCTION public.read_inventory_snapshot(text) OWNER TO ph_engine;
ALTER FUNCTION public.owner_closed_shift(uuid) OWNER TO ph_engine;
REVOKE ALL ON FUNCTION public.command_customer_create(jsonb),public.command_transfer_approve(jsonb),public.read_inventory_snapshot(text),public.owner_closed_shift(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.command_customer_create(jsonb),public.command_transfer_approve(jsonb),public.read_inventory_snapshot(text),public.owner_closed_shift(uuid) TO authenticated;
ALTER FUNCTION private.receipt_cap() OWNER TO ph_engine;
ALTER FUNCTION private.phone_receipt_identity() OWNER TO ph_engine;
ALTER FUNCTION private.open_shift_posting() OWNER TO ph_engine;
ALTER FUNCTION private.reversal_guard() OWNER TO ph_engine;
REVOKE ALL ON FUNCTION private.receipt_cap(),private.phone_receipt_identity(),private.open_shift_posting(),private.reversal_guard() FROM PUBLIC,anon,authenticated,service_role;
REVOKE UPDATE,DELETE,TRUNCATE ON public.purchase_receipts FROM ph_engine,service_role;
REVOKE CREATE ON SCHEMA public,private FROM ph_engine;
COMMIT;