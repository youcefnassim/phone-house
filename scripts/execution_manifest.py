"""Offline only: verify extracted approved bytes and produce hash inputs.
Does not approve, connect, compile SQL, provision, reset or test PostgreSQL.
"""
import hashlib
import json
import sys
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'tests/integration'))
from review08_safety import source_hash

def main():
    manifest=json.loads((ROOT/'SOURCE_MANIFEST_SHA256.json').read_text()).get('files')
    if not isinstance(manifest,dict):raise SystemExit('STOP: unsupported manifest shape')
    for name,digest in manifest.items():
        p=ROOT/name
        if p.is_symlink() or not p.resolve().is_relative_to(ROOT) or hashlib.sha256(p.read_bytes()).hexdigest()!=digest:
            raise SystemExit('STOP: source manifest mismatch')
    paths=[ROOT/name for name in manifest]
    print(json.dumps({'approvedFiles':manifest,'executionHash':source_hash(paths),
      'schemaHash':source_hash(list((ROOT/'db/proposed').glob('*.sql'))),
      'fixtureHash':source_hash([ROOT/'tests/integration/review08/fixtures.sql']),
      'migrationOrder':[p.name for p in sorted((ROOT/'db/proposed').glob('*.sql'))]},indent=2))

if __name__=='__main__':main()