"""Offline negative tests only. Does not start containers or contact PostgreSQL."""
import copy
import unittest
from datetime import datetime, timezone
from review08_safety import validate_preflight, SafetyStop

class IsolationRules(unittest.TestCase):
    def setUp(self):
        self.a={'runId':'synthetic-run','containerId':'sha256:container','imageId':'sha256:image','volumeName':'fresh-volume','approvalId':'owner-record','expiresAt':'2026-11-07T00:00:00Z','ownerApproved':True,'destructiveResetApproved':True,'syntheticOnly':True,'schemaHash':'hash','fixtureHash':'hash'}
        self.i={'Id':self.a['containerId'],'Image':self.a['imageId'],'HostConfig':{'NetworkMode':'none','Privileged':False,'PortBindings':{}},'NetworkSettings':{'Ports':{}},'Config':{'Labels':{'ph.review08.run':'synthetic-run','ph.review08.disposable':'true'}},'Mounts':[{'Type':'volume','Name':'fresh-volume'}],'State':{'Status':'running'}}
        self.now=datetime(2026,11,6,tzinfo=timezone.utc)
    def check(self):return validate_preflight(self.a,self.i,self.now)
    def test_valid_offline_identity(self):self.assertEqual(self.check(),'synthetic-run')
    def test_owner_approval_required(self):
        self.a['ownerApproved']=False
        with self.assertRaises(SafetyStop):self.check()
    def test_reset_requires_distinct_approval(self):
        self.a['destructiveResetApproved']=False
        with self.assertRaises(SafetyStop):self.check()
    def test_expired_approval(self):
        self.a['expiresAt']='2026-11-05T00:00:00Z'
        with self.assertRaises(SafetyStop):self.check()
    def test_forwarding_rejected(self):
        self.i['HostConfig']['PortBindings']={'5432/tcp':[{'HostPort':'5432'}]}
        with self.assertRaises(SafetyStop):self.check()
    def test_external_network_rejected(self):
        self.i['HostConfig']['NetworkMode']='bridge'
        with self.assertRaises(SafetyStop):self.check()
    def test_wrong_immutable_identity(self):
        self.i['Id']='other'
        with self.assertRaises(SafetyStop):self.check()
    def test_host_mount_rejected(self):
        self.i['Mounts'][0]['Type']='bind'
        with self.assertRaises(SafetyStop):self.check()
    def test_synthetic_only_required(self):
        self.a['syntheticOnly']=False
        with self.assertRaises(SafetyStop):self.check()

if __name__=='__main__':unittest.main()