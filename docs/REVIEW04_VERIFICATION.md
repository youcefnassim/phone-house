# Executive Review 04 — business workflow development

## Verification status and source revision

These are local developer-run tests and browser observations, not independent certification. No backend, authentication, PostgreSQL transactions, security or production financial integrity claimed. Owner backend postponement and Antigravity separation preserved.

Observed managed commit: `dbe8a328de67db374e65d0050fc41997b7456ef2`. Starting review-03 source revision observed before this wave: `59f5cb84d3aa2b745d534039bc8ef761b56b4974`. `source-revision.json` records SHA256 for source/configuration files; commit may advance automatically. Export is evidence, not a source archive.

## Real implemented changes

- Customers: directory search; typed create/edit/profile drafts; contact/store/reference validation; synthetic purchase and receivable histories.
- Receivables: original sale/customer/store linkage, explicit due date and authorization reference, debt draft; partial repayment drafts/history; exact outstanding preview, overpayment rejection. Credit eligibility unconfigured.
- Suppliers: directory search, create/edit/contact/document drafts, purchase document history.
- Purchases: order drafts, quantity/document/date validation; serialized phone receiving with duplicate identity rejection; accessory batch receiving; received draft quantities and history. Operational purchasing contracts contain no cost/obligation/payment fields. Separate dynamically imported Super Admin synthetic projection supplies confidential cost, explicit obligations and payment drafts/history. Seller and Manager contracts tested for exact keys. Role preview is not security.
- Expenses: category drafts and explicit store/amount/tender/date/document entries; history; approval thresholds/accounting treatment unconfigured. No cash movement.
- Transfers: DRAFT → APPROVALS → DISPATCH → IN_TRANSIT → RECEIPT → COMPLETED session simulation. Super Admin and M02-scoped Manager approval drafts independently required. Serialized phones and SKU quantities; expected barcode/IMEI receipt scans; excess/unexpected discrepancy reporting, acknowledgement draft, partial receipt block and history. Destination stock never changes, including simulated completion.
- M01 facilities: customer/employer/contract references, explicit contract price/month count/monthly amount, contract-specific schedule, salary deduction versus bank remittance evidence/history, missing and partial/delayed states. Explicit schedule must match explicit contract price; no formula or rounding guessed. M02 unavailable. Bank confirmation blocked; drawer impact none.
- SAV: original sold phone/customer/store linkage; inspection/repair/return/exchange/refund requests, status/history/document references; cumulative refund draft amount with original-sale cap; evidence file metadata. No legal eligibility or refund execution.
- Every business page includes loading, empty, error/retry and forbidden preview controls. Scope/role changes cancel obsolete demo reads. Read snapshots cloned; fixture balances unchanged. Existing dashboard/POS/cash/inventory/shell source untouched in this wave.

## Changed source paths

- `src/domain/business.ts`
- `src/data/business-demo.ts`
- `src/data/business-owner-demo.ts`
- `src/components/erp/business-ui.tsx`
- `src/components/erp/customers-debts.tsx`
- `src/components/erp/suppliers-purchases.tsx`
- `src/components/erp/expenses-business.tsx`
- `src/components/erp/transfers-business.tsx`
- `src/components/erp/facility-business.tsx`
- `src/components/erp/service-business.tsx`
- `src/styles.css`
- `src/test/business-domain.test.ts`
- `src/test/business-forms.test.tsx`
- `src/routes/customers.tsx`
- `src/routes/debts.tsx`
- `src/routes/suppliers.tsx`
- `src/routes/purchases.tsx`
- `src/routes/expenses.tsx`
- `src/routes/transfers.tsx`
- `src/routes/facility.tsx`
- `src/routes/sav.tsx`
- `AGENTS.md`
- `roadmap.md`

## Automated tests

Command: `bunx vitest run src/test/business-domain.test.ts src/test/business-forms.test.tsx src/test/operations.test.tsx src/test/erp-domain.test.ts src/test/app-routing.test.tsx src/test/navigation-pending.test.tsx`
Final observed: **6 files / 71 tests passed**, 2026-11-06 11:54:38 UTC. Exact console output in `test-results.txt`. Initial malformed amount tests exposed throwing refinement; guarded parsing fixed. A schedule year narrowing and heterogeneous test-schema type error were corrected; final automatic check `build OK` 2026-11-06T11:55:44Z. No manual builds/typechecks run (platform checks them).

Exact test names by file:

### src/test/business-domain.test.ts

- restricts owner finance preview to Super Admin
- requires M02 Manager scope for the second transfer approval
- requires customer contact and preserves approved store identifiers
- requires explicit debt authorization and a valid due date without credit defaults
- computes partial repayments exactly and rejects repayment above outstanding
- requires serialized one-unit phone receipt and rejects duplicate identities
- rejects accessory receiving above ordered quantity
- leaves expense approvals unconfigured and rejects malformed expense amounts
- requires both Super Admin and M02 Manager transfer approvals
- blocks partial transfer receipt and validates every serialized and SKU unit
- blocks unexpected and excess receipt scans with discrepancies
- allows M01-only facilities with explicit contract-specific months and bank settlement
- leaves warranty and refund eligibility unconfigured while validating refund draft amounts
- isolates store debts and leaves fixtures unchanged after reads
- supports explicit empty and failure read states
- omits purchase financial fields from SELLER operational contracts
- omits purchase financial fields from MANAGER operational contracts

### src/test/business-forms.test.tsx

