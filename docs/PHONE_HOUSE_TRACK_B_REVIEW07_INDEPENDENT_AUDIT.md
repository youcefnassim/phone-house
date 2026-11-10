# PHONE HOUSE MAGHNIA — TRACK B

## Independent Review07 Source Audit — 2026-11-06

**Status:** Conditional acceptance of source preparation. Database execution and operational activation remain BLOCKED. This review does not certify production behavior.

### Evidence examined

- `phone-house-track-b-review07-source.zip` — 197 archive entries; 196 file hashes match `SOURCE_MANIFEST_SHA256.json`.
- `db/proposed/0001`–`0010` — inspected SQL source, not executed.
- `src/backend/command-gateway.server.ts`, `user-transport.server.ts`, `transactions.functions.ts`, `provisioning.server.ts` — inspected static implementation.
- `src/domain/backend.ts`, `transaction-contracts.ts`, `contracts.ts` — inspected contract compatibility.
- `tests/integration/review07_transactions.py` and synthetic fixture SQL — inspected test procedures.
- Review07 supplied local log reports 112/112 Vitest PASS. No independent re-run performed here.
- A–T database acceptance: 20 explicitly SKIPPED. No PostgreSQL compile/RLS/concurrency/transaction/restore acceptance proof.

### Confirmed source improvements

1. Per-store role assignment in `0001` with distinct global Super Admin.
2. Private purchase/finance/ledger/replay schemas, explicit function ACL containment, and non-login/non-bypass `ph_engine` owner in proposed SQL.
3. Canonical cross-slot IMEI uniqueness, serialized unit status transitions, stock balance locks, one-open-shift index.
4. Seven command RPCs in `0007`, intended to bundle business changes in a single PostgreSQL transaction; replays bound to actor, operation, store, contract version and payload hash.
5. Normalized contract-specific installment rows, separated salary evidence and bank-remittance records.
6. Server-side authenticated transport and repository ports exist but remain inactive and not used by operational UI routes.

### Required corrections before first test-schema acceptance

**R07-F01 — Missing approved phone details (P0).** `0002_inventory.sql` defines `phone_units` without battery health, color, storage, or detailed condition remarks. Preserve approved model/physical-unit distinction and store all required owner-confirmed intake fields. Add input/DDL/projection/round-trip tests.

**R07-F02 — Sale-line serial ownership (P0).** `0003_sales_cash.sql` has no database uniqueness rule for `sale_lines.phone_unit_id`. The checkout RPC checks `AVAILABLE` status, but the database schema alone does not prevent duplicate links. Define a rigorous active ownership constraint consistent with any approved return/resale lifecycle; do not impose unapproved resale policy. Test two simultaneous attempts and structural insert conflicts.

**R07-F03 — Catalog/variant depth (P1).** `0002_inventory.sql` currently models generic `catalog_entries` with name/category/barcode. It does not represent approved brand/model/variant and accessory-specific SKU/compatibility/color structure. Design validated typed catalog tables and operations without mixing phone physical-unit records with accessory quantities.

**R07-F04 — Purchase receipt provenance (P1).** `0007` phone and accessory receiving RPCs record a free-text document reference but do not create a matching `purchase_receipts` relation or validated supplier obligation/cost provenance. A successful receipt must be linked to the authorized purchase/receipt context and applicable capped quantities in the same transaction. Unknown costs must not silently become zero.

**R07-F05 — Conflicting contract generations (P1).** `src/domain/contracts.ts` retains Review05 `contractVersion` and client-supplied `sellerId`, `unitPrice` and other deprecated shapes; `src/domain/transaction-contracts.ts` defines the new trusted Review07 command contracts. Prevent accidental use or export of obsolete contracts. Move legacy schemas behind explicitly named demo-only compatibility or remove them after tests are migrated.

**R07-F06 — Incomplete operational command scope (P1).** Source implements seven RPCs, but not real transaction commands for transfers, returns/refunds, facility bank allocations, supplier settlements, expenses, reversals and customer/debt creation. Do not indicate these modules as operational. Owner-policy-dependent actions must remain blocked.

**R07-F07 — Cash and blind-close correctness (P1).** `command_cash_movement` allows amount/direction/description but does not explicitly assert a post-movement nonnegative physical drawer balance; treatment needs owner policy, not invented thresholds. Test whether sales and repayment projections permit deriving a blind close expected amount. Require controlled visibility and tested reconciliation under simultaneous shift close/checkout.

**R07-F08 — Real DB test isolation and coverage (P0 for executing tests).** `review07_transactions.py` requires an env flag and checks loopback host/database name; that alone is not evidence of owner authorization or actual disposability (e.g. local port forwarding). Test fixtures perform destructive `TRUNCATE ... CASCADE`. Before any execution, require explicit owner authorization, freshly created isolated local database/container, strong immutable environment identity, no production or Antigravity network paths, verified table/catalog preflight and manual approval of destructive resets. Never expose credentials in logs or chat.

**R07-F09 — Real PostgreSQL and hosted Auth acceptance (P0 for release).** Test A–T is not run. PostgreSQL schema compilation, RLS, effective ACLs, SQLSTATE mappings, rollback, concurrent stock, actual Supabase Auth and published Worker are unverified. A–T SQL `SET LOCAL ROLE authenticated` tests do not substitute for real hosted sign-in or browser role isolation.

**R07-F10 — Integration completeness (P1).** The production repository resolver intentionally rejects all requests. `read_operational_snapshot` has an empty expenses projection and does not provide full POS/cash/stock operational read models. Design typed, role-safe read projections and matching UI integration without activating demo-to-live switch prematurely.

### Operational control gates

- No Lovable Cloud, remote Supabase connection, database migration, account provisioning, production repository activation or actual operational posting authorized by this audit.
- E-commerce and courier integrations remain frozen.
- Antigravity repository, database, configuration and credentials are out of scope.
- OD-01–OD-18 remain unresolved unless explicitly approved by the owner.
- Next meaningful acceptance step: correct source blockers; obtain distinct explicit owner permission for fresh isolated local PostgreSQL testing; run migrations with stop-on-error and A–T tests; publish sanitized per-test readback/failure evidence; then repair before any remote activation proposal.
