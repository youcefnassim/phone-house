# First real PostgreSQL acceptance — BLOCKED / owner authorization required

## Actual environment finding

On 6 November 2026 this Lovable sandbox reports Linux `4.19.0-gvisor`, x86_64. Neither Docker nor Podman is on PATH; `/var/run/docker.sock` is absent; no `DOCKER_HOST` is configured. No independent disposable Docker host, image provenance, volume or database identity can be verified here. No Docker/container/database command was executed. All 37 PostgreSQL scenarios remain **NOT RUN**.

This is an executable handoff to the owner's independent local developer or Claude Code, not a new source-only acceptance milestone. The frontend and production repository bindings are unchanged. No Cloud, hosted service, production or Antigravity access is permitted. All OD-01–OD-18 remain OPEN; unimplemented operational workflows remain blocked even if local SQL acceptance later passes.

## Source identity and mandatory fresh approval

The audited baseline archive is SHA-256 `4d9df1abb63b6eb147c1b5c35280a4c8ae01351433a3ed1cf901268eb1327704`. Its 235 manifest hashes were recomputed here and matched. This corrects the earlier chat's different archive hash; do not authorize that earlier identifier.

The companion execution-gate ZIP binds the unmodified SQL proposals plus the corrected approval runner/evidence tooling. Its own exact archive hash is recorded in the delivered checksum file. **It is not the independently audited baseline archive.** Review the changed execution tooling and approve its new hash before any run. No previous source approval applies automatically. The ZIP's `SOURCE_MANIFEST_SHA256.json` binds each included source file; its own final archive hash lives outside the ZIP.

## Independent operator prerequisites and attestation

Use a dedicated disposable Linux amd64 host/VM, not this sandbox or an existing development/production host. Operator records privately: legal operator identity, owner approval reference/channel, host identity and independent inspection proving no production/Antigravity credentials/resources, no remote Docker context, no unauthorized mounts/agents/forwarding, exclusive operator control, exact image provenance and offline availability, planned resource names and limits, prior resource nonexistence and intended cleanup scope. No credentials belong in evidence or source.

Install Python 3.11+, Docker, Bun matching the lockfile, `sha256sum`, and unzip. Dependencies and pinned image must be obtained on a separately authorized preparation channel, then external connectivity disabled before environment creation. Tests need local Bun/Zod dependencies, not a network service. Docker must use the verified local daemon. The runner does not defend against a malicious host/operator.

Pinned platform image: `postgres@sha256:45cd22f8d32e189d245403954882f88e7a8714301fda80dab6da90f1265b25a3`, PostgreSQL 17.6 linux/amd64. The digest is intended provenance, not a runtime verification from Lovable. Do not fall back to another tag/digest, TCP/host DSN, socket bind or existing volume.

## Stage A — exact owner request (NOT APPROVED)

Owner explicitly signs: exact baseline and execution-gate ZIP hashes and manifests; named independent operator/host; pinned image; one NEW run-labelled local volume and container; network `none`, no ports/binds/devices/additional capabilities/shared namespaces, 2 CPUs/2 GiB; creation of database `ph_review08_disposable`; local SQL-only auth-role scaffolding and run-identity marker; migrations 0001–0012 strictly in order; read-only identity/version/structural/ACL evidence. Stage A **excludes fixture rows/reset, all acceptance tests, destruction, operational accounts and backend activation**.

The initial signed Stage A scope permits creation, before immutable IDs exist. Operator then binds actual IDs/readbacks into the private Stage A JSON and obtains independent owner confirmation of its exact SHA-256 under that same scope. This is not permission to enlarge scope. No runner schema execution until that confirmation. Both the original owner document digest (`ownerApprovalDigest`) and operator attestation digest are recorded.

Before approval, only offline archive verification and predicate tests may run:

```bash
sha256sum phone-house-postgresql-execution-gate.zip
# Compare with independently owner-confirmed checksum; inspect entries before extraction.
# Extract into a NEW clean directory, never onto another repository.
python3 scripts/execution_manifest.py > /private/source-hash-inputs.json
python3 -m unittest discover -s tests/integration -p 'test_*safety.py' -v
# Under separately authorized dependency preparation only:
bun install --frozen-lockfile
```

### Stage A creation commands — operator runs ONLY after signed creation scope

Execute one command at a time and inspect its result. Replace bracketed values with owner-approved values, never shell text from a document or page. No automatic retries/reuse/delete. If daemon inspection fails, STOP.

