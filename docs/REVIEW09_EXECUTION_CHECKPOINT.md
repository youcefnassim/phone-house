# Review09 exact isolated execution checkpoint — STOP / NOT AUTHORIZED

**SUPERSEDED FOR EXECUTION:** use `FIRST_REAL_POSTGRESQL_HANDOFF.md`. The historical sequencing and table-name fingerprint below are not an executable authorization path. New execution-gate tooling requires freshly reviewed archive hashes, independently confirmed Stage A and identity-linked Stage B; no stage is approved.

Review09 permits source work only. **Do not run the following commands until the owner separately approves the exact delivered ZIP SHA-256, source manifest, image, resources, operator and scope.** The external Review09 report contains the final ZIP SHA-256 (a ZIP cannot contain its own final hash).

## Resources and fixed environment

- One disposable Linux amd64 Docker host independently attested free of production/Antigravity data, credentials, agents, forwarding and mounts. No workspace backend or Cloud connection.
- PostgreSQL **17.6**, Debian bookworm; image tag `postgres:17.6-bookworm`.
- Registry index digest resolved via registry metadata on 2026-11-06: `sha256:f3bd19c606e442c3d7bdfa8002e03fe260a1023351e0ea4598032022b68dd6e3`.
- Approved platform image: `postgres@sha256:45cd22f8d32e189d245403954882f88e7a8714301fda80dab6da90f1265b25a3` (linux/amd64). Metadata resolution is not image execution or runtime verification. Operator verifies image signature/provenance/version before use; any differing image requires fresh approval.
- One new run-labelled local volume; zero bind mounts, sockets, forwarded ports, networks, external volumes, extra devices/capabilities or shared host/container namespaces. One approved consumer only.
- Database `ph_review08_disposable`; retained name identifies the guarded path, not the review version.
- Socket `/var/run/postgresql`, port 5432, client `/usr/lib/postgresql/17/bin/psql`, scrubbed libpq environment. Version/path must be attested on the approved image; mismatch means STOP, not fallback.
- Limits: container 2 CPUs / 2 GiB; SQL statement 30s, lock 10s, idle transaction 30s, subprocess 120s, test race barrier 10s. Schema first, fixture reset between cases, 37 cases; no continuous service.

## Two authorization stages, neither granted

1. Owner signs exact archive/source hashes, pinned image, independent operator identity, fresh volume creation, schema order, synthetic SQL identities, explicit resets, test scope, sanitized evidence and destruction. Operator verifies this sign-off through a separate trusted channel, not a JSON Boolean.
2. After approved creation/schema compilation, operator binds immutable container/image ID, volume creation inspection, PostgreSQL system identifier, exact table catalog hash and approved execution-file map into a private mode-0600 approval record. The owner independently signs off that final identity-bound record; its SHA-256 is supplied through the separately trusted operator channel. No reset/test before that confirmation. Catalog fingerprint is names only; independently review columns/FKs/triggers/ACLs and retain their sanitized structural dumps. A hostile Docker host remains outside the harness threat model.

Approval JSON fields: `review:"09"`, `runId`, `approvalId`, `ownerApproved`, `destructiveResetApproved`, `syntheticOnly`, `schemaApproved`, `testsApproved`, `cleanupApproved`, `freshVolumeAttested` (all true only after sign-off), timezone-aware `expiresAt`, `containerId`, `imageId`, `volumeName`, `databaseIdentity`, `catalogHash` (independently approved expected table catalog before schema; actual catalog must match afterward), `schemaHash`, `fixtureHash`, `executionHash`, `approvedFiles` (relative file → SHA-256), `migrationOrder`, `ownerApprovalDigest`, `operatorAttestationDigest`. All digest fields are 64 lowercase hexadecimal characters. Private approval/attestation documents stay outside source/ZIP/chat.

`approvedFiles` must bind all migrations, fixtures/auth simulation, both acceptance modules, runner/safety, DTO validator, domain production schemas and dependencies, package lock, and offline safety tests. Use `source_hash()` for combined hashes; its filename+bytes algorithm is not the ZIP manifest algorithm. The full per-file SHA-256 map provides independent identity. Do not edit approved files after approval.

## Exact commands for owner review — NOT RUN

All commands below run only on the separately approved disposable host. RUN_ID is an operator-generated alphanumeric/hyphen identifier, not arbitrary owner text. Image can be fetched only under the separate environment provisioning approval; fetching does not authorize execution.

