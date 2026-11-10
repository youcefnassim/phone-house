#!/bin/bash
# Usage: create-seller.sh <email-local> <display name>  (local dev server only)
set -eu
B=http://localhost:8787
J=$(mktemp)
p() { curl -s -b "$J" -c "$J" -X POST -H "Origin: $B" -H 'Content-Type: application/json' "$@"; }
T=$(p -d '{"email":"owner@local.test","password":"Proprietaire-Definitif-2026","deviceId":"curl-admin-0001"}' "$B/api/auth/login" | python3 -I -c "import json,sys; print(json.load(sys.stdin)['accessToken'])")
BODY=$(python3 -I -c "import json,sys; print(json.dumps({'email':sys.argv[1]+'@local.test','displayName':sys.argv[2],'role':'SELLER','store':'M01','temporaryPassword':'Provisoire-Magasin-02'}))" "$1" "$2")
p -H "Authorization: Bearer $T" -d "$BODY" "$B/api/auth/admin/accounts"
echo
p -d '{}' "$B/api/auth/logout" > /dev/null
