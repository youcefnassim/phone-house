"""Offline predicates/mocks only. No Docker or PostgreSQL execution."""
import copy
import hashlib
import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from review08_safety import require_stage, load_local_approval, SafetyStop, BASE_ARCHIVE_HASH, IMAGE_DIGEST
from review08_container_runner import reset_fixture, run_phase, verify_structure, cleanup

def approval(stage='A'):
    a={'review':'execution-gate-v1','stage':stage,'runId':'synthetic-gate','ownerApproved':True,
       'syntheticOnly':True,'freshVolumeAttested':True,'schemaApproved':True,
       'testsApproved':False,'destructiveResetApproved':False,'cleanupApproved':False,
       'operatorIdentity':'SYNTHETIC OPERATOR','baseArchiveHash':BASE_ARCHIVE_HASH,
       'imageDigest':IMAGE_DIGEST,'approvedFiles':{'synthetic':'a'*64},'migrationOrder':['0001.sql'],
       'databaseIdentity':'synthetic|run|123','containerId':'synthetic-container','imageId':'synthetic-image','volumeName':'synthetic-volume'}
    for k in ('operatorAttestationDigest','ownerApprovalDigest','executionHash','schemaHash','fixtureHash','handoffArchiveHash'):a[k]='a'*64
    if stage=='B':
        a.update(testsApproved=True,destructiveResetApproved=True,cleanupApproved=True,structureReviewed=True,stageAApprovalDigest='a'*64,structureHash='b'*64,
                 cleanupScope={'containerId':a['containerId'],'volumeName':a['volumeName']})
    return a

class ExecutionGateSafety(unittest.TestCase):
    def test_stage_a_allows_schema_without_test_or_reset_approval(self):
        require_stage(approval(),'A')
    def test_stage_a_cannot_reset_before_any_container_call(self):
        with patch('review08_container_runner.preflight') as preflight:
            with self.assertRaises(SafetyStop):reset_fixture(approval())
            preflight.assert_not_called()
    def test_stage_a_cannot_enter_test_phase(self):
        with self.assertRaises(SafetyStop):require_stage(approval(),'B')
    def test_stage_a_cannot_destroy_before_any_container_call(self):
        with patch('review08_container_runner.preflight') as preflight:
            with self.assertRaises(SafetyStop):cleanup(approval())
            preflight.assert_not_called()
    def test_stage_b_cannot_recompile_schema(self):
        with patch('review08_container_runner.preflight') as preflight:
            with self.assertRaises(SafetyStop):run_phase(approval('B'),'schema')
            preflight.assert_not_called()
    def test_stage_a_explicitly_excludes_destruction(self):
        a=approval();a['cleanupApproved']=True
        with self.assertRaises(SafetyStop):require_stage(a,'A')
    def test_stage_b_requires_each_separate_scope(self):
        for key in ('testsApproved','destructiveResetApproved','cleanupApproved','structureReviewed'):
            with self.subTest(key=key):
                a=approval('B');a[key]=False
                with self.assertRaises(SafetyStop):require_stage(a,'B')
    def test_stage_b_requires_exact_cleanup_resources(self):
        a=approval('B');a['cleanupScope']['volumeName']='unrelated'
        with self.assertRaises(SafetyStop):require_stage(a,'B')
    def test_unknown_stage_rejected(self):
        a=approval();a['stage']=None
        with self.assertRaises(SafetyStop):require_stage(a,None)
    def test_table_names_cannot_substitute_structural_digest(self):
        with patch('review08_container_runner.structure',return_value=('{}','c'*64)):
            with self.assertRaises(SafetyStop):verify_structure(approval('B'))
    def test_structural_verification_reads_approved_digest(self):
        with patch('review08_container_runner.structure',return_value=('{}','b'*64)) as capture:
            verify_structure(approval('B'));capture.assert_called_once()
    def test_owner_digest_not_boolean_authorizes_approval(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/'a.json';p.write_text(json.dumps(approval()));p.chmod(0o600)
            with patch.dict(os.environ,{},clear=True):
                with self.assertRaises(SafetyStop):load_local_approval(p)
    def test_stage_b_must_link_same_stage_a_identity(self):
        with tempfile.TemporaryDirectory() as d:
            a=approval();pa=Path(d)/'a.json';pa.write_text(json.dumps(a));pa.chmod(0o600)
            ha=hashlib.sha256(pa.read_bytes()).hexdigest()
            b=approval('B');b['stageAApprovalDigest']=ha
            pb=Path(d)/'b.json'
            for changed in (False,True):
                if changed:b['containerId']='another-container'
                pb.write_text(json.dumps(b));pb.chmod(0o600)
                env={'PH_EXECUTION_STAGE_A_FILE':str(pa),'PH_EXECUTION_TRUSTED_STAGE_A_SHA256':ha,
                     'PH_EXECUTION_TRUSTED_STAGE_B_SHA256':hashlib.sha256(pb.read_bytes()).hexdigest()}
                with patch.dict(os.environ,env,clear=True):
                    if changed:
                        with self.assertRaises(SafetyStop):load_local_approval(pb)
                    else:self.assertEqual(load_local_approval(pb)['stage'],'B')

if __name__=='__main__':unittest.main()