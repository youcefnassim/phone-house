-- SYNTHETIC isolated fixture SOURCE ONLY. NOT RUN. NEVER install on a real/remote database.
-- Independent database identities exercise auth.uid()/RLS; HTTP login/handoff tests remain separate.
BEGIN;
TRUNCATE private.operating_expense_requests,private.purchase_receiving_authorizations,public.phone_movements,public.accessory_compatibility,public.phone_variants,public.phone_models,public.brands,public.accessory_variants,public.accessory_categories,private.ledger_entries,private.journals,private.audit_events,private.idempotency_records,private.phone_identifiers,
public.refunds,public.warranty_cases,public.repayments,public.debts,public.sale_payments,public.sale_lines,public.sales,
public.cash_movements,public.cash_shifts,public.cash_drawers,public.accessory_stock_ledger,public.accessory_balances,public.phone_units,
private.approved_prices,private.supplier_payments,private.purchase_finance,public.purchase_receipts,public.purchases,public.suppliers,
public.facility_salary_evidence,public.facility_bank_remittances,public.facility_installments,public.facility_contracts,
public.transfer_scans,public.transfer_approvals,public.transfer_lines,public.transfers,public.customers,public.catalog_entries,public.user_roles,public.profiles ;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM auth.users WHERE id NOT IN (SELECT ('00000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid FROM generate_series(1,8)i)) THEN RAISE EXCEPTION 'Unknown identity'; END IF; END $$;
DELETE FROM auth.users;
INSERT INTO auth.users(id) SELECT ('00000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid FROM generate_series(1,8) i;
INSERT INTO public.profiles(id,display_name,active) SELECT ('00000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'Synthetic '||i,i<>8 FROM generate_series(1,8)i;
INSERT INTO public.user_roles(user_id,store_id,role) VALUES
('00000000-0000-4000-8000-000000000001',NULL,'SUPER_ADMIN'),
('00000000-0000-4000-8000-000000000002','M01','MANAGER'),
('00000000-0000-4000-8000-000000000003','M01','SELLER'),
('00000000-0000-4000-8000-000000000004','M02','MANAGER'),
('00000000-0000-4000-8000-000000000005','M02','SELLER'),
('00000000-0000-4000-8000-000000000007','M02','MANAGER'),
('00000000-0000-4000-8000-000000000007','M01','SELLER'),
('00000000-0000-4000-8000-000000000008','M01','MANAGER');
INSERT INTO public.catalog_entries(id,kind,name,category,barcode) VALUES
('10000000-0000-4000-8000-000000000001','phone_model','Synthetic phone','Phone','MODEL-01'),
('10000000-0000-4000-8000-000000000002','accessory_sku','Synthetic cable','Accessory','SKU-02');
INSERT INTO private.approved_prices(store_id,catalog_id,amount,approved_by,reference) SELECT 'M01',id,CASE WHEN kind='phone_model' THEN 100.01 ELSE 20.00 END,'00000000-0000-4000-8000-000000000001','SYNTHETIC APPROVAL' FROM public.catalog_entries;
INSERT INTO public.cash_drawers(id,store_id,label) VALUES('20000000-0000-4000-8000-000000000001','M01','Synthetic M01'),('20000000-0000-4000-8000-000000000002','M02','Synthetic M02');
INSERT INTO public.customers(id,store_id,name,contact,reference) VALUES('30000000-0000-4000-8000-000000000001','M01','Synthetic customer','NONE','SYNTHETIC-C01');

INSERT INTO public.brands VALUES('11000000-0000-4000-8000-000000000001','Synthetic brand');
INSERT INTO public.phone_models VALUES('10000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000001','Synthetic model');
INSERT INTO public.phone_variants VALUES('12000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Blue','256 GB');
INSERT INTO public.accessory_categories VALUES('13000000-0000-4000-8000-000000000001','Synthetic cable');
INSERT INTO public.accessory_variants VALUES('10000000-0000-4000-8000-000000000002','13000000-0000-4000-8000-000000000001','SYNTHETIC-SKU','Synthetic cable',NULL,'USB-C');
INSERT INTO public.accessory_compatibility VALUES('10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001');
INSERT INTO public.suppliers(id,store_id,name,contact,document_reference) VALUES('40000000-0000-4000-8000-000000000001','M01','Synthetic','NONE','SYNTHETIC-S');
INSERT INTO public.purchases(id,store_id,supplier_id,kind,product,quantity,document_reference,expected_date,catalog_id,catalog_kind) VALUES
('50000000-0000-4000-8000-000000000001','M01','40000000-0000-4000-8000-000000000001','Phone','Synthetic',10,'SYNTHETIC-P1','2026-11-06','10000000-0000-4000-8000-000000000001','phone_model'),
('50000000-0000-4000-8000-000000000002','M01','40000000-0000-4000-8000-000000000001','Accessory','Synthetic',10,'SYNTHETIC-P2','2026-11-06','10000000-0000-4000-8000-000000000002','accessory_sku');
INSERT INTO private.purchase_receiving_authorizations(purchase_id,catalog_id,authorized_quantity,authorized_by,authorization_reference)
SELECT id,catalog_id,quantity,'00000000-0000-4000-8000-000000000001','SYNTHETIC TEST ONLY' FROM public.purchases;
-- Unknown costs deliberately remain NULL. Authorization rows are a synthetic oracle setup,
-- not an implemented purchase approval policy or operational account provisioning.
INSERT INTO private.purchase_finance(purchase_id,unit_cost,obligation) SELECT id,NULL,NULL FROM public.purchases;
COMMIT;

