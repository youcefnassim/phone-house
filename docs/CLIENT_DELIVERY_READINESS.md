# Phone House Maghnia — Client delivery readiness

Revision: `134f079` (+ uncommitted print-audit fixes this turn). Date: 2026-11-07.

## Current everyday usability verification

Latest staff/closeout wave: four active synthetic operators, retained retired historical identities, M02 Manager POS/receiving, direct M01/M02 blind close and immutable retrospective owner review. Full suite **411 PASS / 0 FAIL**; browser **358 PASS / 0 FAIL** (342 route renders + 16 linked scenarios). Automatic build/typecheck signal OK; no separate manual build/typecheck (harness-managed). Evidence and specific gaps: `STAFF_CLOSEOUT_ACCEPTANCE.md`, `evidence/staff-closeout/`. No owner data reset or hosted acceptance. Earlier results below are historical.

Source checked: `3be3b46ecc121b32047a3ad85fb825a69c9a996b` (before documentation changes). 379 unit tests PASS; 396 browser checks PASS / 0 FAIL. Automatic compilation OK; no separate manual build/typecheck was run. See `RETAIL_USABILITY_ACCEPTANCE.md` and `evidence/retail-usability/`. Owner browser data was not accessed or reset. Hosted authentication, hosting, database and hardware acceptance remain NOT RUN. Historical click audits are not recertified by route-render checks.

## 1. Historical demonstration evidence — before single-application update

Historical results reported in the previous pass (not current source certification):

| Area                                                                                                                              | Result                                                                                                                  | Evidence                                                           |
| --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Automated suite                                                                                                                   | 368/368 PASS (26 files)                                                                                                 | `bunx vitest run`                                                  |
| Business workflows from fresh Reset                                                                                               | 17/17 PASS                                                                                                              | `docs/evidence/meeting/flows.py`                                   |
| Negative / keyboard / render checks                                                                                               | 28 PASS (+108 renders, not double-counted)                                                                              | `docs/evidence/meeting/r11.py`                                     |
| Meeting checks (FR default, no-shift cash block, cross-store, 18 routes × 3 viewports × FR/AR/EN × Light/Dark)                    | 14/14 PASS                                                                                                              | `docs/evidence/meeting/meeting.py`                                 |
| A4 invoice/warranty print: invocation, print DOM, @media print, zero ledger mutation on print/reprint, history reopen, Arabic RTL | 14/14 PASS                                                                                                              | `docs/evidence/meeting/print_verify.py`, `print_results.json`      |
| Per-control click audit FR/AR/EN                                                                                                  | re-run in progress (chunked); previous run: 2,860 PASS / 0 FAIL / 12 BLOCKED (intentional gates) / 6 NOT TESTED (reset) | `docs/evidence/meeting/final_audit.py`, `final_control_matrix.csv` |

The earlier "print invocation failure" was a test artifact: Playwright serializes an arrow function returned from `page.evaluate`, invoking the mock once during installation. Fixed by ending the install script with `void 0`. The application code was correct.

## 2. Production deployment readiness — NOT READY (by design, owner-deferred)

- No hosting: Cloudflare Workers/D1/R2 source preserved, nothing provisioned or deployed.
- No real authentication or accounts; sign-in screen is an honest disconnected interface.
- No hosted database, migrations, backups or disaster-recovery tests.
- No physical hardware acceptance (printer, scanner, cash drawer).
- OD-01..OD-18 remain OPEN; policy-blocked operations show draft/blocked states only.
- Test-mode role preview and cost hiding are UI-only, not server security.

## 3. Honest limits of the demonstration

- All data is synthetic, browser-local (IndexedDB), resettable from Settings.
- Invoice and warranty sheets are SPECIMEN / TEST — not fiscal documents.
- Reprinting never mutates stock, cash, sales, debts or audit (verified).
- Dashboard/report figures derive from the current synthetic test ledger.

## 4. Owner-approved single application — 2026-11-07

Starting revision: `8ce5c6aa7b33203602dc500614ec36564cfbb754`. Last checked implemented source: `2c65b139a2aa474b3015dc2e63040a7251a203e6` (documentation updates follow).

One shell renders the existing local operational pages; obsolete stored `ph-mode=PRODUCTION` is ignored. There is no selectable native/production landing. Cloudflare Workers/D1/private-R2 and native repository source/tests were not changed or deleted.

Settings contains the local-storage/privacy/security disclosure and clean-start preparation. Export is a private local JSON browser download, not a certified backup. Explicit confirmation text AND acknowledgement are required, with separate phrases for rehearsal fixtures versus empty onboarding. The fixed IndexedDB namespace is the only target. Empty-state fixture policy suppresses reference history, stock, client references and preview identities and survives hydration. Existing revision data is preserved rather than reseeded. Writes are serialized and workspace/session replacements avoid intermediate reset persistence.

### Current verification

| Check                                               | PASS | FAIL | Scope                                                                      |
| --------------------------------------------------- | ---: | ---: | -------------------------------------------------------------------------- |
| Full Vitest suite                                   |  373 |    0 | 27 files; 368 baseline retained, 5 new lifecycle tests                     |
| Route/Settings browser checks                       |  349 |    0 | 342 route combinations + 7 storage/confirmation/export/conservation checks |
| Linked business browser flows                       |   16 |    0 | Credit/repayment/transfer/facility/SAV/store boundaries, persistence       |
| Intake/named sale/document/accessory browser checks |   16 |    0 | A4 specimens, print/reprint zero mutation, dashboard/cash and reload       |
| Automatic build/typecheck                           |   OK |    0 | Latest observability entry build OK                                        |

Browser total: **381 PASS / 0 FAIL** on the final stabilized runs. All run in fresh isolated Playwright contexts with fictional input. No owner browser reset, deletion or empty-start confirmation was invoked. Existing owner review data were not erased by this migration; owner-browser contents are not remotely inspectable here. Preparation/export/cancel/reload preserved the isolated browser snapshot byte-for-byte.

### Honest gaps

- Destructive clean-start through the real browser UI: **NOT RUN intentionally**. Safe deletion/rehearsal/empty persistence and target rejection verified in fake IndexedDB unit tests only. No claim of certified restore.
- Hosted Workers/D1/R2, real identity, secure roles, concurrency across devices and hardware: **NOT RUN / approval deferred**.
- Full per-control audit of every dialog combination: **NOT RUN this update**; historical matrix is unchanged and not recertified. Old background audit was stopped because its selector assumptions predate this UX; partial output is not merged or claimed as acceptance.
- OD-01..OD-18 remain open; fiscal issuance, warranty terms, credit eligibility, refunds and other unapproved policies remain provisional/blocked.

Changed implementation files: `src/components/erp/{context,shell,settings,local-review-settings,business-ui,dashboard,inventory,pos,audit,users}.tsx`; `src/data/{test-workspace,business-demo}.ts`; `src/i18n.ts`; `src/locales/{index,review,testws,audit}.ts`; `src/test/local-review.test.ts`; architecture/roadmap and this walkthrough/readiness documentation. Backend files and historical control matrices preserved.

Evidence: `docs/evidence/single-app/` (scripts, result JSON, screenshots and full unit output). Scripts reconstruct fresh isolated browser state and never restore the owner's browser session.
