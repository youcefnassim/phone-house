"""REVIEW ONLY. NOT RUN. Networkless container exec, never host DSN/libpq.
Only after owner approval: --phase schema or --phase reset. No automatic creation.
Database role simulations are not hosted Auth acceptance.
"""
import argparse
import json
import subprocess
import re
import os
from contextlib import contextmanager
import fcntl
from pathlib import Path
from review08_safety import load_local_approval, validate_preflight, source_hash, SafetyStop, require_stage

ROOT=Path(__file__).resolve().parents[2]

class DatabaseRejected(RuntimeError):
    def __init__(self, sqlstate):
        self.sqlstate = sqlstate
        super().__init__('Database rejected: '+sqlstate)

PSQL = ['env','-i','PATH=/usr/local/bin:/usr/bin:/bin','/usr/lib/postgresql/17/bin/psql','-h','/var/run/postgresql','-p','5432','-X','-q','-v','ON_ERROR_STOP=1','-U','postgres','-d','ph_review08_disposable','-At']

@contextmanager
def suite_lock(a):
    # One owner/operator per run; lock held across reset and every test.
    lock = Path('/tmp') / ('ph-acceptance-'+a['runId']+'.lock')
    fd = os.open(lock, os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    try:
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        yield
    finally:
        os.close(fd)

def docker(*args, input=None):
    result=subprocess.run(['docker',*args],input=input,text=True,capture_output=True,timeout=120)
    if result.returncode:
        # Never include command, credentials, SQL error text or fixture values in evidence.
        raise SafetyStop('Container action failed; raw failure output suppressed')
    return result.stdout

def preflight(a):
    metadata=json.loads(docker('inspect',a['containerId']))
    if len(metadata)!=1:raise SafetyStop('Ambiguous container identity')
    validate_preflight(a,metadata[0])
    if source_hash(list((ROOT/'db/proposed').glob('*.sql')))!=a['schemaHash']:
        raise SafetyStop('Unapproved schema changes')
    if source_hash([ROOT/'tests/integration/review08/fixtures.sql'])!=a['fixtureHash']:
        raise SafetyStop('Unapproved fixture changes')
    required={'tests/integration/review08_container_runner.py','tests/integration/review08_safety.py','tests/integration/structural_evidence.sql','tests/integration/review08/local_auth_simulation.sql','tests/integration/review08_acceptance.py','tests/integration/review09_acceptance.py','scripts/validate-production-reads.ts','tests/integration/review08/fixtures.sql',*[str(p.relative_to(ROOT)) for p in (ROOT/'db/proposed').glob('*.sql')],*[str(p.relative_to(ROOT)) for p in (ROOT/'src/domain').rglob('*.ts')],'package.json','bun.lock'}
    if not required.issubset(a['approvedFiles']): raise SafetyStop('Incomplete execution manifest')
    import hashlib
    for name,digest in a['approvedFiles'].items():
        p=(ROOT/name).resolve()
        if not p.is_relative_to(ROOT) or hashlib.sha256(p.read_bytes()).hexdigest()!=digest: raise SafetyStop('Individual source digest mismatch')
    paths = [ROOT / name for name in a['approvedFiles']]
    if any(not p.is_relative_to(ROOT) or p.is_symlink() for p in paths) or source_hash(paths) != a['executionHash']:
        raise SafetyStop('Unapproved runner/test/source bytes')
    volume=json.loads(docker('volume','inspect',a['volumeName']))
    if len(volume)!=1 or volume[0].get('Driver')!='local' or volume[0].get('Options') or volume[0].get('Labels',{}).get('ph.review09.run')!=a['runId']:
        raise SafetyStop('Unapproved volume identity/options')
    consumers=docker('ps','-aq','--no-trunc','--filter','volume='+a['volumeName']).splitlines()
    if consumers != [a['containerId']]: raise SafetyStop('Volume must have one approved consumer')
    image=json.loads(docker('image','inspect',a['imageId']))
    if len(image)!=1 or image[0].get('Architecture')!='amd64' or image[0].get('Os')!='linux' or not any(x.endswith('@'+a['imageDigest']) for x in image[0].get('RepoDigests',[])):
        raise SafetyStop('Pinned platform image identity mismatch')

def client(a,text, capture_protocol=False):
    preflight(a)
    identity=docker('exec','-i',a['containerId'],*PSQL,
        input="SELECT current_database()||'|'||run_id||'|'||system_identifier FROM review08_guard.identity CROSS JOIN pg_control_system();").strip()
    if identity!=a.get('databaseIdentity'): raise SafetyStop('Database identity mismatch')
    bounded="SET statement_timeout='30s'; SET lock_timeout='10s'; SET idle_in_transaction_session_timeout='30s';\n"+text
    r=subprocess.run(['docker','exec','-i',a['containerId'],*PSQL],input=bounded,text=True,capture_output=True,timeout=120)
    if r.returncode:
        states=re.findall(r'(?:ERROR|FATAL):\s+([0-9A-Z]{5}):',r.stderr)
        state=states[0] if len(states)==1 else 'UNAVAILABLE'
        raise SafetyStop('Container/SQL failure; SQLSTATE='+state+'; raw output suppressed')
    return r.stderr if capture_protocol else r.stdout

def sql(a,text):
    return client(a,text)

def checked_sql(a, statement, user=None, role='authenticated', returns_json=False):
    """Controlled SQLSTATE protocol; business rejections never become SafetyStop passes.
    Nested subtransaction rolls back failed statements and deferred effects.
    SQL is trusted acceptance source, never user input.
    """
    import uuid
    if user is not None and (not isinstance(user,int) or not 1<=user<=8): raise SafetyStop('Unknown synthetic user')
    if role not in ('authenticated','anon'): raise SafetyStop('Unapproved role')
    tag='s'+uuid.uuid4().hex
    context='' if user is None else f"PERFORM set_config('request.jwt.claim.sub','00000000-0000-4000-8000-{user:012d}',true); EXECUTE 'SET LOCAL ROLE {role}';"
    target=' INTO result' if returns_json else ''
    script=f"""BEGIN;
DO $guard$ DECLARE result jsonb; BEGIN
 BEGIN
  {context}
  EXECUTE ${tag}${statement}${tag}${target};
  SET CONSTRAINTS ALL IMMEDIATE;
  RAISE NOTICE 'PH_RESULT:%',COALESCE(result,'null'::jsonb);
 EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'PH_REJECTED:%',SQLSTATE;
 END;
END $guard$;
COMMIT;"""
    output=client(a,script,True)
    markers=re.findall(r'^NOTICE:  PH_(RESULT|REJECTED):(.*)$',output,re.M)
    if len(markers)!=1: raise SafetyStop('Invalid database protocol')
    kind,value=markers[0]
    if kind=='REJECTED':
        if not re.fullmatch('[0-9A-Z]{5}',value): raise SafetyStop('Invalid SQLSTATE protocol')
        if a.get('review')=='execution-gate-v1':print(json.dumps({'event':'sql','sqlstate':value,'status':'REJECTED'}))
        raise DatabaseRejected(value)
    try:
        result=json.loads(value)
        if a.get('review')=='execution-gate-v1':
            import hashlib
            print(json.dumps({'event':'sql','sqlstate':'00000','status':'COMMITTED','resultHash':hashlib.sha256(value.encode()).hexdigest()}))
        return result
    except ValueError: raise SafetyStop('Invalid result protocol') from None


def reset_fixture(a):
    require_stage(a,'B')
    preflight(a)
    verify_structure(a)
    users=sql(a,"SELECT count(*) FROM auth.users WHERE id NOT IN (SELECT ('00000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid FROM generate_series(1,8)i);").strip()
    if users!='0':raise SafetyStop('Non-synthetic identity found')
    body=(ROOT/'tests/integration/review08/fixtures.sql').read_bytes()
    import hashlib
    if hashlib.sha256(body).hexdigest()!=a['approvedFiles']['tests/integration/review08/fixtures.sql']: raise SafetyStop('Fixture buffer changed')
    guarded=body.decode().replace('BEGIN;',f"BEGIN; SELECT pg_advisory_xact_lock(hashtextextended('review09-fixture-reset',0)); DO $identity$ BEGIN IF current_database()<>'ph_review08_disposable' OR NOT EXISTS(SELECT 1 FROM review08_guard.identity WHERE run_id='{a['runId']}') THEN RAISE EXCEPTION 'Reset identity mismatch'; END IF; END $identity$;",1)
    sql(a,guarded)

def structure(a):
    import hashlib
    p=ROOT/'tests/integration/structural_evidence.sql'
    body=p.read_bytes()
    if hashlib.sha256(body).hexdigest()!=a['approvedFiles'].get(str(p.relative_to(ROOT))):
        raise SafetyStop('Unapproved evidence source')
    data=json.loads(sql(a,body.decode()))
    # UTF-8, sorted object keys, no whitespace, no ASCII escaping, trailing LF.
    canonical=json.dumps(data,sort_keys=True,separators=(',',':'),ensure_ascii=False)+'\n'
    return canonical,hashlib.sha256(canonical.encode()).hexdigest()

def verify_structure(a):
    require_stage(a,'B')
    _,digest=structure(a)
    if digest!=a['structureHash']:raise SafetyStop('Approved structural/ACL evidence mismatch')

def capture_structure(a,destination):
    canonical,digest=structure(a)
    with open(destination,'x',encoding='utf-8') as stream:stream.write(canonical)
    print(json.dumps({'evidenceClass':'disposable structural SQL only','structureHash':digest}))

def run_phase(a,phase):
    require_stage(a,'A' if phase=='schema' else 'B')
    preflight(a)
    # Identity check inside the isolated server. Marker created only during approved provisioning.
    identity=sql(a,"SELECT current_database()||'|'||run_id||'|'||system_identifier FROM review08_guard.identity CROSS JOIN pg_control_system();").strip()
    if identity!=a.get('databaseIdentity'):raise SafetyStop('Confirmed database identity mismatch')
    if phase=='schema':
        objects=sql(a,"SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','private') AND c.relkind IN ('r','p');").strip()
        if objects!='0':raise SafetyStop('Schema phase requires a fresh empty business catalog')
        buffers=[(p,p.read_bytes()) for p in sorted((ROOT/'db/proposed').glob('*.sql'))]
        if [p.name for p,_ in buffers] != a['migrationOrder']: raise SafetyStop('Migration order mismatch')
        for p,body in buffers:
            import hashlib
            if hashlib.sha256(body).hexdigest()!=a['approvedFiles']['db/proposed/'+p.name]: raise SafetyStop('Source buffer changed')
            try:sql(a,"\\set VERBOSITY verbose\n"+body.decode())
            except SafetyStop as error:
                raise SafetyStop('Migration '+p.name+' stopped: '+str(error)) from None
    else:
        reset_fixture(a)
    print(json.dumps({'phase':phase,'status':'completed','evidenceClass':'disposable SQL only'}))

def cleanup(a):
    require_stage(a,'B')
    preflight(a)
    # Deliberate operator-only action, never invoked in finally or on another name.
    docker('rm','-f',a['containerId'])
    docker('volume','rm',a['volumeName'])
    containers=docker('ps','-aq','--no-trunc').splitlines()
    volumes=docker('volume','ls','--format','{{.Name}}').splitlines()
    labelled_containers=docker('ps','-aq','--filter','label=ph.review08.run='+a['runId']).splitlines()
    labelled_volumes=docker('volume','ls','-q','--filter','label=ph.review09.run='+a['runId']).splitlines()
    if a['containerId'] in containers or a['volumeName'] in volumes or labelled_containers or labelled_volumes:
        raise SafetyStop('Residual resource blocker')
    print(json.dumps({'phase':'cleanup','containerAbsent':True,'volumeAbsent':True,'runLabelsAbsent':True}))

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--approval',required=True);parser.add_argument('--phase',choices=['schema','reset','evidence','cleanup'],required=True);parser.add_argument('--output')
    args=parser.parse_args();a=load_local_approval(args.approval)
    with suite_lock(a):
        if args.phase=='evidence':
            if not args.output:raise SafetyStop('Evidence destination required')
            capture_structure(a,args.output)
        elif args.phase=='cleanup':cleanup(a)
        else:run_phase(a,args.phase)

if __name__=='__main__':
    try:main()
    except SafetyStop as error:
        print(json.dumps({'status':'STOPPED','reason':str(error)}));raise SystemExit(1)
    except Exception:
        print('{"status":"STOPPED","reason":"unexpected infrastructure failure; raw output suppressed"}');raise SystemExit(1)