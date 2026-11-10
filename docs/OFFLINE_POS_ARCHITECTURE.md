# Offline POS Architecture — DESIGN ONLY

Status: **architecture proposal**. The application does **not** support
operational offline checkout, and nothing here claims it does. Phone-unit
offline sales, secure seller handoff, uncertain stock allocation and conflict
policies remain restricted until the owner decides and tests verify a real
implementation (see OPEN OD-01/08/09/11/12/13).

## Components

1. **Device session** — a registered terminal identity
   (`device_sessions` table, proposed migration 0006) bound to one store and
   one authenticated user, revocable by SUPER_ADMIN.
2. **IndexedDB outbox** — each terminal keeps a durable local queue of
   signed operation envelopes (`OperationRequest` from
   `src/domain/contracts.ts`), each with a globally unique idempotency key
   generated at the moment of the customer action, not at sync time.
3. **Idempotency** — the server records `idempotency_records`; replays return
   the original transaction without re-applying effects. Network retries are
   therefore safe by construction.
4. **Synchronization** — when connectivity returns, the outbox drains in
   order; each submission lands in `offline_submissions` with state
   PENDING → APPLIED / CONFLICT / REJECTED.
5. **Conflict resolution** — conflicts (stock no longer available, shift
   closed, duplicate identity) create `sync_conflicts` rows. Resolution
   policy (SERVER_WINS / CLIENT_WINS / MANUAL) is **not yet decided** and is
   an owner decision; until then every conflict defaults to MANUAL review.
6. **Recovery** — a terminal that loses state re-registers, replays its
   outbox keys against `idempotency_records` to learn which operations were
   already applied, and rebuilds local state from server reads.

## Hard restrictions until owner decisions

- Serialized phone units are **never** sold offline: availability cannot be
  proven without the server, and double-sale of a unique unit is
  unrecoverable.
- Seller handoff on a shared terminal requires authenticated identity; the
  current M01 attribution draft is not a handoff mechanism.
- Uncertain stock allocations (selling against a stale local balance) are
  disabled; offline basket is view/draft only.
- Cash movements offline are prohibited: drawer integrity requires the
  one-open-shift invariant enforced by the database.

## Verification prerequisites (before any offline claim)

- Real database with migrations 0001–0006 applied in a test environment.
- Automated tests: outbox durability across reload, idempotent replay,
  conflict detection, revocation behavior.
- Owner sign-off on conflict policy and offline scope.
