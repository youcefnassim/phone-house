"""Concrete SQL acceptance SOURCE, NOT RUN. No host DSN; approval required.
Run only in an approved networkless container with the Review08 runner installed.
SQL role/subject simulations are never hosted Auth acceptance.
"""
import concurrent.futures
import json
import os
from pathlib import Path
import threading
import unittest
import uuid
from review08_container_runner import sql, checked_sql, DatabaseRejected, suite_lock, reset_fixture, preflight, verify_structure, ROOT
from review08_safety import load_local_approval, SafetyStop, require_stage

MODEL='10000000-0000-4000-8000-000000000001'
SKU='10000000-0000-4000-8000-000000000002'
VARIANT='12000000-0000-4000-8000-000000000001'
SUPPLIER='40000000-0000-4000-8000-000000000001'
PURCHASE='50000000-0000-4000-8000-000000000001'
APURCHASE='50000000-0000-4000-8000-000000000002'
DRAWER='20000000-0000-4000-8000-000000000001'
IDS=lambda n:f'00000000-0000-4000-8000-{n:012d}'

@unittest.skipUnless(os.environ.get('PH_REVIEW08_APPROVAL_FILE'), 'NOT RUN: separate owner approval artifact absent')
class Review08Acceptance(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.a=load_local_approval(os.environ['PH_REVIEW08_APPROVAL_FILE']);require_stage(cls.a,'B');preflight(cls.a)
        cls.lock=suite_lock(cls.a);cls.lock.__enter__()
        try:verify_structure(cls.a)
        except Exception:
            cls.lock.__exit__(None,None,None);raise
    @classmethod
    def tearDownClass(cls):
        try:verify_structure(cls.a)
        finally:cls.lock.__exit__(None,None,None)
    def setUp(self):
        print(json.dumps({'event':'caseStart','case':self._testMethodName}))
        reset_fixture(self.a)
    def scalar(self,text):
        rows=sql(self.a,text).strip().splitlines()
        if len(rows)!=1: raise SafetyStop('Expected exactly one oracle scalar')
        value=rows[0]
        # Publish only narrow numeric/boolean/state oracle values, never full rows.
        import re
        if re.fullmatch(r'-?\d+(\.\d+)?|t|f|OPEN|CLOSED|AVAILABLE|SOLD',value):
            print(json.dumps({'event':'oracleScalar','case':self._testMethodName,'value':value}))
        return value
    def rpc(self,op,p,user=2,key=None):
        request=json.dumps({'contractVersion':'2026-11-review08','idempotencyKey':key or 'test-'+str(uuid.uuid4()),'clientRequestId':str(uuid.uuid4()),'payload':p})
        tag='q'+uuid.uuid4().hex
        return checked_sql(self.a,f"SELECT public.command_{op}(${tag}${request}${tag}$::jsonb)",user=user,returns_json=True)
    def phone(self,**changes):
        p={'store':'M01','modelId':MODEL,'variantId':VARIANT,'purchaseId':PURCHASE,'supplierId':SUPPLIER,'imei1':'000000000000099','imei2':'000000000000098','serial':'SYNTHETIC-SERIAL','barcode':'UNIT-99','condition':'USED','packaging':'NO_BOX','color':'Blue','storage':'256 GB','batteryHealth':87,'conditionRemarks':'Synthetic surface mark','documentReference':'SYNTHETIC-RECEIPT'};p.update(changes);return p
    def receive(self,**changes):
        p={'store':'M01','skuId':SKU,'purchaseId':APURCHASE,'supplierId':SUPPLIER,'quantity':'2','documentReference':'SYNTHETIC-RECEIPT'};p.update(changes);return self.rpc('accessory_receiving',p)
    def observe(self):
        # Ordered complete row contents, not counts: detects unexpected updates as well as inserts.
        tables=['public.phone_units','private.phone_identifiers','public.phone_movements','public.purchase_receipts','public.accessory_balances','public.accessory_stock_ledger','public.cash_shifts','public.sales','public.sale_lines','public.sale_payments','public.cash_movements','public.debts','public.repayments','public.refunds','private.journals','private.ledger_entries','private.audit_events','private.idempotency_records','public.transfers','public.transfer_lines','public.transfer_approvals','public.transfer_scans','public.facility_contracts','public.facility_installments']
        state={t:self.scalar(f"SELECT COALESCE(jsonb_agg(v ORDER BY v::text),'[]'::jsonb)::text FROM (SELECT to_jsonb(r) v FROM {t} r) ordered;") for t in tables}
        import hashlib
        print(json.dumps({'event':'stateReadback','case':self._testMethodName,'tables':{t:{'count':len(json.loads(v)),'sha256':hashlib.sha256(v.encode()).hexdigest()} for t,v in state.items()}}))
        return state
    def denied(self,fn,state='42501'):
        before=self.observe()
        with self.assertRaises(DatabaseRejected) as error:fn()
        self.assertEqual(error.exception.sqlstate,state)
        self.assertEqual(self.observe(),before)
    def oracle(self,text,state=None):
        if state is None:return checked_sql(self.a,text)
        return self.denied(lambda:checked_sql(self.a,text),state)
    def open(self,amount='0.00'):
        return self.rpc('cash_shift_open',{'store':'M01','drawerId':DRAWER,'openingFloat':amount},3)['data']['shiftId']
    def checkout(self,shift,lines,amount='20.00'):
        return self.rpc('pos_checkout',{'store':'M01','shiftId':shift,'customerId':'30000000-0000-4000-8000-000000000001','lines':lines,'tender':'Cash','tenderedAmount':amount},3)
    def race(self,fn,state='23514'):
        barrier=threading.Barrier(2)
        def attempt(n):
            barrier.wait(timeout=10)
            try:return fn(n)['ok']
            except DatabaseRejected as e:
                self.assertEqual(e.sqlstate,state);return False
        with concurrent.futures.ThreadPoolExecutor(2) as pool:results=list(pool.map(attempt,range(2)))
        print(json.dumps({'event':'race','case':self._testMethodName,'committed':sum(results),'rejected':len(results)-sum(results)}))
        self.assertEqual(sorted(results),[False,True])
    def balanced(self):
        self.assertEqual(self.scalar("SELECT count(*) FROM (SELECT journal_id FROM private.ledger_entries GROUP BY journal_id HAVING sum(debit-credit)<>0) bad;"),'0')
    def test_U_complete_physical_roundtrip(self):
        result=self.rpc('phone_intake',self.phone());self.assertTrue(result['ok'])
        row=json.loads(self.scalar("SELECT jsonb_build_object('color',color,'storage',storage,'battery',battery_health,'remarks',condition_remarks,'packaging',packaging,'serial',serial)::text FROM public.phone_units;"))
        self.assertEqual(row,{'color':'Blue','storage':'256 GB','battery':87,'remarks':'Synthetic surface mark','packaging':'NO_BOX','serial':'SYNTHETIC-SERIAL'})
    def test_V_variant_integrity(self):self.denied(lambda:self.rpc('phone_intake',self.phone(storage='128 GB')), '22023')
    def test_W_purchase_supplier_provenance(self):self.denied(lambda:self.rpc('phone_intake',self.phone(supplierId=MODEL)))
    def test_X_receipt_cap_atomicity(self):
        self.receive(quantity='10');self.denied(lambda:self.receive(quantity='1'),'23514')
        self.assertEqual(self.scalar('SELECT sum(quantity) FROM public.purchase_receipts;'),'10')
    def test_Y_unknown_cost_preserved(self):
        self.rpc('phone_intake',self.phone())
        self.assertEqual(self.scalar('SELECT count(*) FROM private.purchase_finance WHERE unit_cost IS NULL AND obligation IS NULL;'),'2')
    def test_Z_duplicate_identity_rolls_back_receipt(self):
        self.rpc('phone_intake',self.phone());self.denied(lambda:self.rpc('phone_intake',self.phone(barcode='OTHER')), '23505')
    def test_AA_same_phone_checkout_race(self):
        phone=self.rpc('phone_intake',self.phone())['data']['phoneId']
        shift=self.rpc('cash_shift_open',{'store':'M01','drawerId':DRAWER,'openingFloat':'0.00'},3)['data']['shiftId'];barrier=threading.Barrier(2)
        def attempt(_):
            barrier.wait(timeout=10)
            try:return self.rpc('pos_checkout',{'store':'M01','shiftId':shift,'lines':[{'itemId':phone,'kind':'phone','quantity':'1'}],'tender':'Cash','tenderedAmount':'100.01'},3)['ok']
            except DatabaseRejected as error:
                self.assertEqual(error.sqlstate,'23514');return False
        with concurrent.futures.ThreadPoolExecutor(2) as e:results=list(e.map(attempt,range(2)))
        self.assertEqual(sorted(results),[False,True]);self.assertEqual(self.scalar('SELECT count(*) FROM public.sale_lines;'),'1')
    def test_AB_structural_conflict(self):
        # Active-ownership index must exist independent of checkout status checks.
        self.assertEqual(self.scalar("SELECT count(*) FROM pg_indexes WHERE indexname='one_active_sale_per_physical_phone' AND indexdef LIKE '%UNIQUE%' AND indexdef LIKE '%ownership_released_at IS NULL%';"),'1')
        self.assertEqual(self.scalar("SELECT has_table_privilege('authenticated','public.sale_lines','INSERT');"),'f')
        phone=self.rpc('phone_intake',self.phone())['data']['phoneId']
        shift=self.rpc('cash_shift_open',{'store':'M01','drawerId':DRAWER,'openingFloat':'0.00'},3)['data']['shiftId']
        self.rpc('pos_checkout',{'store':'M01','shiftId':shift,'lines':[{'itemId':phone,'kind':'phone','quantity':'1'}],'tender':'Cash','tenderedAmount':'100.01'},3)
        self.denied(lambda:checked_sql(self.a,"INSERT INTO public.sale_lines(sale_id,store_id,phone_unit_id,quantity,unit_price) SELECT sale_id,store_id,phone_unit_id,quantity,unit_price FROM public.sale_lines"),'23505')
        self.assertEqual(self.scalar('SELECT count(*) FROM public.sale_lines;'),'1')
    def test_AC_owner_cost_denial(self):
        self.denied(lambda:checked_sql(self.a,f"SELECT * FROM public.owner_purchase_finance('{PURCHASE}')",user=2),'42501')
    def test_AD_blind_close_response(self):
        shift=self.rpc('cash_shift_open',{'store':'M01','drawerId':DRAWER,'openingFloat':'0.00'},3)['data']['shiftId']
        result=self.rpc('cash_shift_close',{'store':'M01','shiftId':shift,'countedAmount':'0.01'},2)
        self.assertNotIn('discrepancy',result['data']);self.assertNotIn('expected',result['data'])
        self.assertEqual(self.scalar('SELECT discrepancy::text FROM public.cash_shifts;'),'0.01')
    def test_AE_bound_receipt_replay(self):
        p={'store':'M01','skuId':SKU,'purchaseId':APURCHASE,'supplierId':SUPPLIER,'quantity':'2','documentReference':'S'}
        first=self.rpc('accessory_receiving',p,key='review08-replay-key-01');before=self.observe()
        second=self.rpc('accessory_receiving',p,key='review08-replay-key-01')
        self.assertEqual(first['transactionId'],second['transactionId']);self.assertTrue(second['replayed']);self.assertEqual(self.observe(),before)
    def test_AF_cash_policy_blocked(self):
        shift=self.rpc('cash_shift_open',{'store':'M01','drawerId':DRAWER,'openingFloat':'0.00'},3)['data']['shiftId']
        self.denied(lambda:self.rpc('cash_movement',{'store':'M01','shiftId':shift,'direction':'OUT','amount':'1.00','reason':'S','documentReference':'S'}))
    def test_AG_close_checkout_race(self):
        self.receive(quantity='1')
        shift=self.rpc('cash_shift_open',{'store':'M01','drawerId':DRAWER,'openingFloat':'0.00'},3)['data']['shiftId'];barrier=threading.Barrier(2)
        def attempt(op):
            barrier.wait(timeout=10)
            try:
                p={'store':'M01','shiftId':shift,'countedAmount':'0.00'} if op=='cash_shift_close' else {'store':'M01','shiftId':shift,'lines':[{'itemId':SKU,'kind':'accessory','quantity':'1'}],'tender':'Cash','tenderedAmount':'20.00'}
                return self.rpc(op,p,2 if op=='cash_shift_close' else 3)['ok']
            except DatabaseRejected as error:
                self.assertEqual(error.sqlstate,'23514');return False
        with concurrent.futures.ThreadPoolExecutor(2) as e:results=list(e.map(attempt,['cash_shift_close','pos_checkout']))
        self.assertTrue(results[0]);self.assertEqual(self.scalar("SELECT state FROM public.cash_shifts;"),'CLOSED')
        sales=int(self.scalar('SELECT count(*) FROM public.sales;'))
        self.assertEqual(sales,int(results[1]));self.assertEqual(self.scalar('SELECT quantity FROM public.accessory_balances;'),str(1-sales))
        self.assertEqual(self.scalar('SELECT discrepancy::text FROM public.cash_shifts;'),'-20.00' if sales else '0.00')
    def test_AH_receipt_revocation(self):
        sql(self.a,f"UPDATE private.purchase_receiving_authorizations SET revoked_at=now() WHERE purchase_id='{APURCHASE}';")
        self.denied(lambda:self.receive())
    def test_AI_blind_alternate_acl(self):
        for table in ['public.cash_movements','public.cash_shifts','public.sales','public.sale_lines','public.repayments']:
            self.assertEqual(self.scalar(f"SELECT has_table_privilege('authenticated','{table}','SELECT');"),'f')
    def test_AJ_no_unapproved_ownership_release(self):
        self.assertEqual(self.scalar("SELECT has_table_privilege('ph_engine','public.sale_lines','UPDATE');"),'f')
        self.assertEqual(self.scalar("SELECT count(*) FROM pg_trigger WHERE tgrelid='public.sale_lines'::regclass AND tgname='immutable_history';"),'1')

    def test_A_store_isolation(self):
        self.denied(lambda:self.rpc('phone_intake',self.phone(),4))
        self.denied(lambda:checked_sql(self.a,"SELECT public.read_inventory_snapshot('M01')",user=4,returns_json=True))
    def test_B_cross_slot_global_imei(self):
        self.rpc('phone_intake',self.phone())
        self.denied(lambda:self.rpc('phone_intake',self.phone(imei1='000000000000098',imei2=None,serial='OTHER',barcode='OTHER')),'23505')
        self.assertEqual(self.scalar('SELECT count(*) FROM private.phone_identifiers;'),'2')
    def test_C_receiving_exact_balance_and_audit(self):
        self.receive()
        self.assertEqual(self.scalar('SELECT quantity FROM public.accessory_balances;'),'2')
        self.assertEqual(self.scalar('SELECT sum(quantity_delta) FROM public.accessory_stock_ledger;'),'2')
        self.assertEqual(self.scalar(f"SELECT count(*) FROM public.purchase_receipts WHERE purchase_id='{APURCHASE}' AND quantity=2 AND received_by='{IDS(2)}';"),'1')
        self.assertEqual(self.scalar('SELECT count(*) FROM private.audit_events;'),'1')
        self.assertEqual(self.scalar('SELECT count(*) FROM private.journals;'),'0')
    def test_D_one_open_shift_race(self):
        self.race(lambda _:self.rpc('cash_shift_open',{'store':'M01','drawerId':DRAWER,'openingFloat':'0.00'},3),'23505')
        self.assertEqual(self.scalar("SELECT count(*) FROM public.cash_shifts WHERE state='OPEN';"),'1')
        self.assertEqual(self.scalar('SELECT count(*) FROM private.idempotency_records;'),'1')
    def test_E_mixed_checkout_atomicity(self):
        phone=self.rpc('phone_intake',self.phone())['data']['phoneId'];self.receive();shift=self.open()
        before={t:len(json.loads(v)) for t,v in self.observe().items()}
        result=self.checkout(shift,[{'itemId':phone,'kind':'phone','quantity':'1'},{'itemId':SKU,'kind':'accessory','quantity':'2'}],'140.01')
        self.assertEqual(result['data']['total'],'140.01')
        after={t:len(json.loads(v)) for t,v in self.observe().items()}
        for t,n in [('public.sales',1),('public.sale_lines',2),('public.sale_payments',1),('public.cash_movements',1),('private.journals',1),('private.ledger_entries',2),('private.audit_events',1),('private.idempotency_records',1),('public.phone_movements',1)]:self.assertEqual(after[t]-before[t],n)
        self.assertEqual(self.scalar('SELECT quantity FROM public.accessory_balances;'),'0')
        self.assertEqual(self.scalar('SELECT total::text FROM public.sales;'),'140.01');self.balanced()
        self.assertEqual(self.scalar(f"SELECT count(*) FROM public.sales WHERE store_id='M01' AND shift_id='{shift}' AND seller_id='{IDS(3)}';"),'1')
    def test_F_bound_replay_conflicts(self):
        p={'store':'M01','skuId':SKU,'purchaseId':APURCHASE,'supplierId':SUPPLIER,'quantity':'2','documentReference':'S'};key='review09-replay-key-01'
        first=self.rpc('accessory_receiving',p,key=key);before=self.observe();second=self.rpc('accessory_receiving',p,key=key)
        self.assertEqual(first['transactionId'],second['transactionId']);self.assertTrue(second['replayed']);self.assertEqual(before,self.observe())
        self.denied(lambda:self.rpc('accessory_receiving',{**p,'quantity':'3'},key=key),'23505')
        self.denied(lambda:self.rpc('accessory_receiving',p,1,key=key))
    def test_G_blind_close_closed_shift(self):
        self.receive();shift=self.open('0.01');result=self.rpc('cash_shift_close',{'store':'M01','shiftId':shift,'countedAmount':'0.00'})
        self.assertNotIn('discrepancy',result['data']);self.assertEqual(self.scalar('SELECT discrepancy::text FROM public.cash_shifts;'),'-0.01')
        self.denied(lambda:self.checkout(shift,[{'itemId':SKU,'kind':'accessory','quantity':'1'}]),'23514')
        self.denied(lambda:checked_sql(self.a,f"SELECT public.owner_closed_shift('{shift}')",user=2,returns_json=True))
    def test_H_owner_finance_projection(self):
        sql(self.a,f"UPDATE private.purchase_finance SET unit_cost=80.01,obligation=80.01 WHERE purchase_id='{PURCHASE}';")
        for user in (2,3):self.denied(lambda:checked_sql(self.a,f"SELECT * FROM public.owner_purchase_finance('{PURCHASE}')",user=user))
        row=checked_sql(self.a,f"SELECT to_jsonb(f) FROM public.owner_purchase_finance('{PURCHASE}') f",user=1,returns_json=True)
        self.assertEqual(row['unit_cost'],'80.01')
    def test_I_last_accessory_concurrency(self):
        self.receive(quantity='1');shift=self.open();self.race(lambda _:self.checkout(shift,[{'itemId':SKU,'kind':'accessory','quantity':'1'}]))
        self.assertEqual(self.scalar('SELECT quantity FROM public.accessory_balances;'),'0');self.assertEqual(self.scalar('SELECT count(*) FROM public.sales;'),'1');self.balanced()
    def test_J_late_payment_full_rollback(self):
        phone=self.rpc('phone_intake',self.phone())['data']['phoneId'];self.receive();shift=self.open()
        self.denied(lambda:self.checkout(shift,[{'itemId':phone,'kind':'phone','quantity':'1'},{'itemId':SKU,'kind':'accessory','quantity':'2'}],'0.01'),'22023')
        self.assertEqual(self.scalar('SELECT status FROM public.phone_units;'),'AVAILABLE');self.assertEqual(self.scalar('SELECT quantity FROM public.accessory_balances;'),'2')
    def test_K_role_composition_revocation(self):
        for user in (7,6,8):self.denied(lambda:self.rpc('accessory_receiving',{'store':'M01','skuId':SKU,'purchaseId':APURCHASE,'supplierId':SUPPLIER,'quantity':'2','documentReference':'S'},user))
        sql(self.a,f"UPDATE public.user_roles SET revoked_at=now() WHERE user_id='{IDS(2)}' AND store_id='M01';")
        self.denied(lambda:self.receive())
    def test_L_exact_decimal(self):
        self.denied(lambda:self.open('0.001'),'22023');self.open('9007199254740993.01')
        self.assertEqual(self.scalar('SELECT opening_float::text FROM public.cash_shifts;'),'9007199254740993.01');self.balanced()
    def test_M_effective_acl_rls(self):
        for table in ('sales','phone_units','sale_lines','purchase_receipts','cash_shifts'):
            self.assertEqual(self.scalar(f"SELECT has_table_privilege('authenticated','public.{table}','INSERT');"),'f')
            self.assertEqual(self.scalar(f"SELECT relrowsecurity FROM pg_class WHERE oid='public.{table}'::regclass;"),'t')
            self.denied(lambda:checked_sql(self.a,f'SELECT * FROM public.{table}',user=3),'42501') if table in ('sales','sale_lines','cash_shifts') else None
        self.assertEqual(self.scalar("SELECT has_schema_privilege('authenticated','private','USAGE');"),'f')
        self.assertEqual(self.scalar("SELECT has_function_privilege('anon','public.command_pos_checkout(jsonb)','EXECUTE');"),'f')
        self.assertEqual(self.scalar("SELECT rolcanlogin OR rolbypassrls FROM pg_roles WHERE rolname='ph_engine';"),'f')
        self.assertEqual(self.scalar("SELECT pg_has_role('authenticated','ph_engine','MEMBER');"),'f')
        self.denied(lambda:checked_sql(self.a,'SELECT public.command_pos_checkout(\'{}\'::jsonb)',user=3,role='anon'),'42501')
    def test_N_default_execute_rollback(self):
        # All temporary grants/objects rolled back before Python assertions can fail.
        output=sql(self.a,"""BEGIN; GRANT CREATE ON SCHEMA private TO ph_engine;
CREATE FUNCTION private.review09_probe1() RETURNS int LANGUAGE sql AS $$ SELECT 1 $$;
SET LOCAL ROLE ph_engine;
CREATE FUNCTION private.review09_probe2() RETURNS int LANGUAGE sql AS $$ SELECT 1 $$;
RESET ROLE;
SELECT count(*) FROM pg_proc p CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a WHERE p.proname IN ('review09_probe1','review09_probe2') AND a.grantee=0 AND a.privilege_type='EXECUTE';
ROLLBACK;""").strip()
        self.assertEqual(output,'0');self.assertEqual(self.scalar("SELECT count(*) FROM pg_proc WHERE proname LIKE 'review09_probe%';"),'0')
        self.assertEqual(self.scalar("SELECT has_schema_privilege('ph_engine','private','CREATE');"),'f')
    def test_O_cumulative_repayment_race(self):
        self.receive(quantity='1');shift=self.open();sale=self.checkout(shift,[{'itemId':SKU,'kind':'accessory','quantity':'1'}])['data']['saleId'];debt='60000000-0000-4000-8000-000000000001'
        sql(self.a,f"INSERT INTO public.debts(id,customer_id,store_id,sale_id,amount,due_date,authorization_reference) VALUES('{debt}','30000000-0000-4000-8000-000000000001','M01','{sale}',20.00,'2026-12-01','SYNTHETIC ONLY');")
        p={'store':'M01','debtId':debt,'shiftId':shift,'amount':'15.00','method':'Cash','reference':'SYNTHETIC','authorizationReference':'SYNTHETIC'}
        self.race(lambda _:self.rpc('debt_repayment',p));self.assertEqual(self.scalar('SELECT sum(amount)::text FROM public.repayments;'),'15.00');self.balanced()
        self.assertEqual(self.scalar("SELECT sum(amount)::text FROM public.cash_movements WHERE reason='REPAYMENT';"),'15.00')
    def test_P_phone_identity_immutable(self):
        self.rpc('phone_intake',self.phone())
        for assignment in ("imei1='000000000000001'","receipt_id='50000000-0000-4000-8000-000000000001'","storage='128 GB'"):
            self.oracle('UPDATE public.phone_units SET '+assignment,'23514')
    def facility_setup(self):
        fid='70000000-0000-4000-8000-000000000001'
        sql(self.a,f"BEGIN; INSERT INTO public.facility_contracts(id,customer_id,store_id,employer,contract_reference,contract_price,approved_by,approval_reference) VALUES('{fid}','30000000-0000-4000-8000-000000000001','M01','Synthetic','S',100.01,'{IDS(1)}','SYNTHETIC'); INSERT INTO public.facility_installments(facility_id,due_month,amount) VALUES('{fid}','2026-11-01',50.00),('{fid}','2026-12-01',50.01); COMMIT;")
        return fid
    def test_Q_facility_schedule_delete_update_integrity(self):
        fid=self.facility_setup();self.assertEqual(self.scalar('SELECT sum(amount)::text FROM public.facility_installments;'),'100.01')
        self.oracle(f"DELETE FROM public.facility_installments WHERE facility_id='{fid}' AND due_month='2026-11-01'",'23514')
        self.oracle(f"UPDATE public.facility_installments SET amount=49.00 WHERE facility_id='{fid}' AND due_month='2026-11-01'",'23514')
        # Explicit approved synthetic replacement, not a commercial formula: DELETE uses OLD.
        sql(self.a,f"BEGIN; DELETE FROM public.facility_installments WHERE facility_id='{fid}'; INSERT INTO public.facility_installments(facility_id,due_month,amount) VALUES('{fid}','2026-11-01',100.01); COMMIT;")
        self.assertEqual(self.scalar('SELECT count(*) FROM public.facility_installments;'),'1');self.assertEqual(self.scalar('SELECT sum(amount)::text FROM public.facility_installments;'),'100.01')
    def test_R_store_foreign_keys(self):
        shift=self.open()
        sql(self.a,"INSERT INTO public.customers(id,store_id,name,contact,reference) VALUES('30000000-0000-4000-8000-000000000002','M02','Synthetic M02','NONE','S2');")
        self.oracle(f"INSERT INTO public.sales(store_id,shift_id,seller_id,customer_id,tender,total) VALUES('M02','{shift}','{IDS(5)}','30000000-0000-4000-8000-000000000002','Cash',1.00)",'23514')
        shift2=self.rpc('cash_shift_open',{'store':'M02','drawerId':'20000000-0000-4000-8000-000000000002','openingFloat':'0.00'},5)['data']['shiftId']
        self.oracle(f"INSERT INTO public.sales(store_id,shift_id,seller_id,customer_id,tender,total) VALUES('M02','{shift2}','{IDS(5)}','30000000-0000-4000-8000-000000000001','Cash',1.00)",'23503')
    def test_S_transfer_approval_provenance(self):
        phone=self.rpc('phone_intake',self.phone())['data']['phoneId'];tid='80000000-0000-4000-8000-000000000001';lid='80000000-0000-4000-8000-000000000002'
        sql(self.a,f"INSERT INTO public.transfers(id,from_store,to_store,reference) VALUES('{tid}','M01','M02','SYNTHETIC'); INSERT INTO public.transfer_lines(id,transfer_id,phone_unit_id,code,quantity) VALUES('{lid}','{tid}','{phone}','000000000000099',1);")
        self.oracle(f"UPDATE public.transfers SET stage='APPROVALS' WHERE id='{tid}'; UPDATE public.transfers SET stage='DISPATCH' WHERE id='{tid}'",'23514')
        # user7 may be M02 manager but must not attribute that approval to its M01 seller row.
        self.oracle(f"SELECT set_config('request.jwt.claim.sub','{IDS(7)}',true); INSERT INTO public.transfer_approvals SELECT '{tid}','M02_MANAGER','{IDS(7)}',id,now() FROM public.user_roles WHERE user_id='{IDS(7)}' AND store_id='M01'",'42501')
        self.rpc('transfer_approve',{'store':'M01','transferId':tid,'approval':'SUPER_ADMIN'},1)
        self.rpc('transfer_approve',{'store':'M02','transferId':tid,'approval':'M02_MANAGER'},4)
        self.assertEqual(self.scalar(f"SELECT count(*) FROM public.transfer_approvals a JOIN public.user_roles r ON r.id=a.role_assignment_id WHERE transfer_id='{tid}' AND r.user_id=a.actor_id AND r.revoked_at IS NULL;"),'2')
        sql(self.a,f"BEGIN; UPDATE public.transfers SET stage='DISPATCH' WHERE id='{tid}'; UPDATE public.transfers SET stage='IN_TRANSIT' WHERE id='{tid}'; UPDATE public.transfers SET stage='RECEIPT' WHERE id='{tid}'; COMMIT;")
        self.denied(lambda:checked_sql(self.a,f"INSERT INTO public.transfer_scans(transfer_id,line_id,code,scanned_by) VALUES('{tid}','{lid}','WRONG','{IDS(5)}')",user=None),'42501')
        # Trusted synthetic constraint probe uses actor context without bypassing trigger checks.
        self.oracle(f"SELECT set_config('request.jwt.claim.sub','{IDS(5)}',true); INSERT INTO public.transfer_scans(transfer_id,line_id,code,scanned_by) VALUES('{tid}','{lid}','WRONG','{IDS(5)}')",'23514')
        self.oracle(f"SELECT set_config('request.jwt.claim.sub','{IDS(5)}',true); INSERT INTO public.transfer_scans(transfer_id,line_id,code,scanned_by) VALUES('{tid}','{lid}','000000000000099','{IDS(5)}'); UPDATE public.transfers SET stage='COMPLETED' WHERE id='{tid}'")
        self.assertEqual(self.scalar('SELECT count(*) FROM public.transfer_scans;'),'1')
        self.assertEqual(self.scalar('SELECT status FROM public.phone_units;'),'AVAILABLE') # Stage-only source does NOT relocate inventory.
    def test_T_refund_cumulative_safeguard(self):
        phone=self.rpc('phone_intake',self.phone())['data']['phoneId'];shift=self.open();sale=self.checkout(shift,[{'itemId':phone,'kind':'phone','quantity':'1'}],'100.01')['data']['saleId'];case='90000000-0000-4000-8000-000000000001'
        sql(self.a,f"INSERT INTO public.warranty_cases(id,customer_id,store_id,sale_id,sale_line_id,imei,issue,requested_action,document_reference) SELECT '{case}','30000000-0000-4000-8000-000000000001','M01','{sale}',id,'000000000000099','Synthetic','Inspection','S' FROM public.sale_lines WHERE sale_id='{sale}';")
        statement=f"INSERT INTO public.refunds(case_id,sale_id,store_id,amount,reference,authorization_reference,created_by) VALUES('{case}','{sale}','M01',60.00,'S','S','{IDS(1)}')"
        self.oracle(statement);self.oracle(statement,'23514')
        self.assertEqual(self.scalar('SELECT sum(amount)::text FROM public.refunds;'),'60.00');self.assertEqual(self.scalar('SELECT status FROM public.phone_units;'),'SOLD')

if __name__=='__main__':unittest.main(verbosity=2)