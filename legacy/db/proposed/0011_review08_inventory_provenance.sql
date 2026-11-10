-- REVIEW08 SOURCE ONLY. UNDEPLOYED / NOT COMPILED / NOT RUN.
-- Fresh schema 0001–0010 required. Never execute without separate owner authorization.
BEGIN;
GRANT CREATE ON SCHEMA public,private TO ph_engine;
CREATE TABLE public.brands(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL UNIQUE);
GRANT ALL ON public.brands TO ph_engine,service_role;
GRANT SELECT ON public.brands TO authenticated;
ALTER TABLE public.brands ENABLE ROW LEVEL SECURITY;
CREATE POLICY engine_access ON public.brands TO ph_engine USING(true) WITH CHECK(true);
CREATE POLICY scoped_read ON public.brands FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.stores WHERE public.can_access_store(id)));
CREATE TABLE public.phone_models(id uuid PRIMARY KEY REFERENCES public.catalog_entries(id), brand_id uuid NOT NULL REFERENCES public.brands(id), name text NOT NULL, UNIQUE(id,brand_id));
GRANT ALL ON public.phone_models TO ph_engine,service_role;
GRANT SELECT ON public.phone_models TO authenticated;
ALTER TABLE public.phone_models ENABLE ROW LEVEL SECURITY;
CREATE POLICY engine_access ON public.phone_models TO ph_engine USING(true) WITH CHECK(true);
CREATE POLICY scoped_read ON public.phone_models FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.stores WHERE public.can_access_store(id)));
CREATE TABLE public.phone_variants(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), model_id uuid NOT NULL REFERENCES public.phone_models(id), color text NOT NULL CHECK(length(trim(color))>0), storage text NOT NULL CHECK(length(trim(storage))>0), UNIQUE(id,model_id,color,storage));
GRANT ALL ON public.phone_variants TO ph_engine,service_role;
GRANT SELECT ON public.phone_variants TO authenticated;
ALTER TABLE public.phone_variants ENABLE ROW LEVEL SECURITY;
CREATE POLICY engine_access ON public.phone_variants TO ph_engine USING(true) WITH CHECK(true);
CREATE POLICY scoped_read ON public.phone_variants FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.stores WHERE public.can_access_store(id)));
CREATE TABLE public.accessory_categories(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL UNIQUE);
GRANT ALL ON public.accessory_categories TO ph_engine,service_role;
GRANT SELECT ON public.accessory_categories TO authenticated;
ALTER TABLE public.accessory_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY engine_access ON public.accessory_categories TO ph_engine USING(true) WITH CHECK(true);
CREATE POLICY scoped_read ON public.accessory_categories FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.stores WHERE public.can_access_store(id)));
CREATE TABLE public.accessory_variants(id uuid PRIMARY KEY REFERENCES public.catalog_entries(id), category_id uuid NOT NULL REFERENCES public.accessory_categories(id), sku text NOT NULL UNIQUE, name text NOT NULL, color text, variant text NOT NULL);
GRANT ALL ON public.accessory_variants TO ph_engine,service_role;
GRANT SELECT ON public.accessory_variants TO authenticated;
ALTER TABLE public.accessory_variants ENABLE ROW LEVEL SECURITY;
CREATE POLICY engine_access ON public.accessory_variants TO ph_engine USING(true) WITH CHECK(true);
CREATE POLICY scoped_read ON public.accessory_variants FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.stores WHERE public.can_access_store(id)));
CREATE TABLE public.accessory_compatibility(sku_id uuid REFERENCES public.accessory_variants(id), model_id uuid REFERENCES public.phone_models(id), PRIMARY KEY(sku_id,model_id));
GRANT ALL ON public.accessory_compatibility TO ph_engine,service_role;
GRANT SELECT ON public.accessory_compatibility TO authenticated;
ALTER TABLE public.accessory_compatibility ENABLE ROW LEVEL SECURITY;
CREATE POLICY engine_access ON public.accessory_compatibility TO ph_engine USING(true) WITH CHECK(true);
CREATE POLICY scoped_read ON public.accessory_compatibility FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.stores WHERE public.can_access_store(id)));

