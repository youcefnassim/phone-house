# Offline threat model — design only

Operational offline sales are BLOCKED. Browser/PIN/localStorage identity is untrusted; device session expiry cannot guarantee current stock or cash state. No PWA, service worker or durable transaction outbox has been implemented.

Future risks: credential revocation, shared terminal impersonation, stale last-unit stock, shift close races, replayed payloads, equal-total changed baskets, crash while SYNCING, duplicated central effects and multiple devices racing. Require approved device-bound signed/expiring authorization, revocation/rate limits, allocation/coordination policy, immutable canonical payload hash and stable idempotency keys, IndexedDB crash recovery and auditable server conflict resolution.

PENDING/SYNCING must never display CONFIRMED. 400 invalid payload → BLOCKED; 401/403 → authorization BLOCKED; 409 → CONFLICT; transient transport retry only with original immutable payload/key. Offline snapshot cannot authorize stock integrity. Cash/shift consistency and conflict handling need explicit owner approval before implementation or claims.
