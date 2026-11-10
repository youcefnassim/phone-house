# POS, Cash, Sales Documents and Native Security Acceptance — 7 November 2026

## Result

The implemented subset and its local verification pass; this integrated wave is not source-complete. No hosted service is connected, deployed or verified.

| Area                                              | Source                        | Local verification              | Hosted / physical       |
| ------------------------------------------------- | ----------------------------- | ------------------------------- | ----------------------- |
| Phone buyer required, accessory walk-in           | Done                          | Unit + browser PASS             | Not hosted              |
| Customer quick-create, normalized duplicate reuse | Done                          | Unit + browser PASS             | Not hosted              |
| Per-phone warranty YES/NO and draft dates         | Done                          | Unit + browser PASS             | Policy unapproved       |
| Cash vs bank and shared drawer                    | Done                          | Unit PASS                       | Physical cash NOT RUN   |
| Sales history, Algeria dates, specimen reprint    | Done                          | Unit + browser PASS             | Printer NOT RUN         |
| POS camera action                                 | Reuses existing ZXing scanner | Existing scanner tests PASS     | Physical camera NOT RUN |
| Inventory price/adjustment store guards           | Done                          | Unit PASS                       | Not hosted              |
| JWT verifier                                      | Done, provider unselected     | Real ES256 signature tests PASS | Hosted identity NOT RUN |
| Native checkout and cash roles                    | Done                          | Local SQLite PASS               | D1 NOT RUN              |
| Worker deployment                                 | Not generated                 | NOT RUN                         | NOT RUN                 |

## Changed behavior

- A sale containing any phone requires a linked customer from the store's customer list. Accessory-only sales may use walk-in.
- Customers can be created inside checkout with surname, given name and optional contact. Similar names or matching contacts require explicit reuse.
- Each phone records “no warranty” or a draft requested duration with start/end dates. Draft terms are not active, approved or official.
- Bank sales require the open store session but never add physical cash.
- `/sales` shows store-scoped history with Today, Yesterday, This week, All and custom dates using `Africa/Algiers`.
- Invoice and warranty specimens remain clearly marked. Reprint does not mutate local records.
- Native checkout requires a buyer for phones, verifies the buyer's store and requires a trusted session.
- M01 Sellers and the M02 Manager can operate their own drawer in native source; M01 Manager cannot.
- `createJwtIdentityVerifier` validates signature, issuer, audience, expiry, required subject and session claims, then maps the subject through active D1 account/session rows.

## Commands run

| Command                                              | Result                                                                |
| ---------------------------------------------------- | --------------------------------------------------------------------- |
| `bunx vitest run --maxWorkers=3`                     | 34 files, 453 tests PASS                                              |
| `python3 /tmp/browser/pos-cash-secure/check_flow.py` | 48 browser assertions PASS                                            |
| Harness build/typecheck                              | latest entry: build OK (no manual standalone build/typecheck command) |

Browser coverage: intake → cash open → scanner Enter → blocked buyer → customer create → draft warranty → sale → invoice/warranty → two pure prints → `/sales` → reopen → reload. Added customer purchase-history readback, POS camera permission-denial/manual fallback and cross-store scanner negatives. Covered EN Light 1440 M01 seller, FR Dark 768 M02 manager and AR RTL Dark 390 second M01 seller.

Evidence: `docs/evidence/pos-cash-secure/`.

## Not completed or not verified

- Real Cloudflare account, D1, private R2, Worker host and identity provider were not connected. Lovable app deployment to Cloudflare is unsupported; no Worker entrypoint or deployment infrastructure was generated.
- Native schema/checkout does not yet persist the frontend warranty drafts or immutable detailed receipt snapshots. Full frontend-to-native checkout mapping, native retrospective owner-close review, secure customer surname/given-name/contact fields and deduplication, active-roster provisioning restrictions and approved login handoff remain incomplete. Existing native supplier/customer/receiving commands still retain earlier permission mappings; the complete daily role reconciliation is not certified.
- Private R2 uses existing injected get/put/finalize ports, not implemented public/signed attachment issuance. Backup/restore and abuse controls remain pending.
- Native JWT tests use actual signatures and local SQLite but a synthetic issuer/keypair; other API identity tests are mock-verifier tests, not hosted identity evidence. Trusted key rotation and provider configuration remain owner-selected.
- Local checkout validation is synchronous and preserves failed-sale stock/cash/audit state; IndexedDB durable commit and cross-tab concurrency are not transactional database certification. Customer creation is a separate explicit action and is retained if a later sale fails.
- Production adapter remains disconnected.
- Mixed tender, partial payment and credit remain unposted pending OD-12.
- Discounts remain locked pending OD-05.
- Official invoice and enforceable warranty remain disabled pending OD-01, OD-08 and OD-09.
- Offline sales remain blocked pending OD-18 and conflict design.
- Backup, restore, rate limiting at the edge, cross-device races and physical scanner/printer/camera acceptance are not verified.
- The local cash history now shows cash and bank totals; a fuller cash event log and separate cash-in/out reason report can be expanded later.

## Owner decisions still open

OD-01, OD-05, OD-08, OD-09, OD-12, OD-16 and OD-18 remain open, with every other OD unchanged.

## Required later authorization

1. Exact Cloudflare account and resource names for D1 and private R2.
2. Identity provider, issuer, audience, public signing-key procedure and staff subject mapping.
3. Approved origin and host wiring.
4. Separate approval to run migrations, create accounts, inject secrets, deploy and test.
5. Backup/restore, retention and incident procedure.
6. Fiscal, warranty, discount, credit and offline policy decisions.

## Preserved boundaries

No owner workspace was reset or reseeded. Browser tests used fresh isolated contexts. No published visibility, real credentials, provider resources, historic PostgreSQL proposals, or Antigravity files were changed. The original OD register remains unchanged. First default-parallel test runs exposed a scanner timeout under load; the final complete run with three workers passed all 453 cases. Earlier print measurement invoked the assigned mock inadvertently; the corrected function-scoped measurement proves two clicks, two print calls and unchanged persisted records.
