# Phone House Maghnia — Acceptance scenario matrix

Revision: `134f079` (+ this turn's fixes). Date: 2026-11-07.

**Traceability caveat:** the canonical 81-scenario catalog with stable IDs was referenced in owner briefs but never supplied to this project. The rows below are built from the acceptance areas in the owner's briefs (A-xx numbering is ours, not the canonical IDs). When the canonical catalog is provided, these rows map onto it without re-testing.

Legend: PASS = executed in browser/automated suite this cycle; BLOCKED = intentionally gated (policy/hosting); NOT TESTED = not executed.

## Inventory and sales

| ID   | Scenario                                                    | Result | Evidence                                       |
| ---- | ----------------------------------------------------------- | ------ | ---------------------------------------------- |
| A-01 | Create phone brand/model in catalog                         | PASS   | flows.py; catalog variants added               |
| A-02 | Receive new and used phones (intake)                        | PASS   | flows.py 17/17                                 |
| A-03 | IMEI uniqueness across both slots and both stores           | PASS   | r11.py negative cases                          |
| A-04 | Search by barcode, IMEI, serial                             | PASS   | flows.py POS scan; audit search controls       |
| A-05 | Sell phone via POS; disappears from stock, stays in history | PASS   | flows.py                                       |
| A-06 | Receive 20 accessories, sell 1, balance 19                  | PASS   | flows.py accessory receiving/POS               |
| A-07 | Prevent duplicate checkout (stable sale key)                | PASS   | r11.py repeated sale key                       |
| A-08 | Prevent negative stock                                      | PASS   | r11.py                                         |
| A-09 | Dashboard/reports derive from current test ledger           | PASS   | ledger-view tests; dashboard 0 DZD after reset |

## Cash and operators

| ID   | Scenario                                                              | Result | Evidence                                      |
| ---- | --------------------------------------------------------------------- | ------ | --------------------------------------------- |
| A-10 | One physical cash drawer per store                                    | PASS   | native-api tests (one-drawer rule); cash page |
| A-11 | M01 staffing: Super Admin, Manager, 2 sellers; M02: Manager, 1 seller | PASS   | fixtures; users page                          |
| A-12 | Seller attribution in test mode (preview, not authenticated)          | PASS   | flows.py; labeled preview                     |
| A-13 | Shift open → payment → blind close                                    | PASS   | flows.py                                      |
| A-14 | Block payment into closed shift                                       | PASS   | meeting.py no-shift cash block                |
| A-15 | Bank payments separate from physical cash                             | PASS   | flows.py facility/bank evidence               |

## Customers and finance

| ID   | Scenario                                                 | Result | Evidence                                       |
| ---- | -------------------------------------------------------- | ------ | ---------------------------------------------- |
| A-16 | Create and select customers                              | PASS   | flows.py                                       |
| A-17 | Credit-request draft + repayment projection              | PASS   | flows.py (drafts, not collected money)         |
| A-18 | Reject invalid amounts and overpayments                  | PASS   | r11.py repayment overage                       |
| A-19 | Projected vs confirmed balances distinguished            | PASS   | Review 11 labels; debts page                   |
| A-20 | Cost/margin hidden from Manager/Seller (UI preview only) | PASS   | native-page tests; labeled not-server-enforced |

## Transfers, facility, SAV

| ID   | Scenario                                                       | Result | Evidence                                          |
| ---- | -------------------------------------------------------------- | ------ | ------------------------------------------------- |
| A-21 | Transfer requires distinct Super Admin + M02 Manager approvals | PASS   | flows.py dual preview approvals                   |
| A-22 | Dispatch + complete scanned receipt required                   | PASS   | flows.py; r11.py incomplete transfer              |
| A-23 | Exactly one stock ownership change                             | PASS   | flows.py destination availability                 |
| A-24 | Facility workflows M01-only                                    | PASS   | meeting.py; facility page gating                  |
| A-25 | Salary-deduction bank receipts outside cash drawer             | PASS   | flows.py facility evidence                        |
| A-26 | SAV case linked to actual sold IMEI                            | PASS   | flows.py SAV duplicate/linkage                    |
| A-27 | Refund execution blocked; review draft only                    | PASS   | SAV disabled execution button (BLOCKED by design) |

## Documents and printing

| ID   | Scenario                                                                                    | Result     | Evidence                                           |
| ---- | ------------------------------------------------------------------------------------------- | ---------- | -------------------------------------------------- |
| A-28 | Named sale auto-prepares invoice specimen                                                   | PASS       | print_verify.py 14/14                              |
| A-29 | Invoice content: store, reference, buyer, device, IMEI1/2, accessories, DZD totals, payment | PASS       | print_verify.py DOM assertions                     |
| A-30 | Separate A4 warranty specimen linked to sale/item                                           | PASS       | print_verify.py                                    |
| A-31 | Print preview from POS and sale history                                                     | PASS       | print_verify.py reopen from SAV history            |
| A-32 | Reprint never mutates stock/cash/sales/debts/audit                                          | PASS       | print_verify.py 4 prints + reprints, zero mutation |
| A-33 | FR / AR-RTL / EN document presentation                                                      | PASS       | print_verify.py dir=rtl; locales documents.ts      |
| A-34 | SPECIMEN / TEST — NOT A FISCAL INVOICE banner                                               | PASS       | print_verify.py                                    |
| A-35 | Print styles and page breaks (@media print)                                                 | PASS       | print_verify.py CSS assertions                     |
| A-36 | Physical printer test                                                                       | NOT TESTED | hardware unavailable                               |

## Cross-cutting UI/QA

| ID   | Scenario                                        | Result                                           | Evidence                        |
| ---- | ----------------------------------------------- | ------------------------------------------------ | ------------------------------- |
| A-37 | All 19 routes render, no overflow, 1440/768/390 | PASS                                             | meeting.py; final_audit renders |
| A-38 | FR default, AR RTL, EN; Light/Dark              | PASS                                             | meeting.py 14/14                |
| A-39 | Per-control click audit (FR/AR/EN, 6 combos)    | PASS (previous 2,860/0 FAIL); re-run in progress | final_control_matrix.csv        |
| A-40 | Keyboard Tab/Shift+Tab/Escape/focus return      | PASS                                             | r11.py 28 checks                |
| A-41 | Reload persistence and deterministic Reset      | PASS                                             | flows.py reload assertions      |
| A-42 | No dead controls / false success                | PASS                                             | deadclicks.py; final_audit.py   |

## Deferred (owner-deferred, honestly not run)

| ID   | Scenario                                                             | Result     | Evidence                                            |
| ---- | -------------------------------------------------------------------- | ---------- | --------------------------------------------------- |
| A-43 | Real authentication / accounts                                       | BLOCKED    | hosting deferred; sign-in is disconnected interface |
| A-44 | Hosted authorization / D1 concurrency                                | BLOCKED    | no provisioning authorized                          |
| A-45 | Disaster recovery / backup-restore hosted                            | BLOCKED    | design only                                         |
| A-46 | Physical hardware (printer/scanner/drawer)                           | NOT TESTED | separate acceptance                                 |
| A-47 | Fiscal invoice issuance, tax, warranty terms, refunds, credit policy | BLOCKED    | OD-01..OD-18 OPEN                                   |
| A-48 | Cloudflare Workers/D1/R2 deployment                                  | BLOCKED    | source preserved, post-approval                     |
