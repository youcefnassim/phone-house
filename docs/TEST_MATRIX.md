# Test matrix — frontend evidence only

Execution date: 2026-11-05 UTC. Synthetic data only; no database involved.

| Check                                                                 | Result               | Evidence                                                                                                                                                                                                   |
| --------------------------------------------------------------------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Domain regression tests                                               | PASS                 | Vitest 9 tests: serialized phone quantity, repeated accessory scan, decimal preservation, scope, blocked operational writes/offline, unconfigured discounts, owner finance display policy, approved labels |
| Existing route match regression                                       | PASS                 | Vitest 1 test                                                                                                                                                                                              |
| Automatic build and TypeScript                                        | PASS                 | build-errors.log latest `build OK` at 23:06:04, later checks retained                                                                                                                                      |
| Dashboard Light/Dark                                                  | PASS                 | Playwright captures dashboard-light.png, dashboard-dark.png                                                                                                                                                |
| Navigation across internal pages and auth                             | PASS                 | One h1 per visited route; no pageerror events                                                                                                                                                              |
| Session phone draft                                                   | PASS                 | Created Synthetic phone test and read it in Demo drafts                                                                                                                                                    |
| Scanner / checkout preview                                            | PASS                 | AC000001 scanned twice; qty 2; review NOT POSTED                                                                                                                                                           |
| M02 facility permission UI                                            | PASS                 | M01-only message when M02 selected — not a backend security proof                                                                                                                                          |
| Responsive dashboard                                                  | PASS                 | 1440/1280/390 px captures; mobile document no horizontal overflow                                                                                                                                          |
| Mobile inventory navigation                                           | PASS                 | Open menu → Accessories heading                                                                                                                                                                            |
| All module specialized forms, error paths, exports and print reprints | NOT RUN / INCOMPLETE | Further frontend refinement required                                                                                                                                                                       |
| Real auth, transactions, RLS, concurrency, restore                    | BLOCKED              | Owner postponed database                                                                                                                                                                                   |
| Offline outbox / PWA / hardware                                       | NOT RUN              | Operational offline policies and physical tests pending                                                                                                                                                    |

Screenshots captured under /tmp/browser/phone-house (temporary verification artifacts, not permanent project files). Unit test results do not validate backend security.

## Executive review 02 — current evidence

Command: `bunx vitest run src/test/operations.test.tsx src/test/erp-domain.test.ts src/test/app-routing.test.tsx` — 3 files, 20 tests PASS (23:26:27 UTC). Exact baseline ten names and new tests are in REVIEW02_VERIFICATION.md.

| Check                                                               | Result               | Evidence                                                                                               |
| ------------------------------------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------ |
| Original OD source                                                  | PASS                 | Byte comparison of two uploads and ZIP entry against docs/OPEN_DECISIONS_AND_CONFLICTS.md              |
| Phone intake / errors / readback / CODE128                          | PASS                 | check_wave.py; 15-digit IMEI, distinct second identity, draft details and encoded rects                |
| Accessory receiving / movements                                     | PASS                 | 7-unit draft reads in movement view; fixture quantities unchanged                                      |
| Cash opening, movement and blind closing                            | PASS                 | check_wave.py + check_remaining.py; expected amount absent in count dialog, -0.01 discrepancy in draft |
| POS scanner / customer / Bank / receipt                             | PASS                 | Two AC000001 scans, repeated serialized phone remains qty 1; receipt total 192600 DZD; NOT POSTED      |
| Discount / seller / M02 scope restrictions                          | PASS (frontend only) | Disabled approval, M02 terminal uncertainty, store-scoped rows; not permission security proof          |
| Four module themes and desktop                                      | PASS                 | 1440×1000 Light/Dark screenshots                                                                       |
| Four mobile pages, form and navigation                              | PASS                 | 390×844 captures; no document horizontal overflow; table scrolling intentional                         |
| Empty phone results / corrected field errors                        | PASS                 | check_remaining.py; shared component test and fresh form captures                                      |
| Automatic build / typecheck                                         | PASS                 | Latest automatic build OK 2026-11-05T23:26:31Z                                                         |
| Real auth / persisted stock or money / hardware / legal issuance    | BLOCKED / NOT RUN    | Owner postponed backend, unresolved OD approvals and physical device tests                             |
| Cross-module session: customer draft selectable in Debt draft       | PASS                 | session-store.test.ts; merged snapshot, scope-filtered                                                 |
| Session drafts record attributed audit events; fixtures immutable   | PASS                 | session-store.test.ts; resetSession restores fixture-only state                                        |
| Repository validation and non-posting receipts                      | PASS                 | demoRepository rejects invalid input; receipt.posted === false                                         |
| Contract envelope: idempotency format, payload schemas, retry rules | PASS                 | contracts.test.ts; 9 operation groups with invariants                                                  |
| PostgreSQL / RLS / transaction isolation / offline reliability      | NOT RUN              | Proposals only (db/proposed/); no database connected                                                   |

Browser scripts and temporary screenshots: /tmp/browser/review02/. User-requested durable evidence is in Files/review02. Synchronous typed demo reads have no asynchronous loading/network error state; do not claim backend error-path tests.

## Review06 — 2026-11-06 UTC

- Local Vitest: 92 tests PASS in 9 files (85 existing + 7 inactive adapter safeguards).
- Python real-database specification: 10 SKIPPED; no database authorization/connection.
- Browser preserved preview: 19 direct routes, zero pageerrors; dashboard inspected at 1280×1800. No real authenticated transaction tested.
- Automatic build/typecheck: build OK at 14:08:48Z after optional IMEI DTO narrowing fix.
- Every content route has app-specific leaf title/description/OG basics/twitter card. No meaningful absolute cover URL; no placeholder image tags added.
- SQL/RLS/accounts/concurrency/rollback/published Worker/restore/offline: NOT RUN, BLOCKED. Detailed execution specs in REVIEW06_TEST_MATRIX.md.
