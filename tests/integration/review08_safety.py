"""Offline isolation preflight. No connection, provisioning or destructive action."""
import hashlib
import json
import os
from datetime import datetime, timezone
from pathlib import Path

class SafetyStop(RuntimeError):
    pass

BASE_ARCHIVE_HASH = '4d9df1abb63b6eb147c1b5c35280a4c8ae01351433a3ed1cf901268eb1327704'
IMAGE_DIGEST = 'sha256:45cd22f8d32e189d245403954882f88e7a8714301fda80dab6da90f1265b25a3'

def require_stage(approval, stage):
    """Action gate, in addition to independently confirmed exact approval bytes."""
    if stage not in ('A','B') or approval.get('review') != 'execution-gate-v1' or approval.get('stage') != stage:
        raise SafetyStop('Separate action-specific owner approval required')
    flags = ['ownerApproved', 'syntheticOnly', 'freshVolumeAttested', 'schemaApproved']
    if stage == 'B':
        flags += ['testsApproved', 'destructiveResetApproved', 'cleanupApproved', 'structureReviewed']
    if any(approval.get(k) is not True for k in flags):
        raise SafetyStop('Stage scope incomplete')
    if stage == 'A' and any(approval.get(k) is not False for k in ('testsApproved','destructiveResetApproved','cleanupApproved')):
        raise SafetyStop('Stage A must not authorize reset, tests or destruction')
    import re
    digests = ['operatorAttestationDigest','ownerApprovalDigest','executionHash','schemaHash','fixtureHash','handoffArchiveHash']
    if stage == 'B': digests += ['stageAApprovalDigest','structureHash']
    if any(not isinstance(approval.get(k), str) or not re.fullmatch('[0-9a-f]{64}',approval[k]) for k in digests):
        raise SafetyStop('Missing approval/evidence digest')
    if approval.get('baseArchiveHash') != BASE_ARCHIVE_HASH or approval.get('imageDigest') != IMAGE_DIGEST:
        raise SafetyStop('Unapproved base archive/image')
    if not isinstance(approval.get('operatorIdentity'),str) or not approval['operatorIdentity'].strip():
        raise SafetyStop('Named independent operator required')
    if not re.fullmatch('[A-Za-z0-9-]{1,64}',approval.get('runId','')):
        raise SafetyStop('Unsafe run identifier')
    if not isinstance(approval.get('approvedFiles'),dict) or not approval['approvedFiles']:
        raise SafetyStop('Approved source manifest required')
    if not approval.get('databaseIdentity') or not approval.get('migrationOrder'):
        raise SafetyStop('Bound database identity and migration order required')
    if stage == 'B' and approval.get('cleanupScope') != {'containerId':approval.get('containerId'),'volumeName':approval.get('volumeName')}:
        raise SafetyStop('Cleanup scope must name exact approved resources')

