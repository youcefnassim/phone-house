# Everyday retail usability — acceptance

Starting owner reference: `e1f97ac2952b1665e79d912a4e089f610c9acf13`. Final application source checked: `3be3b46ecc121b32047a3ad85fb825a69c9a996b`; documentation changes followed. Evidence: `docs/evidence/retail-usability/`.

## Before / after

- Eighteen permanent destinations → six daily links, three expandable groups; all destinations retained. Mobile advanced navigation reaches SAV and closes the drawer.
- Dashboard chart/KPI clutter → four ledger-derived metrics and recent sales. Chart remains in Reports.
- Long page descriptions and preview tools → expandable details/options. Policy warnings and draft states remain visible where needed.
- Intake optional metadata → collapsed technical fields; mandatory identity/model/price remain visible. Invalid hidden fields expand before focus. Google used-device intake and cross-slot duplicate rejection verified.
- Client/supplier IDs in dropdown labels → human names with unchanged stored identifiers. Internal purchase/transfer/cash metadata stays available in details.
- Named invoice and secondary checkout diagnostics → contextual sections. Clear View invoice action, separate warranty specimen, unchanged printable legal warnings.
- Local export/reset/empty-start controls → Settings/About disclosure, unchanged deliberate confirmations.

## Files touched

`src/components/erp/{shell,operation-ui,inventory,dashboard,business-ui,settings,pos,cash,customers-debts,facility-business,suppliers-purchases,transfers-business,test-documents,reports,ledger-chart}.tsx`; `src/locales/{retail,index,messages}.ts`; `src/styles.css`; `src/test/retail-usability.test.tsx`; `AGENTS.md`; `roadmap.md`; walkthrough/readiness documents. Backend/native adapters and workspace storage implementation were not changed by this UI refinement.

## Exact verification

| Check                                                                                                                     |    PASS |  FAIL |
| ------------------------------------------------------------------------------------------------------------------------- | ------: | ----: |
| Full Vitest suite, 28 files                                                                                               |     379 |     0 |
| 19 routes × FR/AR/EN × Light/Dark × 390/768/1440 widths                                                                   |     342 |     0 |
| Settings disclosure, non-destructive preparation/cancel and persistence checks                                            |       7 |     0 |
| Customer, cash, POS, credit/repayment, transfer approvals/scans, facility evidence, SAV                                   |      16 |     0 |
| Phone intake, named sale, invoice/warranty, print/reprint no mutation, accessory sale, reload/dashboard                   |      16 |     0 |
| Daily usability, used phone, validation, accessory receiving, underpayment/no-shift, owner cost presentation, mobile menu |      15 |     0 |
| **Browser total**                                                                                                         | **396** | **0** |

Final automatic compilation signal: build OK at 2026-11-07T14:10:18Z. Manual build/typecheck was not run because the project harness manages compilation; no independent typecheck result is claimed. Earlier final-run interruptions from navigation/HMR were rerun successfully; final result files contain the table counts. Scripts, raw JSON/logs and screenshots are preserved. Screenshots reviewed include French desktop dashboard, Arabic dark mobile POS, named A4 invoice and mobile SAV.

## Coverage limits / NOT TESTED

- These are linked workflow and route checks, not a fresh click certification of every historical control. Historical 2,860-click matrix remains archived, not renewed. Exhaustive control/dialog combinations and every keyboard path: NOT TESTED in this pass.
- Report totals retain existing ledger tests and report rendering; no new post-sale browser numeric assertion for every report cell. Blind close retains baseline tests; not explicitly re-executed in the new daily script.
- Real authentication, hosted Workers/D1/R2/database, multi-device sync, deployment and physical printer/scanner/till: NOT RUN. Browser print invocation and print content were checked, not hardware acceptance.
- Destructive reset and empty-start were not executed on behalf of the owner. Existing lifecycle tests and cancel/preservation checks remain; owner browser data was neither accessed nor erased. All browser mutations occurred in fresh isolated synthetic contexts.
- OD-01..OD-18 remain OPEN; no finance/tax/warranty/refund rules invented. Cost visibility is local role presentation, not secure authorization. Provisional credit/facility/refund drafts are not collected or posted money.