ALTER TABLE public.phone_units ADD COLUMN variant_id uuid NOT NULL,
 ADD COLUMN color text NOT NULL CHECK(length(trim(color))>0),
 ADD COLUMN storage text NOT NULL CHECK(length(trim(storage))>0),
 ADD COLUMN battery_health numeric CHECK(battery_health BETWEEN 0 AND 100),
 ADD COLUMN condition_remarks text NOT NULL DEFAULT '',
 ADD COLUMN receipt_id uuid NOT NULL REFERENCES public.purchase_receipts(id),
 ADD FOREIGN KEY(variant_id,catalog_id,color,storage) REFERENCES public.phone_variants(id,model_id,color,storage);
-- Unknown means NULL/absent, never a fabricated zero. No operational caller supplies costs.
ALTER TABLE private.purchase_finance ALTER COLUMN unit_cost DROP NOT NULL, ALTER COLUMN obligation DROP NOT NULL;
ALTER TABLE public.purchases ADD COLUMN catalog_id uuid NOT NULL,
 ADD COLUMN catalog_kind text NOT NULL,
 ADD FOREIGN KEY(catalog_id,catalog_kind) REFERENCES public.catalog_entries(id,kind),
 ADD CHECK((kind='Phone' AND catalog_kind='phone_model') OR (kind='Accessory' AND catalog_kind='accessory_sku'));
CREATE TABLE private.purchase_receiving_authorizations(
 purchase_id uuid PRIMARY KEY REFERENCES public.purchases(id), catalog_id uuid NOT NULL REFERENCES public.catalog_entries(id),
 authorized_quantity integer NOT NULL CHECK(authorized_quantity>0), authorized_by uuid NOT NULL REFERENCES auth.users(id),
 authorization_reference text NOT NULL CHECK(length(trim(authorization_reference))>0), revoked_at timestamptz
);
GRANT ALL ON private.purchase_receiving_authorizations TO ph_engine;
ALTER TABLE private.purchase_receiving_authorizations ENABLE ROW LEVEL SECURITY;
CREATE POLICY engine_access ON private.purchase_receiving_authorizations TO ph_engine USING(true) WITH CHECK(true);
-- No authorization-creation RPC: approval policy is not confirmed. No free-text reference grants authority.
ALTER TABLE public.sale_lines ADD COLUMN ownership_released_at timestamptz;
CREATE UNIQUE INDEX one_active_sale_per_physical_phone ON public.sale_lines(phone_unit_id)
 WHERE phone_unit_id IS NOT NULL AND ownership_released_at IS NULL;
-- Existing immutable sale history denies release/update. An approved future lifecycle must explicitly
-- replace that guard with an audited release command; return status/refund alone NEVER releases ownership.
CREATE TABLE public.phone_movements(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), phone_id uuid NOT NULL REFERENCES public.phone_units(id),
 from_store text REFERENCES public.stores(id), to_store text NOT NULL REFERENCES public.stores(id),
 from_status text, to_status text NOT NULL, receipt_id uuid REFERENCES public.purchase_receipts(id),
 actor_id uuid NOT NULL REFERENCES auth.users(id), created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.phone_movements TO ph_engine,service_role;
GRANT SELECT ON public.phone_movements TO authenticated;
ALTER TABLE public.phone_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY engine_access ON public.phone_movements TO ph_engine USING(true) WITH CHECK(true);
CREATE POLICY scoped_read ON public.phone_movements FOR SELECT TO authenticated USING(public.can_access_store(to_store));
CREATE FUNCTION private.phone_movement_record() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  INSERT INTO public.phone_movements(phone_id,to_store,to_status,receipt_id,actor_id) VALUES(NEW.id,NEW.store_id,NEW.status,NEW.receipt_id,auth.uid());
 ELSIF (NEW.status,NEW.store_id) IS DISTINCT FROM (OLD.status,OLD.store_id) THEN
  INSERT INTO public.phone_movements(phone_id,from_store,to_store,from_status,to_status,receipt_id,actor_id) VALUES(NEW.id,OLD.store_id,NEW.store_id,OLD.status,NEW.status,NEW.receipt_id,auth.uid());
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER phone_movement AFTER INSERT OR UPDATE ON public.phone_units FOR EACH ROW EXECUTE FUNCTION private.phone_movement_record();
CREATE TRIGGER immutable_history BEFORE UPDATE OR DELETE ON public.phone_movements FOR EACH ROW EXECUTE FUNCTION private.deny_change();
CREATE FUNCTION private.phone_sale_ownership() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE unit uuid; status text; active_count integer;
BEGIN
 IF TG_TABLE_NAME='phone_units' THEN
  unit:=NEW.id;
 ELSE
  unit:=NEW.phone_unit_id;
 END IF;
 IF unit IS NULL THEN RETURN NULL; END IF;
 SELECT p.status INTO status FROM public.phone_units p WHERE id=unit FOR UPDATE;
 SELECT count(*) INTO active_count FROM public.sale_lines WHERE phone_unit_id=unit AND ownership_released_at IS NULL;
 IF (status='SOLD' AND active_count<>1) OR (status IN ('AVAILABLE','IN_TRANSIT') AND active_count<>0) THEN
  RAISE EXCEPTION 'Physical sale ownership/status conflict' USING ERRCODE='23514';
 END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER phone_sale_consistency AFTER INSERT OR UPDATE ON public.phone_units DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION private.phone_sale_ownership();
