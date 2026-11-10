-- REVIEW07 SOURCE ONLY — UNDEPLOYED / NOT RUN. No connection or SQL execution authorized.
-- Fresh disposable database only; not an upgrade script for a deployed Review06 database.
BEGIN;
CREATE TABLE public.facility_contracts (
id uuid PRIMARY KEY DEFAULT gen_random_uuid(), customer_id uuid NOT NULL, store_id text NOT NULL CHECK(store_id='M01'), employer text NOT NULL, contract_reference text UNIQUE NOT NULL, contract_price numeric NOT NULL CHECK(contract_price>0 AND scale(contract_price)<=2), approved_by uuid NOT NULL REFERENCES auth.users(id), approval_reference text NOT NULL, FOREIGN KEY(customer_id,store_id) REFERENCES public.customers(id,store_id)
);
GRANT ALL ON public.facility_contracts TO ph_engine;
GRANT ALL ON public.facility_contracts TO service_role;
GRANT SELECT ON public.facility_contracts TO authenticated;
ALTER TABLE public.facility_contracts ENABLE ROW LEVEL SECURITY;
CREATE POLICY engine_access ON public.facility_contracts TO ph_engine USING (true) WITH CHECK (true);
CREATE POLICY scoped_read ON public.facility_contracts FOR SELECT TO authenticated USING (public.can_access_store(store_id));
CREATE TABLE public.facility_installments (
id uuid PRIMARY KEY DEFAULT gen_random_uuid(), facility_id uuid NOT NULL REFERENCES public.facility_contracts(id), due_month date NOT NULL CHECK(EXTRACT(day FROM due_month)=1), amount numeric NOT NULL CHECK(amount>0 AND scale(amount)<=2), UNIQUE(facility_id,due_month)
);
GRANT ALL ON public.facility_installments TO ph_engine;
GRANT ALL ON public.facility_installments TO service_role;
ALTER TABLE public.facility_installments ENABLE ROW LEVEL SECURITY;
CREATE POLICY engine_access ON public.facility_installments TO ph_engine USING (true) WITH CHECK (true);
CREATE TABLE public.facility_salary_evidence (
id uuid PRIMARY KEY DEFAULT gen_random_uuid(), installment_id uuid NOT NULL REFERENCES public.facility_installments(id), amount numeric NOT NULL CHECK(amount>0 AND scale(amount)<=2), reference text NOT NULL, recorded_by uuid NOT NULL REFERENCES auth.users(id)
);
GRANT ALL ON public.facility_salary_evidence TO ph_engine;
GRANT ALL ON public.facility_salary_evidence TO service_role;
ALTER TABLE public.facility_salary_evidence ENABLE ROW LEVEL SECURITY;
CREATE POLICY engine_access ON public.facility_salary_evidence TO ph_engine USING (true) WITH CHECK (true);
CREATE TABLE public.facility_bank_remittances (
id uuid PRIMARY KEY DEFAULT gen_random_uuid(), installment_id uuid NOT NULL REFERENCES public.facility_installments(id), amount numeric NOT NULL CHECK(amount>0 AND scale(amount)<=2), bank_reference text UNIQUE NOT NULL, verified_by uuid NOT NULL REFERENCES auth.users(id)
);
GRANT ALL ON public.facility_bank_remittances TO ph_engine;
GRANT ALL ON public.facility_bank_remittances TO service_role;
ALTER TABLE public.facility_bank_remittances ENABLE ROW LEVEL SECURITY;
CREATE POLICY engine_access ON public.facility_bank_remittances TO ph_engine USING (true) WITH CHECK (true);
CREATE TABLE public.transfers (
id uuid PRIMARY KEY DEFAULT gen_random_uuid(), from_store text NOT NULL REFERENCES public.stores(id), to_store text NOT NULL REFERENCES public.stores(id), reference text UNIQUE NOT NULL, stage text NOT NULL DEFAULT 'DRAFT' CHECK(stage IN ('DRAFT','APPROVALS','DISPATCH','IN_TRANSIT','RECEIPT','COMPLETED','REJECTED')), CHECK(from_store<>to_store)
);
GRANT ALL ON public.transfers TO ph_engine;
GRANT ALL ON public.transfers TO service_role;
ALTER TABLE public.transfers ENABLE ROW LEVEL SECURITY;
CREATE POLICY engine_access ON public.transfers TO ph_engine USING (true) WITH CHECK (true);
CREATE TABLE public.transfer_lines (
id uuid PRIMARY KEY DEFAULT gen_random_uuid(), transfer_id uuid NOT NULL REFERENCES public.transfers(id), phone_unit_id uuid REFERENCES public.phone_units(id), catalog_id uuid REFERENCES public.catalog_entries(id), code text NOT NULL, quantity integer NOT NULL CHECK(quantity>0), CHECK((phone_unit_id IS NULL)<>(catalog_id IS NULL)), CHECK(phone_unit_id IS NULL OR quantity=1), UNIQUE(transfer_id,code), UNIQUE(id,transfer_id)
);
GRANT ALL ON public.transfer_lines TO ph_engine;
GRANT ALL ON public.transfer_lines TO service_role;
ALTER TABLE public.transfer_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY engine_access ON public.transfer_lines TO ph_engine USING (true) WITH CHECK (true);
CREATE TABLE public.transfer_approvals (
transfer_id uuid NOT NULL REFERENCES public.transfers(id), approval text NOT NULL CHECK(approval IN ('SUPER_ADMIN','M02_MANAGER')), actor_id uuid NOT NULL REFERENCES auth.users(id), role_assignment_id uuid NOT NULL REFERENCES public.user_roles(id), created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(transfer_id,approval)
);
GRANT ALL ON public.transfer_approvals TO ph_engine;
GRANT ALL ON public.transfer_approvals TO service_role;
ALTER TABLE public.transfer_approvals ENABLE ROW LEVEL SECURITY;
CREATE POLICY engine_access ON public.transfer_approvals TO ph_engine USING (true) WITH CHECK (true);
CREATE TABLE public.transfer_scans (
id uuid PRIMARY KEY DEFAULT gen_random_uuid(), transfer_id uuid NOT NULL, line_id uuid NOT NULL, code text NOT NULL, scanned_by uuid NOT NULL REFERENCES auth.users(id), FOREIGN KEY(line_id,transfer_id) REFERENCES public.transfer_lines(id,transfer_id)
);
GRANT ALL ON public.transfer_scans TO ph_engine;
GRANT ALL ON public.transfer_scans TO service_role;
ALTER TABLE public.transfer_scans ENABLE ROW LEVEL SECURITY;
CREATE POLICY engine_access ON public.transfer_scans TO ph_engine USING (true) WITH CHECK (true);
CREATE TABLE public.warranty_cases (
id uuid PRIMARY KEY DEFAULT gen_random_uuid(), customer_id uuid NOT NULL, store_id text NOT NULL, sale_id uuid NOT NULL, sale_line_id uuid NOT NULL, imei text NOT NULL, issue text NOT NULL, requested_action text NOT NULL, document_reference text NOT NULL, notes text NOT NULL DEFAULT '', stage text NOT NULL DEFAULT 'Inspection', FOREIGN KEY(sale_id,customer_id,store_id) REFERENCES public.sales(id,customer_id,store_id), FOREIGN KEY(sale_line_id,sale_id,store_id) REFERENCES public.sale_lines(id,sale_id,store_id), UNIQUE(id,sale_id,store_id)
);
GRANT ALL ON public.warranty_cases TO ph_engine;
GRANT ALL ON public.warranty_cases TO service_role;
GRANT SELECT ON public.warranty_cases TO authenticated;
ALTER TABLE public.warranty_cases ENABLE ROW LEVEL SECURITY;
CREATE POLICY engine_access ON public.warranty_cases TO ph_engine USING (true) WITH CHECK (true);
CREATE POLICY scoped_read ON public.warranty_cases FOR SELECT TO authenticated USING (public.can_access_store(store_id));
CREATE TABLE public.refunds (
id uuid PRIMARY KEY DEFAULT gen_random_uuid(), case_id uuid NOT NULL, sale_id uuid NOT NULL, store_id text NOT NULL, amount numeric NOT NULL CHECK(amount>0 AND scale(amount)<=2), reference text NOT NULL, authorization_reference text NOT NULL, created_by uuid NOT NULL REFERENCES auth.users(id), FOREIGN KEY(case_id,sale_id,store_id) REFERENCES public.warranty_cases(id,sale_id,store_id)
);
GRANT ALL ON public.refunds TO ph_engine;
GRANT ALL ON public.refunds TO service_role;
ALTER TABLE public.refunds ENABLE ROW LEVEL SECURITY;
CREATE POLICY engine_access ON public.refunds TO ph_engine USING (true) WITH CHECK (true);
COMMIT;
