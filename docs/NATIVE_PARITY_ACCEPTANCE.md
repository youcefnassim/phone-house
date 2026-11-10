# Native parity acceptance — partial completion

## Scope and results

Existing Phonehousev2 only. Owner workspace was not reset, migrated, read or reseeded. Browser checks used fresh isolated Chromium contexts. No Cloud, Supabase, PostgreSQL host, Antigravity, provisioning, credentials, publishing or external identity connection was used.

- Full `bunx vitest run --maxWorkers=3`: **497 PASS, 39 files, 0 FAIL**; previous 472 baseline retained with active-role expectations corrected rather than weakened.
- SQLite: real in-memory execution, atomic rollback, buyer create/reuse, 1/3/6/12 requested months, anonymous Cash/Bank, immutable snapshots, close/review, revoked sessions, obsolete roles, standalone supplier receipts.
- Miniflare/workerd D1: **1 integrated test PASS**, all additive migrations, receipt-trigger late failure rollback, idempotency/hash mismatch, sale/buyer/warranty/cash, close/review, separate A/B accessory receipts and foreign-key check. Compatibility date **2026-08-06**, the installed emulator's latest supported date. This is local emulation, not hosted acceptance.
- Browser: **189 PASS / 0 FAIL**: multilingual integrated workflow 51, distinct buyer/warranty/anonymous/reprint scenarios 74, supplier intake/history 24, staff shared drawer/direct close/owner review 16, launch/navigation/reload 24. FR desktop 1440, AR RTL mobile 390, EN tablet 768; light/dark tested. No dynamic-import or ERP-context blank screen observed.
- Harness build/typecheck: latest observed **build OK**. Harness performed these automatically; no manual build/typecheck command was run.
- `bun run lint`: **FAIL**, 6,990 findings (6,974 errors, 16 warnings): 6,971 formatting errors, three other errors, including existing patterns. No broad formatting rewrite was performed. Static cleanliness is **not accepted**.

## Implemented source

- `src/domain/native-checkout.ts`, `src/backend/sqlite/retail-checkout.ts`: atomic staged buyer plus immutable detailed receipt and each phone's explicit requested draft warranty. Algeria calendar calculations reuse the domain calendar helper. Cash posts once; Bank does not post cash; no approved warranty/official invoice inferred.
- `db/sqlite/0006_checkout_aggregate.sql`: additive customer details, immutable receipt/warranty requests, immutable close snapshots and separate owner review.
- Native command/service roles: reject M01 Manager and M02 Seller, verify account/session in batches, direct shared-drawer close, owner review and staff session revoke. Transfer approval explicitly validates actor role, with distinct-actor schema constraints retained.
- `src/backend/sqlite/d1-port.ts`, `src/backend/worker.ts`: actual standalone Worker module source requiring approved enable flag, exact host/origin, trusted identity config, D1 and external rate-limit binding; absent configuration returns NOT_CONFIGURED. No Wrangler/deployment binding or provider is configured. Private documents remain locked by the Worker.
- `src/domain/native-receiving.ts`, `src/backend/sqlite/standalone-receiving.ts`, `db/sqlite/0007_standalone_receiving.sql`: standalone optional supplier receiving with per-receipt accessory provenance, serial/IMEI phone units, UNKNOWN packaging, atomic quantity and key binding, name-only quick-add and no purchase finance creation. No historical rows are backfilled.
- Native API adds receiving, supplier lookup/source/correction and specimen receipt reads. The inactive browser repository adds key-bound native checkout and rejects unverified finance; no fallback to local records after a remote failure.

## Incomplete parity — do not activate

This is **not complete native ERP parity**. Existing daily forms still run through the safe browser-local workspace; their full typed native form mappings have not been installed. Native inventory/catalog reads lack full barcode/IMEI/accessory-balance POS search projections; sales/cash reads lack the complete date/customer/shift-history detail contracts. Existing buyer legacy-name normalized reuse and supplier Unicode/whitespace dedup need stronger persisted normalized directory keys. Supplier quick-add currently uses SQLite ASCII lower/trim comparison; it is not universal multilingual dedup. Standalone receipts are visible to owner source reads, but their dedicated append-only correction table is not yet exposed through a correction endpoint. Purchase-linked source corrections retain append-only behavior. Read-time authorization should be unified into final projection queries for new receipt/directory endpoints before activation. Exact-role counts constrain provisioning but are not a complete independently verified staff bootstrap.

No live login, hosted D1/R2, cross-device sync, approved offline posting, physical camera/scanner/printer or legal issuance was tested. Migration rollback/down scripts are not supplied: migrations are additive only and were tested on isolated fresh schemas. Existing owner-data upgrade/backup/restore acceptance is NOT RUN. OD-01–OD-18 remain unchanged and unresolved; discount, credit, official invoices/warranties and offline postings remain blocked.

## Evidence and next action

Evidence: `docs/evidence/native-parity/` contains reproducible scripts, results, selected screenshots and full unit/static logs. Initial requested source SHA: `91933383ccab54b730d38ad83a9657cca0689fc3`; latest observed managed HEAD before this report: `bff32b743e09f410ffd108ae7717f5ca6ebbd472` (subsequent documentation edits may advance managed HEAD; no manual commit was created).

First finish the incomplete native form/read/security mappings above; no owner credential is needed for that work. For later hosted implementation, owner must choose the external identity provider and separately authorize the exact Cloudflare account, disposable D1/R2/service resources, origins, migration scope and hosted test scope. Lovable cannot deploy this separate Cloudflare service; an independently approved host/developer must deploy it after these decisions. Authorization does not establish acceptance or activate production automatically.
