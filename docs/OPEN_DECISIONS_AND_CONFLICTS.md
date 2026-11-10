# OPEN DECISIONS, CONFLICTS AND BLOCKERS — DO NOT INVENT ANSWERS

A decision below remains **OPEN** unless the owner expressly approves it later. A safe implementation may expose a setting as 'not configured' or block restricted transactions; never invent commercial values.

| ID (local to this pack) | Question                                                                                       | Why important                       | Safe interim rule                                             |
| ----------------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------- | ------------------------------------------------------------- |
| OD-01                   | Official full trading/legal business name, address, fiscal identifiers and invoice compliance? | A4 documents and tax reporting      | Use placeholders; no official invoice issuance                |
| OD-02                   | Original master logo vector/transparent image?                                                 | Brand correctness and printing      | 'PH' placeholder only, never redraw original                  |
| OD-03                   | Actual labels for stores beyond M01/M02?                                                       | UI and printed paperwork            | ONLY 'Magasin 1 (M01)' and 'Magasin 2 (M02)'                  |
| OD-04                   | Count of PCs / scanners at M02?                                                                | Offline concurrency / terminal role | Do not assume M01 hardware layout at M02                      |
| OD-05                   | Seller default discount limit, thresholds, approval scope per store/category?                  | Financial risk                      | No unapproved 5%/3,000 DZD; manager override/fail-closed      |
| OD-06                   | Owner's unclear additional Super Admin-only search/input area?                                 | Intake/owner UX                     | Do NOT invent its meaning                                     |
| OD-07                   | Unclear phone-intake tax option (purpose, tax type, rate and when)?                            | Legal and calculation               | No guessed tax toggle/rate                                    |
| OD-08                   | Official warranties, periods, conditions, exclusions and returns rules?                        | Customer obligations                | Provisional test docs only; no universal 12-month term        |
| OD-09                   | Exact invoice & warranty layout approval, numbering, receipt policy and signatures?            | Documents                           | Keep template drafts blocked pending formal owner sign-off    |
| OD-10                   | Real receipt printer models, barcode printer, label dimensions and scanners?                   | Hardware acceptance                 | Prove browser rendering; do not claim device integration      |
| OD-11                   | Transfer packing, dispatch, partial/mismatch receipt and reverse workflow?                     | Stock integrity                     | Track distinct states; block unsupported partial receipt      |
| OD-12                   | User credit eligibility, ceiling, due dates, collection practice?                              | Receivables                         | Record only explicit authorized arrangements                  |
| OD-13                   | Public-sector convention partner details, settlement bank statement import and roles?          | Facility reconciliation             | Manual audited bank confirmation; no invented API             |
| OD-14                   | Financial operating expense taxonomy; treatment of accruals, taxes and inventory costs?        | Profit accuracy                     | Mark incomplete margins/profit provisional                    |
| OD-15                   | Zakat calculation valuation and religious interpretation?                                      | Correctness                         | Preparatory worksheet with transparent data only              |
| OD-16                   | Hosting, backups, recovery point/time objectives, maintenance ownership?                       | Go-live                             | Separate deployment plan and tested restore                   |
| OD-17                   | Inventory adjustment roles and approval thresholds?                                            | Shrinkage / fraud                   | Least privilege and audited adjustments                       |
| OD-18                   | Offline device/security design: offline auth windows, receipt wording, conflict owner?         | Safety during outages               | Pending state, limited privilege and explicit conflict policy |

## Important document conflicts

1. Older agent reports labeled stores 'Centre' and 'Bab El Assa'; **OWNER REJECTED** both on 5 November 2026. Never repeat.
2. Old summary claimed one drawer shift per day; **NOT owner-confirmed**; one physical drawer per store is binding.
3. Earlier summary claimed all sales and backups production verified; independent V2 audit found major deficiencies. Never assume agent's PASS implies certification.
4. `O-015` identifier is overloaded in different older documents (deployment vs tax option). **Use the OD identifiers in this pack for clarity**, do not silently rewrite older historical logs.
5. Agent examples: 10-payment facility and 12-month generic warranty were test fixtures/unapproved; facility must support **contract-specific months**, warranty period owner TBD.
6. Product names/seed catalog may be illustrative; users must be able to add actual new products/brands/variants; demo brands not evidence of official full catalog.
7. Latest Antigravity screenshot-related correction has a **sent prompt but no returned verified result**. Do not describe that work as completed.
8. The latest source archive independently audited was the old Antigravity **V2**. The later 14/14 stock acceptance result is an Antigravity report, not an independent source test.

## How to progress without blocking all work

Build verified generic infrastructure and UI for approved processes, with explicit empty fields and configurable business policy where owner approval is missing. Do **not** silently freeze the whole project for nonblocking unknowns. However, do **block issuance or transactions that would be legally/financially unsafe** if the relevant mandatory information is absent. Escalate blocking decisions clearly and only at the appropriate workflow stage.