CREATE CONSTRAINT TRIGGER line_sale_consistency AFTER INSERT ON public.sale_lines DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION private.phone_sale_ownership();
CREATE FUNCTION private.catalog_subtype() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE expected text;
BEGIN
 expected:=CASE TG_TABLE_NAME WHEN 'phone_models' THEN 'phone_model' ELSE 'accessory_sku' END;
 IF NOT EXISTS(SELECT 1 FROM public.catalog_entries WHERE id=NEW.id AND kind=expected) THEN RAISE EXCEPTION 'Catalog subtype conflict' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER phone_model_subtype BEFORE INSERT OR UPDATE ON public.phone_models FOR EACH ROW EXECUTE FUNCTION private.catalog_subtype();
CREATE TRIGGER accessory_variant_subtype BEFORE INSERT OR UPDATE ON public.accessory_variants FOR EACH ROW EXECUTE FUNCTION private.catalog_subtype();
CREATE FUNCTION private.lock_authorized_purchase(p jsonb,c uuid,q integer,expected_kind text) RETURNS public.purchases
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE purchase public.purchases; approval private.purchase_receiving_authorizations; received bigint;
BEGIN
 SELECT * INTO purchase FROM public.purchases WHERE id=(p->>'purchaseId')::uuid AND store_id=p->>'store' FOR UPDATE;
 IF NOT FOUND OR purchase.supplier_id IS DISTINCT FROM (p->>'supplierId')::uuid OR purchase.catalog_id IS DISTINCT FROM c OR purchase.catalog_kind IS DISTINCT FROM expected_kind THEN RAISE EXCEPTION 'Purchase identity/scope denied' USING ERRCODE='42501'; END IF;
 SELECT * INTO approval FROM private.purchase_receiving_authorizations WHERE purchase_id=purchase.id AND revoked_at IS NULL FOR SHARE;
 IF NOT FOUND OR approval.catalog_id<>c THEN RAISE EXCEPTION 'Approved receipt context required' USING ERRCODE='42501'; END IF;
 SELECT COALESCE(sum(quantity),0) INTO received FROM public.purchase_receipts WHERE purchase_id=purchase.id;
 IF received+q>purchase.quantity OR received+q>approval.authorized_quantity THEN RAISE EXCEPTION 'Receipt exceeds authorized quantity' USING ERRCODE='23514'; END IF;
 RETURN purchase;
