# Native implementation wave — 6 November 2026

Starting revision confirmed: `6d4145b38391ad88973800c7d6fe47c661a091b3`.

## Implemented in code / locally executed

`0002_command_integrity.sql` adds sessions/revocation, global serial uniqueness, purchase receipt cap/provenance, immutable stock/audit/SAV/receiving records, blind cash counts, transfer dispatch/receipt provenance, document integrity and policy-blocked evidence/reviews. Historical PostgreSQL files unchanged.

Strict versioned native commands and one reusable atomic-batch planner now implement:

- customer/supplier save/edit; catalog/SKU/attributes; owner-set store price;
- purchase drafts/edit and private nullable costs; receipt ONLY from already authorized evidence-bearing purchase, with cap, accessory balances, ledger, serialized units, global cross-slot IMEI uniqueness and serial/barcode constraints;
- attributable cash open/close, one open drawer shift, blind count/expected/discrepancy evidence; IN/OUT evidence only, not unauthorized cash posting;
- sale-linked debt drafts and capped repayment drafts; no credit issuance/collection invented;
- transfer creation, distinct current Super Admin/M02 Manager approvals, exact whole-line scans, source stock revalidation, atomic dispatch to IN_TRANSIT, fresh destination scans, distinct receiving actor, atomic all-or-nothing receipt and no double receipt;
- M01 explicit exact installment drafts, salary deduction and bank evidence separate from cash;
- original sale/customer/IMEI SAV case, append-only events, blocked refund reviews with no restock/release;
- expense drafts; owner-only account records/protected store roles and session revocation, no fabricated identity credentials;
- owner-only private document registration with MIME/size/hash, safe object key, content signature and injected object storage. Upload remains PENDING, never available prematurely.

Each command binds operation/payload hash/store/actor to its immutable key, checks active session/account/current roles in the batch, writes audit and stored response atomically and replays exact response. Receipt/stock/cash/transfer state guards fail by CHECK constraints; no pre-read authority. Unsupported adapter atomicity fails closed. Checkout service requires session identity and advertised atomic batch; legacy pure planner without session is preserved solely for old isolated reference tests, not callable through service.

Service command execution and response-loss outcome readback are implemented. Generic mutation failures conservatively remain OUTCOME_UNKNOWN because transport classification has not been finalized; caller must retain original key rather than reissue. Identity verifier remains an injected interface, not a chosen or simulated auth provider. Local tests inject synthetic principals ONLY as test doubles and database session fixtures.

## UI integration

Typed native repository, strict source/module binding and confidentiality rejection, protected same-origin transport factory, and mappings for all 18 routes. Shared shell has explicit Test workspace / Production controls; production renders only the native boundary, never fixture children. Currently injected transport is intentionally disconnected. All 18 routes have disconnected UI tests and contract read-state tests; unauthorized transport never reads. Browser exercised all routes, persisted production selection, switched back to test POS and checked Arabic RTL dark mobile with no page errors/overflow.

This is **centralized route/gate integration, not finished module-specific production forms**. Native ready presentation is a generic record table; explicit per-resource strict DTOs, localized native field/status formatting, production forms/mutations and same-origin hosted API wiring remain unfinished. No production optimistic mutations were added, so no fictitious success/rollback is represented. Existing demo UI is preserved separately.

## Evidence

Full suite: **309 tests / 23 files passed**, including **39 actual local SQLite tests** (19 previous + 20 next-wave), **37 repository tests**, and **18 native page tests**. Latest automatic build/typecheck OK after fixing union typing and exact-optional test errors. Local SQLite acceptance uses BEGIN IMMEDIATE and actual constraints; one earlier test proves file lock contention. Competing command/stale-state tests are local serialized acceptance, not hosted D1 concurrent stress.

Browser: 18/18 production routes show disconnected state and no table/fixture rows; test POS returns; Arabic dark mobile RTL has no horizontal overflow; zero page errors. Evidence in `docs/evidence/native-wave/`.

## Blocked / NOT RUN

No Cloudflare connection, D1/Workers/R2 deployment/operations, real identity provider, live accounts, hosted migrations, production publish, bank/POS hardware or Antigravity operations. D1 concurrency/replication/quotas, real auth/revocation lifecycle, object-store security and end-to-end authenticated hosted UI acceptance NOT RUN. Owner identity-provider/profile decision and approved external native host/test operation are required; Lovable cannot deploy this app to Cloudflare.

OD restrictions still block purchase authorization creation, cash IN/OUT posting/reconciliation, credit issuance/repayment posting, bank/facility allocation, expense posting and refund/return/resale release. Test authorization of purchase fixtures is not an implemented approval policy. Transfer dispatch/receipt source implements whole-quantity approved flow only; partial receipt/cancel policy remains blocked.

## Still needed for complete ERP

Module-specific strict production DTOs/forms with real service adapter injection; native hosted API/auth/session creation/invitation/reset; SKU physical attributes full parity; full receiving-to-POS browser flow; repayment/cash postings only after OD decisions; transfer cancellation/recovery policies; finalized attachment upload/quarantine/finalize/deletion lifecycle; reports/net-finance completeness, append-only journal guards and accounting review; backup/restore, durable offline service replay/reconciliation, printer/scanner acceptance; independent D1 concurrency/rollback/security acceptance. Source coverage here is not a claim that the entire ERP is finished.
