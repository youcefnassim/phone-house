# Supplier provenance — 7 November 2026

## Implemented

- Optional searchable supplier selector inside phone/accessory intake; compact optional name-only quick-add. Missing supplier is explicit and never blocks receiving. Name matching is NFKC/whitespace/case normalized; duplicates require existing selection.
- Stable supplier ID, intake timestamp/operator and optional incoming document reference on physical phones. Legacy fields remain absent, rendered Not recorded. Phone identity/barcodes remain unchanged.
- Each accessory receiving movement has its own supplier, quantity, store, timestamp, operator and optional original reference. No supplier property is attached to a SKU, and no sold-lot allocation is inferred.
- Owner-only comprehensive provenance details, receipt histories, source search and reason-required append-only reviews. Original phone/receipt source stays unchanged; audit carries actor ID/time/old/new/reason. Names remain available to authorized receivers, without any finance fields.
- New quick-add supplier persistence is suppressed until inventory state is committed so the normal combined workspace/session write includes both. This remains browser-local, not authoritative multi-device posting.
- Additive D1-compatible schema `0005_supplier_provenance.sql`: supplier/phone/receipt/account FKs, scope trigger, immutable source/review rows. Authorized purchase receiving captures a source row in its existing atomic batch. Existing histories are neither rewritten nor backfilled with guesses.
- Inactive injected server provenance service: verified identity + live session/account/global owner membership checks, scoped reads, atomic role recheck, key/payload binding, foreign-key supplier validation and idempotent reviews. No acquisition finance in its projection.

## Evidence

- Full Vitest **472 PASS / 0 FAIL**, 36 files, including prior 463 tests and 9 new provenance/security tests.
- Supplier browser **24 PASS / 0 FAIL**, EN 1440 M01 seller, FR 768 M02 manager, AR RTL 390 M01 second seller: quick-add phone source, receiver hidden history, owner visibility, two suppliers on one accessory SKU, both receipt histories, persistence and overflow/runtime checks.
- Integrated receiving → POS/customer/warranty → cash → invoice/history/reprint browser regression **51 PASS / 0 FAIL** across EN/FR/AR, Light/Dark and M01/M02.
- **75 browser assertions PASS** in isolated synthetic contexts. Screenshots/scripts/logs under `docs/evidence/supplier-provenance/`. Harness build/typecheck OK.
- Early browser attempts used an M01 accessory reference at M02 and did not wait for the operator selection to settle; corrected scripts explicitly choose store and wait/recheck actual operator selection. Final evidence is the last successful run, not those failed attempts.

## Boundaries / NOT RUN

- No owner reset/reseed/deletion, hosted migration, provider connection, deployment, real auth or real data. No Antigravity access or policy changes.
- Native standalone receiving without an authorized purchase and optional name-only supplier quick-add remain unimplemented in the inactive native command API; its existing purchase authorization gate is preserved. New source service is injected source, not an exposed live endpoint.
- Legacy native receipts remain unbackfilled and no source is invented. Production host integration, cross-device races, physical camera/labels/printer and hosted security NOT RUN.
- Comprehensive supplier directory/purchase management remains existing scoped operational source; new intake selector is minimal ID/name only. Finance remains isolated owner projection; browser role preview is not security.
- OD decisions stay open; supplier lot attribution, fiscal issuance and financial policies not invented.
- Git commits are managed by the platform; no manual commit command was run.