def validate_preflight(approval, inspect, now=None):
    """Inspect is captured locally from docker inspect, never from a database URL."""
    now = now or datetime.now(timezone.utc)
    required = {'runId','containerId','imageId','volumeName','approvalId','expiresAt',
                'ownerApproved','destructiveResetApproved','syntheticOnly','schemaHash','fixtureHash'}
    gate = approval.get('review') == 'execution-gate-v1'
    if gate:
        require_stage(approval, approval.get('stage'))
        required.discard('destructiveResetApproved')
    if not required.issubset(approval) or any(approval[k] is not True for k in (('ownerApproved','syntheticOnly') if gate else ('ownerApproved','destructiveResetApproved','syntheticOnly'))):
        raise SafetyStop('Approval incomplete')
    if approval.get('review') == '09':
        extras={'operatorAttestationDigest','ownerApprovalDigest','executionHash','approvedFiles','migrationOrder','databaseIdentity','catalogHash','freshVolumeAttested','schemaApproved','testsApproved','cleanupApproved'}
        if not extras.issubset(approval) or any(approval[k] is not True for k in ('freshVolumeAttested','schemaApproved','testsApproved','cleanupApproved')): raise SafetyStop('Review09 approvals/attestation missing')
        import re
        for key in ('operatorAttestationDigest','ownerApprovalDigest','executionHash','schemaHash','fixtureHash','catalogHash'):
            if not isinstance(approval[key],str) or not re.fullmatch('[0-9a-f]{64}',approval[key]): raise SafetyStop('Invalid approval digest')
        if not isinstance(approval['approvedFiles'],dict) or not approval['approvedFiles']: raise SafetyStop('Approved source manifest required')
        if not re.fullmatch('[A-Za-z0-9-]{1,64}',approval['runId']): raise SafetyStop('Unsafe run identifier')
        for key in ('PidMode','IpcMode'):
            mode=inspect.get('HostConfig',{}).get(key,'')
            if mode in ('host','container') or mode.startswith('container:'): raise SafetyStop('Host namespaces forbidden')
        if inspect.get('HostConfig',{}).get('Devices') or inspect.get('HostConfig',{}).get('CapAdd'): raise SafetyStop('Devices/capability additions forbidden')
    if gate:
        host = inspect.get('HostConfig',{})
        if any(host.get(k,'') == 'host' or host.get(k,'').startswith('container:') for k in ('PidMode','IpcMode')) or host.get('Devices') or host.get('CapAdd'):
            raise SafetyStop('Host namespaces/devices/capabilities forbidden')
    if datetime.fromisoformat(approval['expiresAt'].replace('Z','+00:00')) <= now:
        raise SafetyStop('Approval expired')
    if inspect.get('Id') != approval['containerId'] or inspect.get('Image') != approval['imageId']:
        raise SafetyStop('Immutable container/image mismatch')
    host = inspect.get('HostConfig', {})
    network = inspect.get('NetworkSettings', {})
    if host.get('NetworkMode') != 'none' or host.get('Privileged') or host.get('PortBindings') or network.get('Ports'):
        raise SafetyStop('Network exposure or forwarding forbidden')
    labels = inspect.get('Config', {}).get('Labels', {})
    if labels.get('ph.review08.run') != approval['runId'] or labels.get('ph.review08.disposable') != 'true':
        raise SafetyStop('Run identity mismatch')
    mounts = inspect.get('Mounts', [])
    if len(mounts) != 1 or mounts[0].get('Type') != 'volume' or mounts[0].get('Name') != approval['volumeName']:
        raise SafetyStop('Fresh dedicated volume required; no host binds')
    if (approval.get('review')=='09' or gate) and (mounts[0].get('Destination')!='/var/lib/postgresql/data' or mounts[0].get('RW') is not True): raise SafetyStop('Approved data mount required')
    if inspect.get('State', {}).get('Status') != 'running':
        raise SafetyStop('Fresh running environment required')
    return approval['runId']

def load_local_approval(path):
    p = Path(path).absolute()
    if any(parent.is_symlink() for parent in [p,*p.parents]): raise SafetyStop('Approval symlink forbidden')
    fd=os.open(p,os.O_RDONLY|os.O_NOFOLLOW)
    try:
        import stat
        st=os.fstat(fd)
        if not stat.S_ISREG(st.st_mode) or st.st_mode & 0o077 or st.st_uid!=os.getuid(): raise SafetyStop('Private owner approval file required')
        with os.fdopen(fd,'rb',closefd=False) as stream: body=stream.read()
        approval=json.loads(body)
        if approval.get('review')!='execution-gate-v1' or approval.get('stage') not in ('A','B'): raise SafetyStop('Retired approval format')
        # An operator receives this exact file digest through a separate owner sign-off channel.
        # No self-declared Boolean/file permissions are evidence of external authorization.
        trusted=os.environ.get('PH_EXECUTION_TRUSTED_STAGE_'+approval['stage']+'_SHA256')
        if not trusted or hashlib.sha256(body).hexdigest()!=trusted: raise SafetyStop('Independent approval digest missing/mismatched')
        require_stage(approval,approval['stage'])
        if approval['stage']=='B':
            a_path=os.environ.get('PH_EXECUTION_STAGE_A_FILE')
            if not a_path:raise SafetyStop('Stage A approval linkage required')
            a=load_local_approval(a_path)
            if a['stage']!='A' or approval['stageAApprovalDigest']!=os.environ.get('PH_EXECUTION_TRUSTED_STAGE_A_SHA256'):
                raise SafetyStop('Stage B must bind independently approved Stage A')
            keys=('runId','containerId','imageId','volumeName','databaseIdentity','baseArchiveHash','handoffArchiveHash','schemaHash','fixtureHash','executionHash','approvedFiles','migrationOrder','operatorIdentity','imageDigest')
            if any(approval.get(k)!=a.get(k) for k in keys):raise SafetyStop('Stage identity/source changed; fresh approval/run required')
        return approval
    finally:os.close(fd)

def source_hash(paths):
    h = hashlib.sha256()
    for p in sorted(paths):
        h.update(p.name.encode()); h.update(p.read_bytes())
    return h.hexdigest()