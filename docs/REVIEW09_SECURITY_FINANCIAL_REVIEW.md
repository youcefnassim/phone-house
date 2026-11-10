# Review09 security and financial safeguards — SOURCE ONLY

## Audit disposition

- F08-A: physical/catalog/provenance/ownership source retained; runtime still unverified.
- F08-B: installment DELETE explicitly uses OLD, INSERT/UPDATE NEW. Independently identified four cross-table record-field hazards in journal_guard, financial_source_guard, sale_totals and phone_sale_ownership now branch before accessing table-specific fields. Trigger events/deferral/locks/ACLs unchanged. Q adds exact DELETE/update rejection and replacement readback.
- F08-C/F08-E: production native business DTO now separate from inventory DTO and demo interfaces. SQL 0009 explicitly marks owner-only sales/repayments availability and blocked expenses/history. No invented uniform facility amount or Closed draft production label. Inventory wired through inactive transport/factory. Read failures sanitized; absent finance is null; purchase identifier must match. 10 new local parity/privacy tests; actual SQL outputs require the guarded DTO case.
- F08-D: historical A–T ported beside U–AJ; guarded entry executes 36 scenarios plus one live-SQL DTO parity case. Exact SQLSTATE rejections and full ordered persisted-row snapshots replace generic safety failures and five-count rollback oracles.
- F08-F: no operational posting added for procurement authorization, transfer dispatch/receipt inventory, supplier settlement, facility bank allocation, expense, refunds/reversal/offline/issuance. Privileged test inserts are explicitly constraint probes, never commercial acceptance. All OD-01–OD-18 remain OPEN and original register unchanged.
- F08-G: strengthened approval-file identity/manifest, pinned environment-scrubbed socket client, source buffers, phase/suite locking, volume driver/consumer identity, exact synthetic UUID check and deterministic drawer resets. External sign-off/host trust/freshness cannot be proven by local predicates; independent attestation and disposal proof remain mandatory.

## Preserved controls

Store-scoped role composition and active-profile/revocation checks; global owner explicitly scoped; global cross-slot IMEI registry; one active serialized-sale owner, no release command; capped locked authorized purchasing receipts; exact decimal strings and no rounding; private nullable costs; strict output allowlists; append-only sale/journal/audit/history; zero expected-cash disclosure before blind count; one drawer per store; policy-blocked manual cash movement; single atomic RPC transaction. No role/price authority accepted from browser.

## Limits and remaining engineering risks

No PL/pgSQL compilation, RLS/ACL/concurrency/rollback or actual container isolation run. SQL record guards are corrected source, not runtime-certified fixes. PostgreSQL SET ROLE/DO deferred-constraint protocol needs first approved execution proof; offline protocol mocks only check parsing/failure separation. Catalog hash checks table names, not every structural object; independent schema/ACL dumps are required. Docker administrative adversaries and forged external attestation are outside local harness proof. Migration raw errors stay suppressed; sanitized diagnostic procedure remains operator-reviewed. Production UI adaptation is intentionally absent: production adapter cannot be cast to demo BusinessSnapshot and is uninstantiated. PII free-text handling, actual bearer/session revocation, cache identity clearing, Worker execution, hardware, restore and offline rules require separate approved stages. No claim of operational security or financial-policy acceptance.
