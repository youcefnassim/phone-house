# Wave 3 — production module UI, portable API source, read models

Start revision: aec2045. Status labels: LOCAL VERIFIED / SYNTHETIC BROWSER / HOSTED NOT RUN.

## Coded

- `src/domain/production-modules.ts`: typed columns, commands and field specs for all 18 routes; exact centime formatting.
- `src/components/erp/native-page.tsx`: per-module server tables (server pagination + escaped search), command forms validated by strict schemas, stable idempotency key, server receipt, unknown-outcome lock + same-key readback, role/store refusal states, owner-only finance panel, settings contract panel.
- `src/components/erp/native-transport.tsx`: transport injection (default disconnected; dev-only labeled SYNTHETIC transport via `localStorage['ph.synthetic-transport']`).
- `src/data/native-repository.ts`: key-bound results, `outcome()`, `finance()`, structured transport errors.
- `src/backend/native-api.ts`: portable Request/Response handler — routes status/read/execute/outcome/finance/document-finalize/replay, POST-only, exact Origin allowlist, JSON content type, bearer-only, 256 KB limit, timeouts, correlation id, sanitized codes. No entrypoint/bindings/deployment.
- `src/backend/sqlite/service.ts`: `session()`, paginated/searchable reads, staged document finalize (size/SHA-256/type/magic → AVAILABLE or QUARANTINED, append-only evidence), offline replay classification (DEVICE_UNKNOWN/REVOKED/EXPIRED, ALREADY_ONLINE, CONFLICT, POLICY_BLOCKED; never final).
- `db/sqlite/0003_documents_offline_replay.sql`.

## Verified

- Vitest: 354/354 (new: 15 API-over-local-SQLite, 30 page tests). LOCAL VERIFIED.
- Browser: 18 production routes × (EN light desktop, AR RTL dark mobile) with SYNTHETIC transport, no page errors or horizontal overflow. SYNTHETIC BROWSER — not hosted evidence.

## Not done / blocked

- POS checkout form in production mode (atomic contract exists server-side; UI not wired).
- Backup/export/restore tooling.
- Hosted Workers/D1/R2, identity provider, hosted concurrency: HOSTED NOT RUN — needs owner-chosen identity provider and an approved external Cloudflare deployment.
- OD-01..OD-18 remain open; affected commands return POLICY_BLOCKED/DRAFT.