```bash
export RUN_ID=<approved-new-run-id>
export CONTAINER=ph-review09-$RUN_ID
export VOLUME=ph-review09-$RUN_ID
export IMAGE=postgres@sha256:45cd22f8d32e189d245403954882f88e7a8714301fda80dab6da90f1265b25a3
# Must report not found; independently record prior nonexistence before creating.
docker volume inspect "$VOLUME"
# STOP if the prior command succeeds. Do not script an automatic replacement.
docker volume create --label ph.review09.run="$RUN_ID" "$VOLUME"
docker run -d --name "$CONTAINER" --network none --cpus 2 --memory 2g \
  --label ph.review08.run="$RUN_ID" --label ph.review08.disposable=true \
  --mount type=volume,source="$VOLUME",target=/var/lib/postgresql/data \
  -e POSTGRES_HOST_AUTH_METHOD=trust "$IMAGE"
# Trust only inside this zero-network disposable test instance, never deployment.
docker exec "$CONTAINER" /usr/lib/postgresql/17/bin/pg_isready -h /var/run/postgresql -U postgres
# Independent operator checks readiness and PostgreSQL 17.6 version, immutable IDs,
# local fresh volume, no other consumers, no namespace sharing/ports/binds.
docker exec "$CONTAINER" env -i PATH=/usr/bin:/bin /usr/lib/postgresql/17/bin/createdb -h /var/run/postgresql -U postgres ph_review08_disposable
docker exec -i "$CONTAINER" env -i PATH=/usr/bin:/bin /usr/lib/postgresql/17/bin/psql -h /var/run/postgresql -X -v ON_ERROR_STOP=1 -U postgres -d ph_review08_disposable < tests/integration/review08/local_auth_simulation.sql
# Insert exact approved run ID once using a psql literal, never raw string interpolation.
printf "INSERT INTO review08_guard.identity(run_id) VALUES (:'run_id');\n" | docker exec -i "$CONTAINER" env -i PATH=/usr/bin:/bin /usr/lib/postgresql/17/bin/psql -h /var/run/postgresql -X -v ON_ERROR_STOP=1 -v run_id="$RUN_ID" -U postgres -d ph_review08_disposable
# Operator records identity = database|runId|system_identifier and signs final approval.
export APPROVAL=<private-mode-0600-identity-bound-approval-file>
export PH_REVIEW09_TRUSTED_APPROVAL_SHA256=<independently-owner-confirmed-file-sha256>
python3 tests/integration/review08_container_runner.py --approval "$APPROVAL" --phase schema
# STOP on first migration error; preserve sanitized SQLSTATE/location evidence.
# After schema compilation, independently approve actual catalogHash/ACL structural readback
# and re-confirm the final approval-file digest; no reset before this second sign-off.
PH_REVIEW08_APPROVAL_FILE="$APPROVAL" python3 tests/integration/review09_acceptance.py
# Runs 36 A–AJ plus SQL DTO parity once; guarded reset before each, serialized suite lock.
# 37 PASS expected only after actual execution; current evidence is 37 NOT RUN/skipped.
docker rm -f "$CONTAINER"
docker volume rm "$VOLUME"
docker inspect "$CONTAINER"
docker volume inspect "$VOLUME"
# Both final inspections must fail specifically because resources do not exist.
# Independently list run-labelled containers/volumes and confirm none remain.
unset RUN_ID CONTAINER VOLUME IMAGE APPROVAL PH_REVIEW08_APPROVAL_FILE PH_REVIEW09_TRUSTED_APPROVAL_SHA256
```

Fresh migration order: 0001 core → 0002 inventory → 0003 sales/cash → 0004 purchases → 0005 facilities/transfers/SAV → 0006 audit → 0007 commands → 0008 guards → 0009 reads/provisioning → 0010 posting integrity → 0011 physical/provenance → 0012 boundaries/reads. Each source file has a transaction. Failure destroys the disposable resources after evidence; source repair then needs owner approval of new hashes and a new fresh environment. Never loosen policies/grants or continue on partially applied schema.

Fixture source defines eight SQL-only UUID identities: global owner 1; M01 manager/seller 2/3; M02 manager/seller 4/5; unassigned 6; M02 manager + M01 seller 7; inactive M01 manager 8. IDs use `00000000-0000-4000-8000-00000000000n`. No passwords, HTTP/Auth accounts, real persons or operational data. Synthetic brands/model/variant/SKU, M01 supplier, capped ten-unit purchases, approved test selling prices 100.01 / 20.00, unknown purchase costs NULL. Synthetic authorization rows are oracle setup, not approved procurement policy.

Concurrent tests launch two independent container-exec SQL sessions, barrier synchronized, distinct keys unless replay is being tested. Rejection must match exact SQLSTATE and full ordered row oracle; infrastructure SafetyStop never counts as a business denial. Per-journal debit/credit and transaction provenance are read independently. Privileged facility/refund/transfer setups test constraints only, not operational workflows.

## Evidence, failures and cleanup

Publish only test ID, evidence class, PASS/FAIL/SKIP, sanitized SQLSTATE, assertion name, safe synthetic counts/decimal readback, source/image hashes and destruction verdict. Do not publish raw SQL errors, credentials, private approval contents or real records. Current runner suppresses raw migration errors; operator must capture sanitized file/statement location plus SQLSTATE through a separately reviewed diagnostic process. If that evidence cannot be safely preserved, stop and report the diagnostic blocker.

Cleanup runs even after failure, by the authorized operator; no cleanup on unrelated names. Record immutable container/volume IDs, explicit removal success and independent post-removal absence. If cleanup fails, report residual-resource blocker and do not create another test run. No automatic host-DSN/port fallback, account creation, Cloud activation, hosted token acceptance, production adapter activation or real posting is authorized. SQL simulations are not hosted Auth/Worker/financial/hardware/offline certification.