```bash
export RUN_ID='<owner-approved-alphanumeric-hyphen-id>'
export CONTAINER="ph-acceptance-$RUN_ID" VOLUME="ph-acceptance-$RUN_ID"
export IMAGE='postgres@sha256:45cd22f8d32e189d245403954882f88e7a8714301fda80dab6da90f1265b25a3'
docker context show
docker info
docker image inspect "$IMAGE"
docker ps -a --no-trunc --format '{{.Names}}'
docker volume ls --format '{{.Name}}'
# Independent operator proves exact names absent, correct local daemon/image/host.
docker volume create --label "ph.review09.run=$RUN_ID" "$VOLUME"
docker run -d --name "$CONTAINER" --network none --cpus 2 --memory 2g \
 --label "ph.review08.run=$RUN_ID" --label ph.review08.disposable=true \
 --mount "type=volume,source=$VOLUME,target=/var/lib/postgresql/data" \
 -e POSTGRES_HOST_AUTH_METHOD=trust "$IMAGE"
docker inspect "$CONTAINER"
docker volume inspect "$VOLUME"
docker ps -aq --no-trunc --filter "volume=$VOLUME"
docker exec "$CONTAINER" /usr/lib/postgresql/17/bin/pg_isready -h /var/run/postgresql -U postgres
docker exec "$CONTAINER" env -i PATH=/usr/bin:/bin /usr/lib/postgresql/17/bin/psql -h /var/run/postgresql -X -At -U postgres -c 'SHOW server_version;'
# Must show 17.6, correct IDs, one fresh local volume/consumer and zero exposure.
docker exec "$CONTAINER" env -i PATH=/usr/bin:/bin /usr/lib/postgresql/17/bin/createdb -h /var/run/postgresql -U postgres ph_review08_disposable
docker exec -i "$CONTAINER" env -i PATH=/usr/bin:/bin /usr/lib/postgresql/17/bin/psql -h /var/run/postgresql -X -v ON_ERROR_STOP=1 -U postgres -d ph_review08_disposable < tests/integration/review08/local_auth_simulation.sql
printf "INSERT INTO review08_guard.identity(run_id) VALUES (:'run_id');\n" | docker exec -i "$CONTAINER" env -i PATH=/usr/bin:/bin /usr/lib/postgresql/17/bin/psql -h /var/run/postgresql -X -v ON_ERROR_STOP=1 -v "run_id=$RUN_ID" -U postgres -d ph_review08_disposable
docker exec "$CONTAINER" env -i PATH=/usr/bin:/bin /usr/lib/postgresql/17/bin/psql -h /var/run/postgresql -X -At -U postgres -d ph_review08_disposable -c "SELECT current_database()||'|'||run_id||'|'||system_identifier FROM review08_guard.identity CROSS JOIN pg_control_system();"
```

Socket-only trust is strictly confined to this synthetic networkless disposable instance; never deploy it. Creation initializes PostgreSQL's internal administrator only; scaffolding creates NOLOGIN roles, no operational identities/users. Do not apply fixtures in Stage A.

### Private Stage A record

Create `/private/stage-a.json`, mode 0600, no symlinks, owned by operator. Supply `review:"execution-gate-v1"`, `stage:"A"`, `approvalId`, timezone-aware future `expiresAt`, actual `runId`, `containerId`, `imageId` (Docker immutable ID), `volumeName`, `databaseIdentity`, `operatorIdentity`, `imageDigest`, `baseArchiveHash`, `handoffArchiveHash`, `ownerApprovalDigest`, `operatorAttestationDigest`; merge exact `approvedFiles`, `executionHash`, `schemaHash`, `fixtureHash`, `migrationOrder` from the offline manifest command. Set `ownerApproved`, `syntheticOnly`, `freshVolumeAttested`, `schemaApproved` true **only after external sign-off**; set `testsApproved`, `destructiveResetApproved`, `cleanupApproved` false. Do not fabricate identity/digests/attestation.

After independent owner confirmation of these exact file bytes:

```bash
export PH_EXECUTION_STAGE_A_FILE=/private/stage-a.json
export PH_EXECUTION_TRUSTED_STAGE_A_SHA256='<owner-confirmed-stage-a-file-sha256>'
python3 tests/integration/review08_container_runner.py --approval "$PH_EXECUTION_STAGE_A_FILE" --phase schema
# STOP immediately on any unexpected error. No reset, no next migration after failure.
python3 tests/integration/review08_container_runner.py --approval "$PH_EXECUTION_STAGE_A_FILE" --phase evidence --output /private/structure-before.json
```

## Stage B — inspected structure and separate owner approval (NOT APPROVED)

