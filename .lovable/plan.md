# Phone House Maghnia — Track B: Environment Assessment and Implementation Plan

## 1. Environment assessment (inspected 2026-11-05)

| Item                                       | Status                    | Notes                                                                                                                                                                                                                                 |
| ------------------------------------------ | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime                                    | VERIFIED                  | TanStack Start v1 + React 19 + Vite 7, server functions on Cloudflare Workers (workerd, not Node)                                                                                                                                     |
| Styling                                    | VERIFIED                  | Tailwind v4 via `src/styles.css`, shadcn tokens, oklch                                                                                                                                                                                |
| Project state                              | VERIFIED                  | Fresh template; placeholder home page; no app code                                                                                                                                                                                    |
| Backend / database                         | BLOCKED (decision needed) | No backend connected. Two options: (a) Lovable Cloud — managed PostgreSQL, auth, RLS, storage, created and isolated for this project only; (b) owner-connected dedicated database project via Settings, which only the owner can link |
| Git                                        | UNKNOWN                   | Git state is managed by Lovable; a private GitHub repo can be connected by the owner from project settings                                                                                                                            |
| Tests                                      | VERIFIED                  | Vitest configured; Playwright available in sandbox for browser flows                                                                                                                                                                  |
| Offline                                    | VERIFIED feasible         | IndexedDB + service worker in browser; installability limited inside the editor preview, testable on published URL                                                                                                                    |
| Hardware (scanner, receipt/label printers) | NOT RUN                   | Requires physical tests; keyboard-wedge scanner assumed                                                                                                                                                                               |
| Geist font                                 | VERIFIED available        | Open licence (Vercel), loaded via link tag                                                                                                                                                                                            |

No Antigravity code, data, credentials or deployments will be touched.

## 2. Architecture decisions

- All business mutations run as single PostgreSQL functions (one transaction, row locks `FOR UPDATE`), invoked from authenticated server functions. Server never trusts client role, store, seller, price, status or totals; everything is re-derived.
- Deny-by-default RLS on every table. Store scoping via `has_store_access(uid, store_id)`; roles in a separate `user_store_roles` table (SUPER_ADMIN, MANAGER, SELLER).
- Confidential finance boundary: costs, COGS, supplier financials live in a separate `private` schema not exposed to the Data API; accessed only through Super Admin–checked functions. Operational tables carry no cost columns. Negative tests prove non-admins get nothing.
- Money: `NUMERIC(14,2)` DZD, exact decimal arithmetic; financial rounding remains unapproved; no binary floats. Timestamps `timestamptz`, displayed in Africa/Algiers.
- Posted history is never deleted; corrections are reversal entries. Every mutation writes `audit_events`.
- Idempotency: `idempotency_records(key, payload_hash, result)`; same key + different payload → 409.
- Unknown cost stored as NULL, never 0; margins flagged PROVISIONAL.

## 3. Data model (modules)

```text
core:      stores, profiles, user_store_roles, devices, terminal_sessions, settings, audit_events, idempotency_records
catalog:   brands, models, variants (normalized name unique), accessory_categories, accessory_skus
phones:    phone_units (imei1/imei2 global uniqueness via identifiers table), phone_events
access.:   accessory_balances (CHECK qty >= 0, unique store+sku), accessory_movements, stock_counts
private:   unit_costs, batch_costs, supplier_financials (Super Admin only)
purchase:  suppliers, purchases, purchase_receipts, payables, supplier_payments, expenses
cash:      cash_drawers (1 per store), cash_shifts (partial unique: one OPEN per drawer), cash_movements
sales:     customers, sales, sale_lines (phone line qty = 1 CHECK), sale_payments, discount_approvals
credit:    customer_debts, debt_payments
facility:  conventions, employers, facility_contracts (M01 only), installments, bank_remittances (unique ref)
transfer:  transfers, transfer_lines, transfer_approvals, transfer_scans
sav:       warranty_cases, returns, refunds (cumulative qty checks)
docs:      documents, print_jobs (reprint trace)
offline:   offline_submissions, sync_conflicts
```

## 4. Page map

```text
/auth                      sign in
/                          dashboard (scope-aware)
/pos                       scanner-first checkout, shift banner, seller handoff (M01)
/cash                      shifts, blind close, movements
/stock/phones              phones only (own sidebar item)
/stock/accessories         accessories only (own sidebar item)
/catalog                   brands, models, categories
/purchases, /suppliers     intake; costs visible to Super Admin only
/customers, /debts
/facility                  M01 only
/transfers
/sav                       warranty, returns, refunds
/reports                   owner only, PROVISIONAL flags, zakat worksheet
/settings, /audit
```

## 5. Offline risk decisions

- Outbox in IndexedDB with immutable canonical payload + stable idempotency key; states PENDING → SYNCING → CONFIRMED / CONFLICT / BLOCKED. Queued sales never shown as confirmed.
- All operational offline sales are blocked until owner-approved identity, security, allocation and conflict policies exist. A session or stock snapshot is not a stock-availability guarantee. Offline PIN switching remains blocked.
- Server replay is idempotent; 400/401/403/409 map to explicit BLOCKED/CONFLICT states.

## 6. Execution blocks (dependency order)

1. Foundation: backend, design system (Phone Blue / Door Yellow / Night Ink, Light + Dark, Geist, neutral "PH" mark), app shell, auth, stores M01/M02, roles, audit, all docs/*.md files, synthetic test guard.
2. Catalog + Phones inventory + Accessories inventory + barcode labels.
3. Cash drawers/shifts + POS checkout + receipts + idempotency.
4. Customers, debts, repayments.
5. Suppliers, purchases, private costs, payables, expenses.
6. Transfers with dual approval and scanned receipt.
7. M01 facility, installments, bank remittances.
8. SAV / returns / refunds.
9. Offline POS.
10. Owner reports, zakat worksheet, A4 draft templates.

Each block: migrations + RLS + transactional functions + UI + tests (positive and the required negative cases) + browser screenshots, logged in TEST_MATRIX and PROGRESS_LOG as VERIFIED PASS / FAIL / BLOCKED / NOT RUN. Pending decisions OD-01..OD-18 kept in DECISION_REGISTER; dependent operations fail closed (e.g. discounts disabled until a cap is configured).

## 7. Needed from the owner

- Database connection is postponed by the owner. Do not enable Cloud or execute migrations. Future database: dedicated owner-controlled PostgreSQL.
- Do not request production credentials during the frontend-first stage.
- OPEN_DECISIONS_AND_CONFLICTS.md was supplied on 2026-11-05 and preserved verbatim under docs/. All OD-01..OD-18 remain OPEN with their original safe interim rules.

Not claimed: production readiness, hardware compatibility, legal/tax templates, backup-restore proof (requires a separate restore environment).

## Owner-authorized frontend-first sequence

Build application shell, Light/Dark tokens, authentication interface, executive dashboard, then all listed operational interfaces using typed isolated synthetic adapters. Label DEMO DATA; no operational success claims. Validate forms, interactions, navigation, themes and responsive layouts. Database/security tests remain BLOCKED; no migrations executed.
