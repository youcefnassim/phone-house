"""Offline mocks only; never contacts Docker/PostgreSQL."""
import unittest
from unittest.mock import patch
from review08_container_runner import checked_sql, DatabaseRejected, PSQL
from review08_safety import SafetyStop, load_local_approval

class ProtocolSafety(unittest.TestCase):
    def test_exact_database_rejection(self):
        with patch('review08_container_runner.client',return_value='NOTICE:  PH_REJECTED:23505\n'):
            with self.assertRaises(DatabaseRejected) as e:checked_sql({},'SELECT 1')
            self.assertEqual(e.exception.sqlstate,'23505')
    def test_infrastructure_failure_is_not_business_rejection(self):
        with patch('review08_container_runner.client',side_effect=SafetyStop('infrastructure')):
            with self.assertRaises(SafetyStop):checked_sql({},'SELECT 1')
    def test_success_protocol(self):
        with patch('review08_container_runner.client',return_value='NOTICE:  PH_RESULT:{"ok":true}\n'):
            self.assertEqual(checked_sql({},'SELECT 1',returns_json=True),{'ok':True})
    def test_missing_protocol_rejected(self):
        with patch('review08_container_runner.client',return_value='ERROR: unrelated'):
            with self.assertRaises(SafetyStop):checked_sql({},'SELECT 1')
    def test_ambiguous_protocol_rejected(self):
        with patch('review08_container_runner.client',return_value='NOTICE:  PH_RESULT:null\nNOTICE:  PH_REJECTED:23505\n'):
            with self.assertRaises(SafetyStop):checked_sql({},'SELECT 1')
    def test_libpq_environment_scrubbed_and_socket_pinned(self):
        self.assertEqual(PSQL[:2],['env','-i']);self.assertEqual(PSQL[PSQL.index('-h')+1],'/var/run/postgresql');self.assertEqual(PSQL[PSQL.index('-p')+1],'5432')
    def test_unapproved_subject_rejected(self):
        with self.assertRaises(SafetyStop):checked_sql({},'SELECT 1',user=99)
    def test_signed_off_digest_required(self):
        import tempfile,json,os
        with tempfile.NamedTemporaryFile() as f:
            f.write(json.dumps({'review':'09'}).encode());f.flush();os.chmod(f.name,0o600)
            with patch.dict(os.environ,{},clear=True):
                with self.assertRaises(SafetyStop):load_local_approval(f.name)

if __name__=='__main__':unittest.main()