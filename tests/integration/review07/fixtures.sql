-- SYNTHETIC isolated fixture SOURCE ONLY. NOT RUN. NEVER install on a real/remote database.
-- Independent database identities exercise auth.uid()/RLS; HTTP login/handoff tests remain separate.
BEGIN;
TRUNCATE private.ledger_entries,private.journals,private.audit_events,private.idempotency_records,private.phone_identifiers,
public.refunds,public.warranty_cases,public.repayments,public.debts,public.sale_payments,public.sale_lines,public.sales,
public.cash_movements,public.cash_shifts,public.accessory_stock_ledger,public.accessory_balances,public.phone_units,
private.approved_prices,private.supplier_payments,private.purchase_finance,public.purchase_receipts,public.purchases,public.suppliers,
public.facility_salary_evidence,public.facility_bank_remittances,public.facility_installments,public.facility_contracts,
public.transfer_scans,public.transfer_approvals,public.transfer_lines,public.transfers,public.customers,public.catalog_entries,public.user_roles,public.profiles CASCADE;
INSERT INTO auth.users(id) SELECT ('00000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid FROM generate_series(1,8) i ON CONFLICT DO NOTHING;
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
INSERT INTO public.cash_drawers(id,store_id,label) VALUES('20000000-0000-4000-8000-000000000001','M01','Synthetic M01'),('20000000-0000-4000-8000-000000000002','M02','Synthetic M02') ON CONFLICT DO NOTHING;
INSERT INTO public.customers(id,store_id,name,contact,reference) VALUES('30000000-0000-4000-8000-000000000001','M01','Synthetic customer','NONE','SYNTHETIC-C01');
COMMIT;