Independently inspect `structure-before.json`: all columns/types/defaults; PK/FK/unique/check/exclusion constraints; index predicates; internal/user triggers; full function definitions, owners, SECURITY DEFINER/search_path; RLS/force-RLS/policies; roles/memberships; raw/default ACLs; effective schema/table/column/sequence permissions and function EXECUTE including PUBLIC. Specifically inspect phone identity uniqueness/immutability, active sale ownership, capped purchase receipt provenance, cash/shift/race guards, store-bound roles, private finance, idempotency, journal balance, cumulative repayment/refund safeguards. Evidence is metadata, not data/credentials. An evidence hash is **not** an independent correctness certificate. SQL compilation and this query itself remain unverified until Stage A execution.

Fingerprint encoding: parsed JSON, sorted keys, separators `,` and `:`, UTF-8 without ASCII escaping, trailing LF; SHA-256 over those bytes. Object arrays ordered by documented catalog key. Table-name-only `catalogHash` is retired. Schema/ACL mismatch before any reset or after the suite means STOP/FAIL.

Owner separately signs actual structure/hash, unchanged archive/source/operator/container/image/database identities, eight synthetic UUID identities, fixture reset before each of 37 cases, inspected ACL/RLS readbacks, concurrency/state evidence and exact container/volume destruction. Stage B JSON copies identity/source fields from Stage A, uses `stage:"B"`, new approval/expiry/document digest; binds `stageAApprovalDigest` to the externally confirmed Stage A file hash and `structureHash` to the approved canonical structure; sets `structureReviewed`, `testsApproved`, `destructiveResetApproved`, `cleanupApproved` true only after this sign-off. `cleanupScope` must be exactly `{ "containerId": "<actual ID>", "volumeName": "<actual volume>" }`.

```bash
export STAGE_B=/private/stage-b.json
export PH_EXECUTION_TRUSTED_STAGE_B_SHA256='<separately-owner-confirmed-stage-b-file-sha256>'
PH_REVIEW08_APPROVAL_FILE="$STAGE_B" python3 tests/integration/review09_acceptance.py > /private/acceptance-events.log 2>&1
# Inspect exit status immediately; PASS requires exactly 37 executed, zero skips/errors/failures.
# This command is fail-fast; SQLSTATE mismatches/infrastructure errors are never passing denials.
# Run post-structure evidence only if environment remains safely inspectable; never continue tests.
python3 tests/integration/review08_container_runner.py --approval "$STAGE_B" --phase evidence --output /private/structure-after.json
sha256sum /private/structure-before.json /private/structure-after.json
# Both must equal Stage B structureHash. Owner/operator independently review evidence.
python3 tests/integration/review08_container_runner.py --approval "$STAGE_B" --phase cleanup
```

Runner verifies trusted Stage A/B file digests separately, source/identity linkage and full structure before every reset and after the suite. Ordinary SQL/fixture/transaction state changes do not alter structural metadata. Preserve case IDs, exact SQLSTATE, committed result hashes, full ordered row-state oracle hashes/counts, numeric readbacks, two-session race outcomes, journal assertions, pre/post structure and cleanup absence evidence. Keep private approval documents and raw errors out of published evidence. Unexpected migration failures expose sanitized SQLSTATE/file only; if diagnostics are insufficient, report that blocker and obtain a separately reviewed diagnostic plan, never weaken SQL/grants.

### Failures and destruction

Stage A does not authorize deletion. If creation/schema fails before Stage B, STOP and request a separate explicit **cleanup-only Stage B scope** for the exact verified residual resources; an authorized operator performs removal and independently records absence. Do not invent tests/structure approval to obtain a normal Stage B runner record. If normal Stage B cleanup preflight fails, stop automatic cleanup and obtain an independently verified operator cleanup authorization; never widen names/scope or touch other volumes. No later run until residual resources are accounted for. Source repairs require new hashes, new approvals and a fresh disposable environment. No automatic destructive `finally`, mock substitution, skips-as-PASS or permissive database edits.

## Current evidence and next responsible action

30 offline authorization/protocol predicate tests passed here; they do not prove PostgreSQL isolation, ACLs, concurrency or compilation. Unapproved acceptance reported 37 skipped/NOT RUN and exit code 1, never PASS. The structural evidence query passed top-level static parsing only, not PostgreSQL compilation. Every existing frontend source file and all 12 SQL proposals match the audited baseline bytes. The responsible next action is an independent developer/operator host attestation and owner-signed Stage A creation scope. **No authorization has been supplied for either stage; no database tests were executed.**
