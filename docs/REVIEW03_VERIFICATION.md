# Executive video correction — review 03

Verified 6 November 2026. Synthetic frontend only; no database connected or production transactions performed.

## Route defect: reproduced, diagnosed, corrected and retested

Cold route chunks under `/@oj-start/` were delayed by 3 seconds. Before correction `/cash` selected Cash navigation/breadcrumb while showing Executive overview for approximately 3 seconds. `/facility` reproduced the same mismatch across sequential delayed chunks. The router changed location before resolved content; the shell consumed the new location but retained old children. Shared shell now checks pending location versus resolved location and replaces stale children with destination loading content and destination title. Retest sampled every 250ms for 8 seconds: no old overview appeared, and both destinations resolved correctly. Same-path store changes do not unmount children. The original recording itself was not supplied; this is independent reproduction of its described observation.

## Implemented behavior

- POS: preserves scanner/cart quantity guards; typed Cash/Bank payment form, bank reference and exact allocation, fail-closed underpayment, exact cash change, reviewed/unposted session state, receipt seller attribution. M01 seller-attribution draft with reason; authenticated handoff remains blocked and M02 stays unresolved. Basket/customer/tender/seller changes invalidate reviewed payment.
- Cash: one drawer per store; opening, movement and blind closing drafts. Blind count is bound to selected drawer using read-only store plus validation. Expected balance omitted from count dialog and hidden on the underlying overview during counting; signed discrepancy after draft. Fixtures never close or change.
- Phones: structured intake now includes exact decimal sale price (not cost/tax policy), readback, global barcode conflict checking alongside serialized identity guards.
- Accessories: choose existing fixture SKU with immutable identity or create new SKU; collision validation; receiving quantity/reference drafts read back in Movements; fixture quantity remains unchanged.
- Shared forms: first invalid field focus, linked errors/hints, decimal input modes, read-only fields. Dialog Escape/focus behavior retained.
- Real CODE128 encoder plus rendered-image decoder; test value REVIEW099 decoded successfully. Catalog decorative labels replaced with same encoder/decoder. No hardware claim.

## Exact changed source/configuration files

- `src/components/erp/shell.tsx`
- `src/components/erp/pos.tsx`
- `src/components/erp/cash.tsx`
- `src/components/erp/inventory.tsx`
- `src/components/erp/operation-ui.tsx`
- `src/components/erp/receipt-preview.tsx`
- `src/components/erp/modules.tsx`
- `src/domain/operations.ts`
- `src/styles.css`
- `src/test/operations.test.tsx`
- `src/test/app-routing.test.tsx`
- `src/test/navigation-pending.test.tsx`
- `package.json`
- `bun.lock`
- `AGENTS.md`
- `roadmap.md`

## Direct navigation and refresh

19 actual content leaves, not 20. Each tested after correction: heading/title retained on refresh, active sidebar and breadcrumb match (POS badge excluded). Auth has no sidebar/breadcrumb by design. No page errors. All 19 leaf heads inspected for unique app-specific title, description, Open Graph title/description/type and Twitter card. No absolute cover images; image tags omitted.

| URL                  | Heading                | Direct / refresh    |
| -------------------- | ---------------------- | ------------------- |
| `/`                  | Executive overview.    | Verified / verified |
| `/pos`               | Point of sale.         | Verified / verified |
| `/cash`              | Cash registers.        | Verified / verified |
| `/stock/phones`      | Phones inventory.      | Verified / verified |
| `/stock/accessories` | Accessories inventory. | Verified / verified |
| `/catalog`           | Catalog & barcodes.    | Verified / verified |
| `/transfers`         | Inter-store transfers. | Verified / verified |
| `/customers`         | Customers.             | Verified / verified |
| `/debts`             | Customer debts.        | Verified / verified |
| `/suppliers`         | Suppliers.             | Verified / verified |
| `/purchases`         | Purchases & receipts.  | Verified / verified |
| `/expenses`          | Expenses.              | Verified / verified |
| `/facility`          | Facility agreements.   | Verified / verified |
| `/sav`               | Warranty & SAV.        | Verified / verified |
| `/reports`           | Financial reports.     | Verified / verified |
| `/users`             | Users & roles.         | Verified / verified |
| `/audit`             | Audit history.         | Verified / verified |
| `/settings`          | Workspace settings.    | Verified / verified |
| `/auth`              | Welcome back.          | Verified / verified |

## Automated commands and observed results

