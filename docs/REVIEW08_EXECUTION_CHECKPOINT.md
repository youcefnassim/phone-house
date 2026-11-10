# Review08 isolated execution checkpoint — NOT AUTHORIZED / NOT RUN

No database, container, network, account or migration was created or connected during Review08.
An environment variable or loopback address is NOT approval. The retired Review07 DSN runner cannot activate.

## Separate owner approval record

Before commands below, the owner must approve in writing: the exact Review08 manifest SHA-256; a fresh disposable **networkless** container and new volume; pinned image digest; synthetic SQL identities only; schema execution; exact reset list/catalog hash; bounded test execution; sanitized failure evidence; removal of the container and volume. Record approval ID, operator, date, expiry and run ID outside the repository. No production or Antigravity resources, binds, tunnels, host sockets, credentials or backups may be used. Approval does not resolve OD-01–OD-18 or authorize hosted integration.

An independent operator must inspect the Docker host, verify it is an approved isolated machine with no production/Antigravity forwarding or credentials, attest the volume did not previously exist, and bind actual container ID, image ID, PostgreSQL system identifier, source hashes and expiry to the approval. The harness checks these facts for consistency; it cannot cryptographically prove that an operator is the owner or that a Docker daemon is honest. **Missing attestation is a stop, not permission.**

## Commands for review only — DO NOT EXECUTE YET

Use a separately reviewed PostgreSQL image pinned by digest, already fetched before network removal. The SQL-auth fixture is a minimal PostgreSQL simulation, not a full hosted Auth stack. Variables below contain non-secret approved identifiers; `APPROVAL` is a private, mode-0600 file populated by the independent operator. Never copy DSNs, tokens or passwords into evidence.

```bash
# After approval only, on the separately isolated host:
export RUN_ID=<approved-fresh-run-id>
export CONTAINER=ph-review08-$RUN_ID
export VOLUME=ph-review08-$RUN_ID
export IMAGE=postgres@sha256:<independently-approved-image-digest>
docker volume inspect "$VOLUME" # MUST fail: volume must not already exist
docker volume create "$VOLUME"
docker run -d --name "$CONTAINER" --network none \
  --label ph.review08.run="$RUN_ID" --label ph.review08.disposable=true \
  --mount type=volume,source="$VOLUME",target=/var/lib/postgresql/data \
  -e POSTGRES_HOST_AUTH_METHOD=trust "$IMAGE"
# Trust is allowed only in this networkless disposable container, never operational deployment.
docker exec "$CONTAINER" pg_isready -U postgres
docker exec "$CONTAINER" createdb -U postgres ph_review08_disposable
docker exec -i "$CONTAINER" psql -X -v ON_ERROR_STOP=1 -U postgres -d ph_review08_disposable \
  < tests/integration/review08/local_auth_simulation.sql
docker inspect "$CONTAINER" # operator binds full Id/Image, no network/ports/binds, fresh volume
docker exec "$CONTAINER" psql -X -U postgres -d ph_review08_disposable -At \
  -c 'SELECT current_database(),system_identifier FROM pg_control_system();'
```

The operator must insert `review08_guard.identity.run_id` matching the actual approved run, then confirm `databaseIdentity` in the approval equals `ph_review08_disposable|RUN_ID|SYSTEM_IDENTIFIER`. Use the explicit UUID/run whitelist; do not interpolate arbitrary owner input into SQL. The approval file must bind `schemaHash` and `fixtureHash` as computed by `source_hash()` in `review08_safety.py`. After schema review, independently compute and approve the exact sorted public/private/auth table catalog SHA-256 before resets.

```bash
python3 tests/integration/review08_container_runner.py --approval "$APPROVAL" --phase schema
# Expected: completed, disposable SQL only; first SQL error stops the migration sequence.
# Independently review catalog and update the approval file with catalogHash, then:
python3 tests/integration/review08_container_runner.py --approval "$APPROVAL" --phase reset
# Expected: completed; explicit TRUNCATE list, no CASCADE; no unexpected tables/users.
PH_REVIEW08_APPROVAL_FILE="$APPROVAL" python3 tests/integration/review08_acceptance.py
# Expected target: 16 SQL definitions exercised, no skips; any failure blocks acceptance.
# Current evidence: all 16 NOT RUN. Retired A–T requires migration to this guarded port.
docker rm -f "$CONTAINER"
docker volume rm "$VOLUME"
docker inspect "$CONTAINER" # MUST fail after cleanup
docker volume inspect "$VOLUME" # MUST fail after cleanup
unset RUN_ID CONTAINER VOLUME IMAGE APPROVAL PH_REVIEW08_APPROVAL_FILE
```

No arbitrary automatic fallback to a host DSN or forwarded port is permitted. Abort on approval expiry, stale volume, hash/identity/catalog mismatch, non-synthetic account, exposure or unexpected error. Partial migration sequence requires destruction and fresh reprovisioning, never continue over an unknown schema.

## Evidence and separate hosted gate

The runner suppresses raw SQL failures, arguments and data. Publish only test identifier, evidence class, assertion outcome, sanitized SQLSTATE and non-sensitive count/decimal readback. Keep private credentials and full operator attestations outside exported source. SQL role simulations do not test token validation, signup settings, session revocation, browser field leakage or published Worker behavior. Actual authenticated hosted accounts and Worker end-to-end tests require a **new explicit approval**, not this checkpoint. Production activation remains disabled.
