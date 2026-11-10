"""Review09 entry point: 36 A–AJ cases plus actual SQL-read DTO validation.
No approval means all cases are NOT RUN. No environment creation occurs here.
"""
import json
import subprocess
import unittest
from review08_acceptance import Review08Acceptance, PURCHASE, ROOT
from review08_container_runner import checked_sql

class Review09Acceptance(Review08Acceptance):
    def test_production_read_dto_parity(self):
        self.rpc('phone_intake',self.phone());self.receive()
        for user in (1,2,3,4,5,7):
            operational=checked_sql(self.a,"SELECT public.read_operational_snapshot('ALL')",user=user,returns_json=True)
            inventory=checked_sql(self.a,"SELECT public.read_inventory_snapshot('ALL')",user=user,returns_json=True)
            allowed={'M01','M02'} if user in (1,7) else ({'M01'} if user in (2,3) else {'M02'})
            for collection in ('customers','sales','debts','suppliers','purchases','facilities','cases'):
                self.assertTrue(all(row['store'] in allowed for row in operational[collection]))
            self.assertTrue(all(row['store'] in allowed for row in inventory['phones']))
            self.assertEqual(operational['availability']['sales'],'AVAILABLE' if user==1 else 'FORBIDDEN')
            self.assertEqual(operational['expenses'],{'status':'UNIMPLEMENTED_POLICY_BLOCKED','data':None})
            prohibited={'unitCost','unit_cost','obligation','cogs','margin','expected','discrepancy'}
            def walk(value):
                if isinstance(value,dict):
                    self.assertFalse(prohibited.intersection(value));[walk(v) for v in value.values()]
                elif isinstance(value,list):[walk(v) for v in value]
            walk(operational);walk(inventory)
            result=subprocess.run(['bun',str(ROOT/'scripts/validate-production-reads.ts')],input=json.dumps({'operational':operational,'inventory':inventory,'finance':None}),text=True,capture_output=True,timeout=30)
            self.assertEqual(result.returncode,0,'SQL DTO contract rejected; raw data suppressed')
            self.assertEqual(json.loads(result.stdout)['status'],'VALIDATED')

if __name__=='__main__':
    # Imported base class is not separately discovered; every A–AJ runs once.
    suite=unittest.defaultTestLoader.loadTestsFromTestCase(Review09Acceptance)
    outcome=unittest.TextTestRunner(verbosity=2,failfast=True).run(suite)
    accepted=outcome.wasSuccessful() and outcome.testsRun==37 and not outcome.skipped
    print(json.dumps({'status':'PASS' if accepted else 'FAIL_OR_NOT_RUN','testsRun':outcome.testsRun,'skipped':len(outcome.skipped),'evidenceClass':'disposable SQL only'}))
    raise SystemExit(0 if accepted else 1)