- Customer rejects empty submission and delivers validated values only
- Debt rejects empty submission and delivers validated values only
- Supplier rejects empty submission and delivers validated values only
- Purchase rejects empty submission and delivers validated values only
- Expense rejects empty submission and delivers validated values only
- Facility rejects empty submission and delivers validated values only
- Service rejects empty submission and delivers validated values only

### src/test/operations.test.tsx

- preserves phone sale prices as exact decimal strings
- requires an explicit bank reference and exact allocation
- blocks underpayments without inventing credit terms
- calculates cash change without rounding
- receives an existing SKU without allowing a conflicting new identity
- keeps NEW/USED independent from box condition
- rejects malformed and duplicate IMEI identities
- accepts optional IMEI2 and rejects battery health beyond 100
- rejects zero and fractional accessory receiving quantities
- represents exactly one physical drawer per store without a daily shift cap
- computes signed cash discrepancy without rounding
- blocks official receipt issuance and hardware acceptance claims
- rejects sold phone units from demo checkout
- rejects a mixed-store basket and zero accessory stock
- validates receiving form before delivering an isolated draft

### src/test/erp-domain.test.ts

- allows only one line quantity for a serialized phone
- increments repeated accessory scans
- keeps exact decimal amounts without whole-dinar rounding
- filters synthetic M01 stock independently from M02
- does not enable operational offline sales
- leaves discounts unconfigured
- keeps operational writes blocked
- marks owner finance exclusive in frontend policy, not a security proof
- uses only approved store labels

### src/test/app-routing.test.tsx

- matches a page for / instead of falling back to not found
- matches the exact leaf for /, /pos, /cash, /stock/phones, /stock/accessories, /catalog, /transfers, /customers, /debts, /suppliers, /purchases, /expenses, /facility, /sav, /reports, /users, /audit, /settings, /auth (19 individual cases)

### src/test/navigation-pending.test.tsx

- never presents the old overview as cash content while the cash module downloads
- never presents the old overview as facility content while the facility module downloads
- renders resolved workspace children after navigation completes

## Browser observations

- `python3 /tmp/browser/review04/check_business.py`: eight business page workflows completed, zero pageerrors, 76 screenshots. Customer empty validation/create/edit; debt linked draft and 100.01 partial repayment, 27899.99 outstanding; supplier draft; order/phone duplicate block/phone receive/accessory +7 batch; owner-only unit cost and supplier payment outstanding 159899.99; expense category/entry; all six transfer draft stages, both approvals, unexpected scan and partial block then complete expected scans; 3-month facility at 100.01, explicit 300.03 price, separate salary 100.01 and bank 50 draft, M02 block; exchange case/history/refund 100.01/evidence file metadata. Expense assertion initially matched combined table-cell text incorrectly; switched to row text, no product change required.
- All eight pages: Light/Dark desktop screenshots, 390×844 mobile without document overflow, Loading/Empty/Error/Forbidden state screenshots. Tables intentionally horizontally scroll. Failure/retry control present; no real network outage or permission enforcement.
- `python3 /tmp/browser/review04-navigation/run.py`: actual 3-second route chunk delays; no stale overview in Cash/Facility; rapid switch to POS, back/forward, direct routes and refresh. Breadcrumb/active nav match; zero page errors. Background local investigator, not external audit.
- Existing workflows rerun: `python3 /tmp/browser/review03/check_workflows.py`, zero errors; 47 original tests still passing within 71 total. `python3 /tmp/browser/review03/check_all_routes.py`: all 19 direct-navigation and refresh checks passed, zero pageerrors. All 19 leaf metadata sets inspected.

## Exported review 03

Archive contains the readable original report, full gallery HTML, screenshots and raw evidence, with revision context. Original review03 folder was refreshed during regression checks; some direct-route screenshots now show newer business pages. It is not an immutable historical snapshot; this limitation is stated rather than inventing a historical revision. Original reported 47-test command/results/names retained in REVIEW03_VERIFICATION.md; current source manifest separately supplied.

## Blocked, untested and technical debt

- BLOCKED: database/authenticated identity/production posting, security/RLS/restore/offline release (owner postponement); credit eligibility OD-12; discount/tax/financial/accounting rules OD-05/07/14; warranty/return/refund eligibility OD-08; legal issuance OD-01/09/10; actual bank reconciliation OD-13; unsupported partial/mismatched transfer receipt OD-11. All original OD decisions remain OPEN.
- UNTESTED: independent audit, physical scanners/printers, bank imports/APIs, production concurrency/no-double-sale, actual access control, persistent document upload, offline financial reliability. Passing frontend tests do not validate these.
- Session business data does not cross module boundaries: customer/supplier drafts are scoped to their page; fixture histories are synthetic. Future shared transaction/query cache integration remains needed; no backend seeded or connected.
- Attachments retain filename/size/type only; contents neither uploaded nor persisted. Supplier finance drafts disappear when panel unmounts. Expense category approval is not taxonomy sign-off. Transfer audit text is not immutable audit; discrepancy acknowledgement is not stock resolution. Facilities currently use an explicit uniform monthly schedule, not variable installment editing or universal financing policy. SAV exchange replacement selection/execution awaits approved policy. Catalog/users/audit remain earlier generic interfaces; official documents and production finishing remain future work.
- Role preview permits inspecting synthetic owner data without authentication and is not a security boundary. Operational contracts exclude fields, but real protection requires authenticated server projections and RLS in later integration.