`bunx vitest run src/test/operations.test.tsx src/test/erp-domain.test.ts src/test/app-routing.test.tsx src/test/navigation-pending.test.tsx`

Final result: 4 files, 47 tests passed, 11:36:58 UTC. 28 named tests below plus 19 exact-leaf route cases. Two initial pending-navigation tests had whitespace-sensitive heading selectors; changed to behavioral assertions on stale child removal and busy state, reran successfully. No copy/style snapshots.

1. allows only one line quantity for a serialized phone
2. increments repeated accessory scans
3. keeps exact decimal amounts without whole-dinar rounding
4. filters synthetic M01 stock independently from M02
5. does not enable operational offline sales
6. leaves discounts unconfigured
7. keeps operational writes blocked
8. marks owner finance exclusive in frontend policy, not a security proof
9. uses only approved store labels
10. preserves phone sale prices as exact decimal strings
11. requires an explicit bank reference and exact allocation
12. blocks underpayments without inventing credit terms
13. calculates cash change without rounding
14. receives an existing SKU without allowing a conflicting new identity
15. keeps NEW/USED independent from box condition
16. rejects malformed and duplicate IMEI identities
17. accepts optional IMEI2 and rejects battery health beyond 100
18. rejects zero and fractional accessory receiving quantities
19. represents exactly one physical drawer per store without a daily shift cap
20. computes signed cash discrepancy without rounding
21. blocks official receipt issuance and hardware acceptance claims
22. rejects sold phone units from demo checkout
23. rejects a mixed-store basket and zero accessory stock
24. validates receiving form before delivering an isolated draft
25. never presents the old overview as cash content while the cash module downloads
26. never presents the old overview as facility content while the facility module downloads
27. renders resolved workspace children after navigation completes
28. matches a page for / instead of falling back to not found

Route parameterized test: `matches the exact leaf for %s`, one case for each of the 19 URLs above.

Browser commands:

- `python3 /tmp/browser/review03/check_workflows.py` — completed; no pageerrors; 26 workflow screenshots (45 images including route evidence). Valid/invalid phone intake, pricing/identity/barcode readback; existing SKU receiving +7 with fixture 20 unchanged; opening, cash-out, blind -0.01 discrepancy; repeated phone/accessory scans quantities 1/2; seller draft; customer/payment, underpayment rejection; 200000 minus 192600 = 7400 change and unposted draft readback.
- `python3 /tmp/browser/review03/check_transitions.py` — delayed route-chunk reproduction and retest, 250ms samples for 8 seconds; resolved Cash and Facility; no stale overview after fix.
- `python3 /tmp/browser/review03/check_all_routes.py` — 19 direct URLs and refreshes; no pageerrors. Initial badge mismatch in test normalized, not application defect.

Automatic platform check: latest inspected `build OK` 2026-11-06T11:37:02Z. No manual build/typecheck run.

## Evidence

Full forms: phone-intake-full.png, accessory-receiving-full.png, cash-opening-full.png, cash-movement-full.png, cash-blind-closing-full.png, pos-full.png, pos-payment-full.png, seller-attribution-full.png. Completed readback: phone-readback-decoded.png, accessory-movement-readback.png, cash-draft-readback.png, pos-unposted-readback.png. Light/Dark desktop at 1280×1800: overview, pos, cash, phones, accessories. Mobile 390×844: four operational pages, no document horizontal overflow (tables scroll intentionally). Raw JSON alongside gallery.

## Remaining limitations and technical debt

The requested starting correction and four workflow refinements are verified, not the complete ERP. Customers, debts, suppliers, purchases, expenses, transfers, facility, SAV, users and audit still use generic shared pages and need differentiated follow-up implementation; not silently marked complete. No production authentication/security/RLS, database financial integrity, concurrency/no-double-sale across terminals, persistence, offline reliability, bank settlement, transfers approval enforcement, official invoices, warranty or hardware integration tested. Owner confidential finance policy remains a frontend rule, not security certification. Cash count uses explicit total, not denomination worksheet; opening drafts do not open shifts, closing drafts do not close fixtures. Session drafts expire on navigation/reload. Seller draft is not a login or audit event. M02 hardware unresolved. No asynchronous backend network-failure testing. Existing-SKU defaults use synthetic fixture descriptions; final catalog normalization remains follow-up. All OD-01–OD-18 remain OPEN and original register unchanged. Backend release remains postponed by owner; all unapproved policies/issuance stay blocked.