END $$;
CREATE OR REPLACE FUNCTION public.command_phone_intake(request jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE p jsonb:=request->'payload'; replay jsonb; price numeric; unit uuid:=gen_random_uuid(); receipt uuid:=gen_random_uuid(); c uuid; purchase public.purchases;
BEGIN
 replay:=private.command_begin(request,'phone.intake',true); IF replay IS NOT NULL THEN RETURN replay; END IF;
 PERFORM private.reject_extra(p,ARRAY['store','modelId','variantId','purchaseId','supplierId','imei1','imei2','serial','barcode','condition','packaging','color','storage','batteryHealth','conditionRemarks','documentReference']);
 c:=(p->>'modelId')::uuid;
 purchase:=private.lock_authorized_purchase(p,c,1,'phone_model');
 IF NOT EXISTS(SELECT 1 FROM public.phone_variants WHERE id=(p->>'variantId')::uuid AND model_id=c AND color=p->>'color' AND storage=p->>'storage') THEN RAISE EXCEPTION 'Phone variant identity required' USING ERRCODE='22023'; END IF;
 SELECT amount INTO price FROM private.approved_prices WHERE store_id=p->>'store' AND catalog_id=c FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Approved selling price required' USING ERRCODE='23514'; END IF;
 IF COALESCE(length(trim(p->>'documentReference')),0)=0 OR NOT(p ? 'batteryHealth') OR NOT(p ? 'conditionRemarks') THEN RAISE EXCEPTION 'Receipt details required' USING ERRCODE='22023'; END IF;
 INSERT INTO public.purchase_receipts(id,purchase_id,store_id,quantity,received_by,reference) VALUES(receipt,purchase.id,purchase.store_id,1,auth.uid(),p->>'documentReference');
 INSERT INTO public.phone_units(id,catalog_id,variant_id,store_id,imei1,imei2,serial,barcode,condition,packaging,sale_price,color,storage,battery_health,condition_remarks,receipt_id)
 VALUES(unit,c,(p->>'variantId')::uuid,purchase.store_id,p->>'imei1',NULLIF(p->>'imei2',''),NULLIF(p->>'serial',''),p->>'barcode',p->>'condition',p->>'packaging',price,p->>'color',p->>'storage',(p->>'batteryHealth')::numeric,p->>'conditionRemarks',receipt);
 RETURN private.finish(request,'phone.intake',unit,jsonb_build_object('phoneId',unit,'receiptId',receipt));
END $$;
CREATE OR REPLACE FUNCTION public.command_accessory_receiving(request jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE p jsonb:=request->'payload'; replay jsonb; q integer; c uuid; receipt uuid:=gen_random_uuid(); purchase public.purchases;
BEGIN
 replay:=private.command_begin(request,'accessory.receiving',true); IF replay IS NOT NULL THEN RETURN replay; END IF;
 PERFORM private.reject_extra(p,ARRAY['store','skuId','purchaseId','supplierId','quantity','documentReference']);
 IF p->>'quantity' IS NULL OR p->>'quantity' !~ '^[1-9][0-9]*$' OR COALESCE(length(trim(p->>'documentReference')),0)=0 THEN RAISE EXCEPTION 'Receipt quantity/evidence required' USING ERRCODE='22023'; END IF;
 q:=(p->>'quantity')::integer; c:=(p->>'skuId')::uuid;
 purchase:=private.lock_authorized_purchase(p,c,q,'accessory_sku');
 IF NOT EXISTS(SELECT 1 FROM public.accessory_variants WHERE id=c) THEN RAISE EXCEPTION 'Normalized SKU required' USING ERRCODE='22023'; END IF;
 INSERT INTO public.purchase_receipts(id,purchase_id,store_id,quantity,received_by,reference) VALUES(receipt,purchase.id,purchase.store_id,q,auth.uid(),p->>'documentReference');
 INSERT INTO public.accessory_balances(store_id,catalog_id) VALUES(purchase.store_id,c) ON CONFLICT DO NOTHING;
 PERFORM 1 FROM public.accessory_balances WHERE store_id=purchase.store_id AND catalog_id=c FOR UPDATE;
 UPDATE public.accessory_balances SET quantity=quantity+q WHERE store_id=purchase.store_id AND catalog_id=c;
 INSERT INTO public.accessory_stock_ledger(store_id,catalog_id,quantity_delta,reason,reference,created_by) VALUES(purchase.store_id,c,q,'RECEIVING',receipt,auth.uid());
 RETURN private.finish(request,'accessory.receiving',receipt,jsonb_build_object('receiptId',receipt,'quantity',q));
END $$;
-- Explicit function ownership/ACLs, including replaced commands.
ALTER FUNCTION private.phone_movement_record() OWNER TO ph_engine;
ALTER FUNCTION private.phone_sale_ownership() OWNER TO ph_engine;
ALTER FUNCTION private.catalog_subtype() OWNER TO ph_engine;
ALTER FUNCTION private.lock_authorized_purchase(jsonb,uuid,integer,text) OWNER TO ph_engine;
REVOKE ALL ON FUNCTION private.phone_movement_record(),private.phone_sale_ownership(),private.catalog_subtype(),private.lock_authorized_purchase(jsonb,uuid,integer,text) FROM PUBLIC,anon,authenticated,service_role;
ALTER FUNCTION public.command_phone_intake(jsonb) OWNER TO ph_engine;
ALTER FUNCTION public.command_accessory_receiving(jsonb) OWNER TO ph_engine;
REVOKE ALL ON FUNCTION public.command_phone_intake(jsonb),public.command_accessory_receiving(jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.command_phone_intake(jsonb),public.command_accessory_receiving(jsonb) TO authenticated;
REVOKE UPDATE,DELETE,TRUNCATE ON public.phone_movements FROM ph_engine,service_role;
REVOKE CREATE ON SCHEMA public,private FROM ph_engine;
COMMIT;