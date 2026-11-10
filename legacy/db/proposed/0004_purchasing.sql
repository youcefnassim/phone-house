-- REVIEW07 SOURCE ONLY — UNDEPLOYED / NOT RUN. No connection or SQL execution authorized.
-- Fresh disposable database only; not an upgrade script for a deployed Review06 database.
BEGIN;
CREATE TABLE public.suppliers (
id uuid PRIMARY KEY DEFAULT gen_random_uuid(), store_id text NOT NULL REFERENCES public.stores(id), name text NOT NULL, contact text NOT NULL, document_reference text UNIQUE NOT NULL, notes text NOT NULL DEFAULT '', UNIQUE(id,store_id)
);
GRANT ALL ON public.suppliers TO ph_engine;
GRANT ALL ON public.suppliers TO service_role;
GRANT SELECT ON public.suppliers TO authenticated;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
CREATE POLICY engine_access ON public.suppliers TO ph_engine USING (true) WITH CHECK (true);
CREATE POLICY scoped_read ON public.suppliers FOR SELECT TO authenticated USING (public.can_access_store(store_id));
CREATE TABLE public.purchases (
id uuid PRIMARY KEY DEFAULT gen_random_uuid(), store_id text NOT NULL, supplier_id uuid NOT NULL, kind text NOT NULL CHECK(kind IN ('Phone','Accessory')), product text NOT NULL, quantity integer NOT NULL CHECK(quantity>0), document_reference text UNIQUE NOT NULL, expected_date date NOT NULL, notes text NOT NULL DEFAULT '', FOREIGN KEY(supplier_id,store_id) REFERENCES public.suppliers(id,store_id), UNIQUE(id,store_id)
);
GRANT ALL ON public.purchases TO ph_engine;
GRANT ALL ON public.purchases TO service_role;
GRANT SELECT ON public.purchases TO authenticated;
ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;
CREATE POLICY engine_access ON public.purchases TO ph_engine USING (true) WITH CHECK (true);
CREATE POLICY scoped_read ON public.purchases FOR SELECT TO authenticated USING (public.can_access_store(store_id));
CREATE TABLE public.purchase_receipts (
id uuid PRIMARY KEY DEFAULT gen_random_uuid(), purchase_id uuid NOT NULL, store_id text NOT NULL, quantity integer NOT NULL CHECK(quantity>0), received_by uuid NOT NULL REFERENCES auth.users(id), reference text NOT NULL, FOREIGN KEY(purchase_id,store_id) REFERENCES public.purchases(id,store_id)
);
GRANT ALL ON public.purchase_receipts TO ph_engine;
GRANT ALL ON public.purchase_receipts TO service_role;
GRANT SELECT ON public.purchase_receipts TO authenticated;
ALTER TABLE public.purchase_receipts ENABLE ROW LEVEL SECURITY;
CREATE POLICY engine_access ON public.purchase_receipts TO ph_engine USING (true) WITH CHECK (true);
CREATE POLICY scoped_read ON public.purchase_receipts FOR SELECT TO authenticated USING (public.can_access_store(store_id));
CREATE TABLE private.purchase_finance (
purchase_id uuid PRIMARY KEY REFERENCES public.purchases(id), unit_cost numeric NOT NULL CHECK(unit_cost>0 AND scale(unit_cost)<=2), obligation numeric NOT NULL CHECK(obligation>=0 AND scale(obligation)<=2)
);
GRANT ALL ON private.purchase_finance TO ph_engine;
ALTER TABLE private.purchase_finance ENABLE ROW LEVEL SECURITY;
CREATE POLICY engine_access ON private.purchase_finance TO ph_engine USING (true) WITH CHECK (true);
CREATE TABLE private.supplier_payments (
id uuid PRIMARY KEY DEFAULT gen_random_uuid(), purchase_id uuid NOT NULL REFERENCES private.purchase_finance(purchase_id), amount numeric NOT NULL CHECK(amount>0 AND scale(amount)<=2), reference text NOT NULL, created_by uuid NOT NULL REFERENCES auth.users(id)
);
GRANT ALL ON private.supplier_payments TO ph_engine;
ALTER TABLE private.supplier_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY engine_access ON private.supplier_payments TO ph_engine USING (true) WITH CHECK (true);
CREATE FUNCTION public.owner_purchase_finance(_purchase_id uuid)
RETURNS TABLE(purchase_id uuid,unit_cost text,obligation text,paid text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF NOT public.has_role(auth.uid(),'SUPER_ADMIN') THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 RETURN QUERY SELECT f.purchase_id,f.unit_cost::text,f.obligation::text,COALESCE((SELECT sum(p.amount) FROM private.supplier_payments p WHERE p.purchase_id=f.purchase_id),0)::text FROM private.purchase_finance f WHERE f.purchase_id=_purchase_id;
END $$;
ALTER FUNCTION public.owner_purchase_finance(uuid) OWNER TO ph_engine;
REVOKE ALL ON FUNCTION public.owner_purchase_finance(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.owner_purchase_finance(uuid) TO authenticated;
COMMIT;
