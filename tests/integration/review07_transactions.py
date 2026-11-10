"""Real PostgreSQL acceptance source. NOT RUN absent explicit isolated approval.
No migration execution or provisioning happens automatically. Database fixture reset
is destructive and permitted only in an explicitly approved disposable loopback DB.
SQL identities test DB auth context, NOT hosted Auth sign-in/session acceptance.
"""
import concurrent.futures
import json
import os
from pathlib import Path
import unittest
import uuid

APPROVED = False  # Retired unsafe DSN activation. Review08 guarded runner is the only future path.
IDS = lambda n: f'00000000-0000-4000-8000-{n:012d}'
MODEL='10000000-0000-4000-8000-000000000001'
SKU='10000000-0000-4000-8000-000000000002'
DRAWER='20000000-0000-4000-8000-000000000001'
CUSTOMER='30000000-0000-4000-8000-000000000001'

@unittest.skipUnless(APPROVED,'NOT RUN: owner authorization for isolated database absent')
class PostgreSQLAcceptance(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        import psycopg
        from psycopg.conninfo import conninfo_to_dict
        cls.psycopg=psycopg
        cls.dsn=os.environ['PH_REVIEW07_TEST_DSN']
        details=conninfo_to_dict(cls.dsn)
        if details.get('host') not in ('127.0.0.1','localhost','::1') or details.get('dbname') != 'ph_review07_disposable':
            raise RuntimeError('Only approved named loopback disposable DB accepted')
        with cls.psycopg.connect(cls.dsn) as c:
            if c.execute('select current_user').fetchone()[0] != 'postgres':
                raise RuntimeError('Isolated test oracle requires postgres; user calls SET LOCAL ROLE authenticated')
    def setUp(self):
        with self.psycopg.connect(self.dsn) as c:
            c.execute((Path(__file__).parent/'review07/fixtures.sql').read_text())
    def scalar(self,sql,args=()):
        with self.psycopg.connect(self.dsn) as c: return c.execute(sql,args).fetchone()[0]
    def rpc(self,user,op,payload,key=None):
        request={'contractVersion':'2026-11-review07','idempotencyKey':key or 'test-'+str(uuid.uuid4()),'clientRequestId':str(uuid.uuid4()),'payload':payload}
        functions={'phone.intake':'command_phone_intake','accessory.receiving':'command_accessory_receiving','cash.shift.open':'command_cash_shift_open','cash.movement':'command_cash_movement','cash.shift.close':'command_cash_shift_close','pos.checkout':'command_pos_checkout','debt.repayment':'command_debt_repayment'}
        try:
            with self.psycopg.connect(self.dsn) as c:
                c.execute('SET LOCAL ROLE authenticated')
                c.execute("SELECT set_config('request.jwt.claim.sub',%s,true)",(IDS(user),))
                return c.execute('SELECT public.'+functions[op]+'(%s::jsonb)',(json.dumps(request),)).fetchone()[0]
        except self.psycopg.Error as e:
            return {'error':e.sqlstate}  # Never expose raw rows, credential strings or SQL error details.
    def intake(self,imei='000000000000099',imei2=None,key=None,user=2):
        p={'store':'M01','modelId':MODEL,'imei1':imei,'barcode':'UNIT-'+imei,'condition':'NEW','packaging':'SEALED','documentReference':'SYNTHETIC'}
        if imei2:p['imei2']=imei2
        return self.rpc(user,'phone.intake',p,key)
    def receive(self,q='2',key=None,user=2):
        return self.rpc(user,'accessory.receiving',{'store':'M01','skuId':SKU,'quantity':q,'documentReference':'SYNTHETIC'},key)
    def open(self):
        result=self.rpc(3,'cash.shift.open',{'store':'M01','drawerId':DRAWER,'openingFloat':'0.00'})
        self.assertTrue(result.get('ok'),result)
        return result['data']['shiftId']
    def checkout(self,shift,lines,tender='140.01',key=None):
        return self.rpc(3,'pos.checkout',{'store':'M01','shiftId':shift,'customerId':CUSTOMER,'lines':lines,'tender':'Cash','tenderedAmount':tender},key)
    def observe(self):
        # Independent privileged test readback: never uses business result booleans as an oracle.
        return {t:self.scalar('SELECT count(*) FROM '+t) for t in ['public.sales','public.sale_lines','public.sale_payments','public.cash_movements','public.repayments','private.journals','private.ledger_entries','private.audit_events','private.idempotency_records']}
    def test_A_store_isolation(self):
        self.assertEqual(self.intake(user=4),{'error':'42501'})
        self.assertEqual(self.scalar('select count(*) from public.phone_units'),0)
    def test_B_cross_slot_global_imei(self):
        self.assertTrue(self.intake(imei2='000000000000098')['ok'])
        self.assertEqual(self.intake('000000000000098'),{'error':'23505'})
        self.assertEqual(self.scalar('select count(*) from public.phone_units'),1)
        self.assertEqual(self.scalar('select count(*) from private.phone_identifiers'),2)
    def test_C_receiving_exact_balance_and_audit(self):
        self.assertTrue(self.receive()['ok'])
        self.assertEqual(self.scalar('select quantity from public.accessory_balances'),2)
        self.assertEqual(self.scalar('select sum(quantity_delta) from public.accessory_stock_ledger'),2)
        self.assertEqual(self.scalar('select count(*) from private.audit_events'),1)
    def test_D_one_open_shift_race(self):
        p={'store':'M01','drawerId':DRAWER,'openingFloat':'0.00'}
        with concurrent.futures.ThreadPoolExecutor(2) as e: results=list(e.map(lambda _:self.rpc(3,'cash.shift.open',p),range(2)))
        self.assertEqual(sum(bool(r.get('ok')) for r in results),1)
        self.assertEqual(self.scalar("select count(*) from public.cash_shifts where state='OPEN'"),1)
    def test_E_mixed_checkout(self):
        phone=self.intake()['data']['phoneId'];self.receive();shift=self.open();before=self.observe()
        result=self.checkout(shift,[{'itemId':phone,'kind':'phone','quantity':'1'},{'itemId':SKU,'kind':'accessory','quantity':'2'}])
        self.assertTrue(result.get('ok'),result);self.assertEqual(result['data']['total'],'140.01')
        after=self.observe()
        for table,delta in [('public.sales',1),('public.sale_lines',2),('public.sale_payments',1),('public.cash_movements',1),('private.journals',1),('private.ledger_entries',2),('private.audit_events',1),('private.idempotency_records',1)]: self.assertEqual(after[table]-before[table],delta)
        self.assertEqual(self.scalar('select quantity from public.accessory_balances'),0)
        self.assertEqual(self.scalar('select status from public.phone_units'),'SOLD')
        self.assertEqual(self.scalar('select total::text from public.sales'),'140.01')
        self.assertEqual(self.scalar('select sum(debit-credit) from private.ledger_entries'),0)
    def test_F_bound_replay(self):
        key='test-replay-key-00001';first=self.receive(key=key);before=self.observe();second=self.receive(key=key)
        self.assertEqual(first['transactionId'],second['transactionId']);self.assertTrue(second['replayed']);self.assertEqual(self.observe(),before)
        self.assertEqual(self.receive('3',key),{'error':'23505'})
        self.assertEqual(self.receive(key=key,user=1),{'error':'42501'})
    def test_G_blind_close_and_closed_shift(self):
        shift=self.open();self.assertTrue(self.rpc(2,'cash.movement',{'store':'M01','shiftId':shift,'direction':'IN','amount':'0.01','reason':'SYNTHETIC','documentReference':'S'})['ok'])
        result=self.rpc(2,'cash.shift.close',{'store':'M01','shiftId':shift,'countedAmount':'0.00'})
        self.assertEqual(result['data']['discrepancy'],'-0.01')
        self.assertEqual(self.scalar('select discrepancy::text from public.cash_shifts'),'-0.01')
        before=self.observe();self.assertEqual(self.checkout(shift,[{'itemId':SKU,'kind':'accessory','quantity':'1'}]),{'error':'23514'});self.assertEqual(self.observe(),before)
    def test_H_private_finance_projection(self):
        with self.psycopg.connect(self.dsn) as c:
            c.execute("INSERT INTO public.suppliers(id,store_id,name,contact,document_reference) VALUES('40000000-0000-4000-8000-000000000001','M01','Synthetic','NONE','S')")
            c.execute("INSERT INTO public.purchases(id,supplier_id,store_id,kind,product,quantity,document_reference,expected_date) VALUES('50000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','M01','Phone','Synthetic',1,'P','2026-11-06')")
            c.execute("INSERT INTO private.purchase_finance VALUES('50000000-0000-4000-8000-000000000001',80.01,80.01)")
        for user in (2,3):
            with self.assertRaises(self.psycopg.errors.InsufficientPrivilege):
                with self.psycopg.connect(self.dsn) as c:
                    c.execute('SET LOCAL ROLE authenticated');c.execute("select set_config('request.jwt.claim.sub',%s,true)",(IDS(user),));c.execute("select * from public.owner_purchase_finance('50000000-0000-4000-8000-000000000001')")
        with self.psycopg.connect(self.dsn) as c:
            c.execute('SET LOCAL ROLE authenticated');c.execute("select set_config('request.jwt.claim.sub',%s,true)",(IDS(1),))
            self.assertEqual(c.execute("select unit_cost from public.owner_purchase_finance('50000000-0000-4000-8000-000000000001')").fetchone()[0],'80.01')
    def test_I_last_stock_concurrency(self):
        self.receive('1');shift=self.open();line=[{'itemId':SKU,'kind':'accessory','quantity':'1'}]
        with concurrent.futures.ThreadPoolExecutor(2) as e: results=list(e.map(lambda _:self.checkout(shift,line,'20.00'),range(2)))
        self.assertEqual(sum(bool(r.get('ok')) for r in results),1)
        self.assertEqual(self.scalar('select quantity from public.accessory_balances'),0)
        self.assertEqual(self.scalar('select count(*) from public.sales'),1)
    def test_J_complete_rollback_on_late_payment_failure(self):
        phone=self.intake()['data']['phoneId'];self.receive();shift=self.open();before=self.observe()
        result=self.checkout(shift,[{'itemId':phone,'kind':'phone','quantity':'1'},{'itemId':SKU,'kind':'accessory','quantity':'2'}],'0.01')
        self.assertEqual(result,{'error':'22023'});self.assertEqual(self.observe(),before)
        self.assertEqual(self.scalar('select status from public.phone_units'),'AVAILABLE')
        self.assertEqual(self.scalar('select quantity from public.accessory_balances'),2)
    def test_K_mixed_store_roles_and_revocation(self):
        self.assertEqual(self.receive(user=7),{'error':'42501'})
        with self.psycopg.connect(self.dsn) as c:c.execute("update public.user_roles set revoked_at=now() where user_id=%s and store_id='M01'",(IDS(2),))
        self.assertEqual(self.receive(user=2),{'error':'42501'})
        for u in (6,8):self.assertEqual(self.receive(user=u),{'error':'42501'})
    def test_L_precision_preserved_and_excess_rejected(self):
        self.assertEqual(self.rpc(3,'cash.shift.open',{'store':'M01','drawerId':DRAWER,'openingFloat':'0.001'}),{'error':'22023'})
        self.assertEqual(self.scalar('select count(*) from public.cash_shifts'),0)
        self.assertTrue(self.rpc(3,'cash.shift.open',{'store':'M01','drawerId':DRAWER,'openingFloat':'9007199254740993.01'})['ok'])
        self.assertEqual(self.scalar('select opening_float::text from public.cash_shifts'),'9007199254740993.01')
    def test_M_catalog_effective_permissions(self):
        self.assertFalse(self.scalar("select has_schema_privilege('authenticated','private','USAGE')"))
        self.assertFalse(self.scalar("select has_table_privilege('authenticated','public.sales','INSERT')"))
        self.assertFalse(self.scalar("select has_function_privilege('anon','public.command_pos_checkout(jsonb)','EXECUTE')"))
        self.assertEqual(self.scalar("select pg_get_userbyid(proowner) from pg_proc where oid='public.command_pos_checkout(jsonb)'::regprocedure"),'ph_engine')
        self.assertFalse(self.scalar("select pg_has_role('authenticated','ph_engine','MEMBER')"))
        self.assertFalse(self.scalar("select rolbypassrls from pg_roles where rolname='ph_engine'"))
    def test_N_future_creator_global_default_execute(self):
        with self.psycopg.connect(self.dsn) as c:
            # Test-only temporary privilege; rolled back, never relax production ACLs.
            c.execute('GRANT CREATE ON SCHEMA private TO ph_engine')
            for creator in ('postgres','ph_engine'):
                c.execute('SET LOCAL ROLE '+creator)
                c.execute('CREATE FUNCTION private.review07_privilege_probe() RETURNS integer LANGUAGE sql AS $$ SELECT 1 $$')
                self.assertFalse(c.execute("select exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where p.oid='private.review07_privilege_probe()'::regprocedure and a.grantee=0 and a.privilege_type='EXECUTE')").fetchone()[0])
                c.execute('DROP FUNCTION private.review07_privilege_probe()')
                c.execute('RESET ROLE')
            c.rollback()
    def test_O_repayment_cumulative_concurrency(self):
        self.receive('1');shift=self.open();sale=self.checkout(shift,[{'itemId':SKU,'kind':'accessory','quantity':'1'}],'20.00')['data']['saleId']
        debt='60000000-0000-4000-8000-000000000001'
        with self.psycopg.connect(self.dsn) as c:c.execute('INSERT INTO public.debts(id,customer_id,store_id,sale_id,amount,due_date,authorization_reference) VALUES(%s,%s,\'M01\',%s,20.00,\'2026-12-01\',\'SYNTHETIC ONLY\')',(debt,CUSTOMER,sale))
        p={'store':'M01','debtId':debt,'shiftId':shift,'amount':'15.00','method':'Cash','reference':'SYNTHETIC','authorizationReference':'SYNTHETIC'}
        with concurrent.futures.ThreadPoolExecutor(2) as e:results=list(e.map(lambda _:self.rpc(2,'debt.repayment',p),range(2)))
        self.assertEqual(sum(bool(r.get('ok')) for r in results),1);self.assertEqual(self.scalar('select sum(amount)::text from public.repayments'),'15.00')
    def test_P_identity_immutable(self):
        self.intake()
        with self.assertRaises(self.psycopg.errors.CheckViolation):
            with self.psycopg.connect(self.dsn) as c:c.execute("update public.phone_units set imei1='000000000000001'")
    def test_Q_nonuniform_facility_schedule(self):
        with self.psycopg.connect(self.dsn) as c:
            c.execute("insert into public.facility_contracts(id,customer_id,store_id,employer,contract_reference,contract_price,approved_by,approval_reference) values('70000000-0000-4000-8000-000000000001',%s,'M01','Synthetic','S',100.01,%s,'SYNTHETIC')",(CUSTOMER,IDS(1)))
            c.execute("insert into public.facility_installments(facility_id,due_month,amount) values('70000000-0000-4000-8000-000000000001','2026-11-01',50.00),('70000000-0000-4000-8000-000000000001','2026-12-01',50.01)")
        self.assertEqual(self.scalar('select sum(amount)::text from public.facility_installments'),'100.01')
    def test_R_same_store_foreign_keys(self):
        shift=self.open()
        with self.assertRaises(self.psycopg.errors.ForeignKeyViolation):
            with self.psycopg.connect(self.dsn) as c:c.execute("insert into public.sales(store_id,shift_id,seller_id,customer_id,tender,total) values('M02',%s,%s,%s,'Cash',1.00)",(shift,IDS(5),CUSTOMER))
    def test_S_transfer_forged_approval_and_scan(self):
        self.intake();tid='80000000-0000-4000-8000-000000000001';lid='80000000-0000-4000-8000-000000000002'
        with self.psycopg.connect(self.dsn) as c:
            c.execute("insert into public.transfers(id,from_store,to_store,reference) values(%s,'M01','M02','SYNTHETIC')",(tid,))
            phone=c.execute('select id from public.phone_units').fetchone()[0]
            c.execute("insert into public.transfer_lines(id,transfer_id,phone_unit_id,code,quantity) values(%s,%s,%s,'000000000000099',1)",(lid,tid,phone))
        with self.assertRaises(self.psycopg.errors.CheckViolation):
            with self.psycopg.connect(self.dsn) as c:c.execute("update public.transfers set stage='APPROVALS' where id=%s",(tid,));c.execute("update public.transfers set stage='DISPATCH' where id=%s",(tid,))
        with self.assertRaises(self.psycopg.errors.InsufficientPrivilege):
            with self.psycopg.connect(self.dsn) as c:
                c.execute("select set_config('request.jwt.claim.sub',%s,true)",(IDS(7),))
                role=c.execute("select id from public.user_roles where user_id=%s and store_id='M01'",(IDS(7),)).fetchone()[0]
                c.execute("insert into public.transfer_approvals values(%s,'M02_MANAGER',%s,%s,now())",(tid,IDS(7),role))
        # Trusted synthetic setup progresses via valid, independently attributed approvals.
        with self.psycopg.connect(self.dsn) as c:
            for user,approval in ((1,'SUPER_ADMIN'),(4,'M02_MANAGER')):
                c.execute("select set_config('request.jwt.claim.sub',%s,true)",(IDS(user),))
                role=c.execute('select id from public.user_roles where user_id=%s',(IDS(user),)).fetchone()[0]
                c.execute('insert into public.transfer_approvals values(%s,%s,%s,%s,now())',(tid,approval,IDS(user),role))
            for stage in ('APPROVALS','DISPATCH','IN_TRANSIT','RECEIPT'):c.execute('update public.transfers set stage=%s where id=%s',(stage,tid))
        with self.assertRaises(self.psycopg.errors.CheckViolation):
            with self.psycopg.connect(self.dsn) as c:
                c.execute("select set_config('request.jwt.claim.sub',%s,true)",(IDS(5),))
                c.execute("insert into public.transfer_scans(transfer_id,line_id,code,scanned_by) values(%s,%s,'WRONG',%s)",(tid,lid,IDS(5)))
        with self.psycopg.connect(self.dsn) as c:
            c.execute("select set_config('request.jwt.claim.sub',%s,true)",(IDS(5),))
            c.execute("insert into public.transfer_scans(transfer_id,line_id,code,scanned_by) values(%s,%s,'000000000000099',%s)",(tid,lid,IDS(5)))
            c.execute("update public.transfers set stage='COMPLETED' where id=%s",(tid,))
        self.assertEqual(self.scalar('select count(*) from public.transfer_scans'),1)
    def test_T_repeated_refund_cap(self):
        phone=self.intake()['data']['phoneId'];shift=self.open();sale=self.checkout(shift,[{'itemId':phone,'kind':'phone','quantity':'1'}],'100.01')['data']['saleId']
        case='90000000-0000-4000-8000-000000000001'
        with self.psycopg.connect(self.dsn) as c:
            line=c.execute('select id from public.sale_lines where sale_id=%s',(sale,)).fetchone()[0]
            c.execute("insert into public.warranty_cases(id,customer_id,store_id,sale_id,sale_line_id,imei,issue,requested_action,document_reference) values(%s,%s,'M01',%s,%s,'000000000000099','Synthetic','Inspection','S')",(case,CUSTOMER,sale,line))
            c.execute("insert into public.refunds(case_id,sale_id,store_id,amount,reference,authorization_reference,created_by) values(%s,%s,'M01',60.00,'S','S',%s)",(case,sale,IDS(1)))
        with self.assertRaises(self.psycopg.errors.CheckViolation):
            with self.psycopg.connect(self.dsn) as c:c.execute("insert into public.refunds(case_id,sale_id,store_id,amount,reference,authorization_reference,created_by) values(%s,%s,'M01',60.00,'S2','S2',%s)",(case,sale,IDS(1)))
        self.assertEqual(self.scalar('select sum(amount)::text from public.refunds'),'60.00')

if __name__=='__main__':unittest.main(verbosity=2)
