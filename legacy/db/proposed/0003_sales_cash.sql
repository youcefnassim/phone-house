-- REVIEW07 SOURCE ONLY — UNDEPLOYED / NOT RUN. No connection or SQL execution authorized.
-- Fresh disposable database only; not an upgrade script for a deployed Review06 database.
BEGIN;
CREATE TABLE public.customers (
id uuid PRIMARY KEY DEFAULT gen_random_uuid(), store_id text NOT NULL REFERENCES public.stores(id), name text NOT NULL, contact text NOT NULL, reference text UNIQUE NOT NULL, address text NOT NULL DEFAULT '', notes text NOT NULL DEFAULT '', UNIQUE(id,store_id)
);
GRANT ALL ON public.customers TO ph_engine;
GRANT ALL ON public.customers TO service_role;
GRANT SELECT ON public.customers TO authenticated;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY engine_access ON public.customers TO ph_engine USING (true) WITH CHECK (true);
CREATE POLICY scoped_read ON public.customers FOR SELECT TO authenticated USING (public.can_access_store(store_id));
CREATE TABLE public.cash_drawers (
id uuid PRIMARY KEY DEFAULT gen_random_uuid(), store_id text UNIQUE NOT NULL REFERENCES public.stores(id), label text NOT NULL, UNIQUE(id,store_id)
);
GRANT ALL ON public.cash_drawers TO ph_engine;
GRANT ALL ON public.cash_drawers TO service_role;
GRANT SELECT ON public.cash_drawers TO authenticated;
ALTER TABLE public.cash_drawers ENABLE ROW LEVEL SECURITY;
CREATE POLICY engine_access ON public.cash_drawers TO ph_engine USING (true) WITH CHECK (true);
CREATE POLICY scoped_read ON public.cash_drawers FOR SELECT TO authenticated USING (public.can_access_store(store_id));
CREATE TABLE public.cash_shifts (
id uuid PRIMARY KEY DEFAULT gen_random_uuid(), store_id text NOT NULL, drawer_id uuid NOT NULL, opened_by uuid NOT NULL REFERENCES auth.users(id), opened_at timestamptz NOT NULL DEFAULT now(), opening_float numeric NOT NULL CHECK(opening_float>=0 AND scale(opening_float)<=2), closed_at timestamptz, counted_amount numeric CHECK(counted_amount>=0 AND scale(counted_amount)<=2), discrepancy numeric, state text NOT NULL DEFAULT 'OPEN' CHECK(state IN ('OPEN','CLOSED')), FOREIGN KEY(drawer_id,store_id) REFERENCES public.cash_drawers(id,store_id), UNIQUE(id,store_id), CHECK((state='CLOSED')=(closed_at IS NOT NULL)), CHECK((state='CLOSED')=(counted_amount IS NOT NULL))
);
GRANT ALL ON public.cash_shifts TO ph_engine;
GRANT ALL ON public.cash_shifts TO service_role;
ALTER TABLE public.cash_shifts ENABLE ROW LEVEL SECURITY;
CREATE POLICY engine_access ON public.cash_shifts TO ph_engine USING (true) WITH CHECK (true);
CREATE UNIQUE INDEX one_open_shift_per_drawer ON public.cash_shifts(drawer_id) WHERE state='OPEN';
CREATE TABLE public.cash_movements (
id uuid PRIMARY KEY DEFAULT gen_random_uuid(), store_id text NOT NULL, shift_id uuid NOT NULL, direction text NOT NULL CHECK(direction IN ('IN','OUT')), amount numeric NOT NULL CHECK(amount>0 AND scale(amount)<=2), reason text NOT NULL, reference text NOT NULL, created_by uuid NOT NULL REFERENCES auth.users(id), created_at timestamptz NOT NULL DEFAULT now(), FOREIGN KEY(shift_id,store_id) REFERENCES public.cash_shifts(id,store_id)
);
GRANT ALL ON public.cash_movements TO ph_engine;
GRANT ALL ON public.cash_movements TO service_role;
ALTER TABLE public.cash_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY engine_access ON public.cash_movements TO ph_engine USING (true) WITH CHECK (true);
CREATE TABLE public.sales (
id uuid PRIMARY KEY DEFAULT gen_random_uuid(), store_id text NOT NULL, shift_id uuid NOT NULL, seller_id uuid NOT NULL REFERENCES auth.users(id), customer_id uuid, tender text NOT NULL CHECK(tender IN ('Cash','Bank')), total numeric NOT NULL CHECK(total>0 AND scale(total)<=2), bank_reference text, created_at timestamptz NOT NULL DEFAULT now(), FOREIGN KEY(shift_id,store_id) REFERENCES public.cash_shifts(id,store_id), FOREIGN KEY(customer_id,store_id) REFERENCES public.customers(id,store_id), UNIQUE(id,store_id), UNIQUE(id,customer_id,store_id)
);
GRANT ALL ON public.sales TO ph_engine;
GRANT ALL ON public.sales TO service_role;
GRANT SELECT ON public.sales TO authenticated;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
CREATE POLICY engine_access ON public.sales TO ph_engine USING (true) WITH CHECK (true);
CREATE POLICY scoped_read ON public.sales FOR SELECT TO authenticated USING (public.can_access_store(store_id));
CREATE TABLE public.sale_lines (
id uuid PRIMARY KEY DEFAULT gen_random_uuid(), sale_id uuid NOT NULL, store_id text NOT NULL, phone_unit_id uuid REFERENCES public.phone_units(id), catalog_id uuid REFERENCES public.catalog_entries(id), quantity integer NOT NULL CHECK(quantity>0), unit_price numeric NOT NULL CHECK(unit_price>0 AND scale(unit_price)<=2), FOREIGN KEY(sale_id,store_id) REFERENCES public.sales(id,store_id), CHECK((phone_unit_id IS NULL)<>(catalog_id IS NULL)), CHECK(phone_unit_id IS NULL OR quantity=1), UNIQUE(id,sale_id,store_id)
);
GRANT ALL ON public.sale_lines TO ph_engine;
GRANT ALL ON public.sale_lines TO service_role;
GRANT SELECT ON public.sale_lines TO authenticated;
ALTER TABLE public.sale_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY engine_access ON public.sale_lines TO ph_engine USING (true) WITH CHECK (true);
CREATE POLICY scoped_read ON public.sale_lines FOR SELECT TO authenticated USING (public.can_access_store(store_id));
CREATE TABLE public.sale_payments (
id uuid PRIMARY KEY DEFAULT gen_random_uuid(), sale_id uuid NOT NULL, store_id text NOT NULL, method text NOT NULL CHECK(method IN ('Cash','Bank')), amount numeric NOT NULL CHECK(amount>0 AND scale(amount)<=2), tendered numeric NOT NULL CHECK(tendered>=amount AND scale(tendered)<=2), change numeric NOT NULL CHECK(change=tendered-amount), reference text, FOREIGN KEY(sale_id,store_id) REFERENCES public.sales(id,store_id)
);
GRANT ALL ON public.sale_payments TO ph_engine;
GRANT ALL ON public.sale_payments TO service_role;
ALTER TABLE public.sale_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY engine_access ON public.sale_payments TO ph_engine USING (true) WITH CHECK (true);
CREATE TABLE public.debts (
id uuid PRIMARY KEY DEFAULT gen_random_uuid(), customer_id uuid NOT NULL, store_id text NOT NULL, sale_id uuid NOT NULL, amount numeric NOT NULL CHECK(amount>0 AND scale(amount)<=2), due_date date NOT NULL, authorization_reference text NOT NULL, notes text NOT NULL DEFAULT '', FOREIGN KEY(sale_id,customer_id,store_id) REFERENCES public.sales(id,customer_id,store_id), UNIQUE(id,store_id)
);
GRANT ALL ON public.debts TO ph_engine;
GRANT ALL ON public.debts TO service_role;
GRANT SELECT ON public.debts TO authenticated;
ALTER TABLE public.debts ENABLE ROW LEVEL SECURITY;
CREATE POLICY engine_access ON public.debts TO ph_engine USING (true) WITH CHECK (true);
CREATE POLICY scoped_read ON public.debts FOR SELECT TO authenticated USING (public.can_access_store(store_id));
CREATE TABLE public.repayments (
id uuid PRIMARY KEY DEFAULT gen_random_uuid(), debt_id uuid NOT NULL, store_id text NOT NULL, shift_id uuid, amount numeric NOT NULL CHECK(amount>0 AND scale(amount)<=2), method text NOT NULL CHECK(method IN ('Cash','Bank')), reference text NOT NULL, authorization_reference text NOT NULL, created_by uuid NOT NULL REFERENCES auth.users(id), created_at timestamptz NOT NULL DEFAULT now(), FOREIGN KEY(debt_id,store_id) REFERENCES public.debts(id,store_id), FOREIGN KEY(shift_id,store_id) REFERENCES public.cash_shifts(id,store_id), CHECK((method='Cash')=(shift_id IS NOT NULL))
);
GRANT ALL ON public.repayments TO ph_engine;
GRANT ALL ON public.repayments TO service_role;
GRANT SELECT ON public.repayments TO authenticated;
ALTER TABLE public.repayments ENABLE ROW LEVEL SECURITY;
CREATE POLICY engine_access ON public.repayments TO ph_engine USING (true) WITH CHECK (true);
CREATE POLICY scoped_read ON public.repayments FOR SELECT TO authenticated USING (public.can_access_store(store_id));
COMMIT;
