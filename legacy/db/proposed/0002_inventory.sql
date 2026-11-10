-- REVIEW07 SOURCE ONLY — UNDEPLOYED / NOT RUN. No connection or SQL execution authorized.
-- Fresh disposable database only; not an upgrade script for a deployed Review06 database.
BEGIN;
CREATE TABLE public.catalog_entries (
id uuid PRIMARY KEY DEFAULT gen_random_uuid(), kind text NOT NULL CHECK(kind IN ('phone_model','accessory_sku')), name text NOT NULL, category text NOT NULL, barcode text UNIQUE NOT NULL, UNIQUE(id,kind)
);
GRANT ALL ON public.catalog_entries TO ph_engine;
GRANT ALL ON public.catalog_entries TO service_role;
GRANT SELECT ON public.catalog_entries TO authenticated;
ALTER TABLE public.catalog_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY engine_access ON public.catalog_entries TO ph_engine USING (true) WITH CHECK (true);
CREATE POLICY scoped_read ON public.catalog_entries FOR SELECT TO authenticated USING (EXISTS(SELECT 1 FROM public.stores s WHERE public.can_access_store(s.id)));
CREATE TABLE private.approved_prices (
store_id text REFERENCES public.stores(id), catalog_id uuid REFERENCES public.catalog_entries(id), amount numeric NOT NULL CHECK(amount>0 AND scale(amount)<=2), approved_by uuid NOT NULL REFERENCES auth.users(id), reference text NOT NULL, PRIMARY KEY(store_id,catalog_id)
);
GRANT ALL ON private.approved_prices TO ph_engine;
ALTER TABLE private.approved_prices ENABLE ROW LEVEL SECURITY;
CREATE POLICY engine_access ON private.approved_prices TO ph_engine USING (true) WITH CHECK (true);
CREATE TABLE public.phone_units (
id uuid PRIMARY KEY DEFAULT gen_random_uuid(), catalog_id uuid NOT NULL, catalog_kind text NOT NULL DEFAULT 'phone_model' CHECK(catalog_kind='phone_model'), store_id text NOT NULL REFERENCES public.stores(id), imei1 text NOT NULL CHECK(imei1 ~ '^[0-9]{15}$'), imei2 text CHECK(imei2 ~ '^[0-9]{15}$' AND imei2<>imei1), serial text UNIQUE, barcode text NOT NULL UNIQUE, condition text NOT NULL CHECK(condition IN ('NEW','USED')), packaging text NOT NULL CHECK(packaging IN ('SEALED','OPEN_BOX','NO_BOX')), sale_price numeric NOT NULL CHECK(sale_price>0 AND scale(sale_price)<=2), status text NOT NULL DEFAULT 'AVAILABLE' CHECK(status IN ('AVAILABLE','SOLD','IN_TRANSIT','RETURNED')), FOREIGN KEY(catalog_id,catalog_kind) REFERENCES public.catalog_entries(id,kind), UNIQUE(id,store_id)
);
GRANT ALL ON public.phone_units TO ph_engine;
GRANT ALL ON public.phone_units TO service_role;
GRANT SELECT ON public.phone_units TO authenticated;
ALTER TABLE public.phone_units ENABLE ROW LEVEL SECURITY;
CREATE POLICY engine_access ON public.phone_units TO ph_engine USING (true) WITH CHECK (true);
CREATE POLICY scoped_read ON public.phone_units FOR SELECT TO authenticated USING (public.can_access_store(store_id));
CREATE TABLE private.phone_identifiers (
code text PRIMARY KEY CHECK(code ~ '^[0-9]{15}$'), phone_id uuid NOT NULL REFERENCES public.phone_units(id), slot integer NOT NULL CHECK(slot IN (1,2)), UNIQUE(phone_id,slot)
);
GRANT ALL ON private.phone_identifiers TO ph_engine;
ALTER TABLE private.phone_identifiers ENABLE ROW LEVEL SECURITY;
CREATE POLICY engine_access ON private.phone_identifiers TO ph_engine USING (true) WITH CHECK (true);
CREATE TABLE public.accessory_balances (
store_id text NOT NULL REFERENCES public.stores(id), catalog_id uuid NOT NULL, catalog_kind text NOT NULL DEFAULT 'accessory_sku' CHECK(catalog_kind='accessory_sku'), quantity integer NOT NULL DEFAULT 0 CHECK(quantity>=0), FOREIGN KEY(catalog_id,catalog_kind) REFERENCES public.catalog_entries(id,kind), PRIMARY KEY(store_id,catalog_id)
);
GRANT ALL ON public.accessory_balances TO ph_engine;
GRANT ALL ON public.accessory_balances TO service_role;
GRANT SELECT ON public.accessory_balances TO authenticated;
ALTER TABLE public.accessory_balances ENABLE ROW LEVEL SECURITY;
CREATE POLICY engine_access ON public.accessory_balances TO ph_engine USING (true) WITH CHECK (true);
CREATE POLICY scoped_read ON public.accessory_balances FOR SELECT TO authenticated USING (public.can_access_store(store_id));
CREATE TABLE public.accessory_stock_ledger (
id uuid PRIMARY KEY DEFAULT gen_random_uuid(), store_id text NOT NULL, catalog_id uuid NOT NULL, quantity_delta integer NOT NULL CHECK(quantity_delta<>0), reason text NOT NULL, reference uuid NOT NULL, created_by uuid NOT NULL REFERENCES auth.users(id), created_at timestamptz NOT NULL DEFAULT now(), FOREIGN KEY(store_id,catalog_id) REFERENCES public.accessory_balances(store_id,catalog_id)
);
GRANT ALL ON public.accessory_stock_ledger TO ph_engine;
GRANT ALL ON public.accessory_stock_ledger TO service_role;
GRANT SELECT ON public.accessory_stock_ledger TO authenticated;
ALTER TABLE public.accessory_stock_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY engine_access ON public.accessory_stock_ledger TO ph_engine USING (true) WITH CHECK (true);
CREATE POLICY scoped_read ON public.accessory_stock_ledger FOR SELECT TO authenticated USING (public.can_access_store(store_id));
CREATE FUNCTION private.phone_identity_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF TG_OP='UPDATE' THEN
  IF (NEW.id,NEW.catalog_id,NEW.imei1,NEW.imei2,NEW.serial,NEW.barcode) IS DISTINCT FROM (OLD.id,OLD.catalog_id,OLD.imei1,OLD.imei2,OLD.serial,OLD.barcode) THEN RAISE EXCEPTION 'Identity immutable' USING ERRCODE='23514'; END IF;
  IF NEW.status<>OLD.status AND NOT ((OLD.status='AVAILABLE' AND NEW.status IN ('SOLD','IN_TRANSIT')) OR (OLD.status='IN_TRANSIT' AND NEW.status='AVAILABLE') OR (OLD.status='SOLD' AND NEW.status='RETURNED')) THEN RAISE EXCEPTION 'Invalid phone transition' USING ERRCODE='23514'; END IF;
  IF NEW.store_id<>OLD.store_id AND NOT(OLD.status='IN_TRANSIT' AND NEW.status='AVAILABLE') THEN RAISE EXCEPTION 'Transfer required' USING ERRCODE='23514'; END IF;
 ELSE
  INSERT INTO private.phone_identifiers(code,phone_id,slot) VALUES(NEW.imei1,NEW.id,1);
  IF NEW.imei2 IS NOT NULL THEN INSERT INTO private.phone_identifiers(code,phone_id,slot) VALUES(NEW.imei2,NEW.id,2); END IF;
 END IF;
 RETURN NEW;
END $$;
ALTER FUNCTION private.phone_identity_guard() OWNER TO ph_engine;
REVOKE ALL ON FUNCTION private.phone_identity_guard() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER phone_identity AFTER INSERT OR UPDATE ON public.phone_units FOR EACH ROW EXECUTE FUNCTION private.phone_identity_guard();
COMMIT;
