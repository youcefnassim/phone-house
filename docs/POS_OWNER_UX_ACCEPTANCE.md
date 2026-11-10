# Owner checkout UX clarification — 7 November 2026

## Implemented, local browser workspace

- Customers removed from daily navigation only; retained under advanced management, same route and records.
- Accessory-only cash/bank: scan/select, quantity, payment, confirm; no buyer or warranty section, anonymous WALK-IN.
- Phone/mixed: inline required surname/given name, optional contact, existing customer search and reuse. New buyer is staged without a write until the sale passes validation. Customer, stock, cash and sale use the same workspace/session IndexedDB write. This is local consistency, not cross-device authoritative security.
- No warranty preselected in checkout. Explicit NO prevents certificate; YES offers 1, 3, 6, 12 whole months, all user choices rather than entitlement. Dates derive from the actual sale timestamp in Africa/Algiers with last-day month clamping. Terms remain DRAFT_PENDING, never active/expired coverage. Legacy explicit free-text date/duration requests are retained unchanged for compatibility; older command callers omitting choices retain their historical no-warranty behavior.
- Confirmation opens the invoice specimen with buyer, payment, cash received and change, plus eligible warranty specimen in the same dialog. Documents/history/reprints are read-only projections. Requested duration now shows its month unit.

## Verified

- Full Vitest: 34 files, **463 PASS, 0 FAIL** (prior 453 retained plus 10 new scenarios).
- Multilingual browser suite: **51 PASS**, EN Light 1440 M01, FR Dark 768 M02, AR RTL Dark 390 M01 second seller: receiving through customer, POS, cash, invoice/warranty, reload, customer history, scanner fallback and own-store rejection.
- Distinct browser scenarios: **74 PASS**, anonymous cash/bank accessories, new client with YES 1/3/12 months, existing customer NO, mixed cart missing-buyer rejection, normalized duplicate rejection/reuse, history and pure reprints.
- Total: **125 browser assertions PASS**, fresh synthetic contexts only. Screenshots and reproducible scripts: `docs/evidence/pos-cash-secure/owner-ux/`.
- Harness build/typecheck: build OK after correcting strict indexed-array narrowing.

## Not implemented / not run

- Native SQLite checkout still requires an existing customer ID; atomic inline creation/contact/month-based warranty persistence in the inactive native adapter remains incomplete. No frontend fallback claims otherwise; local workspace is the only active adapter.
- No hosted Cloudflare Worker/D1/R2 connection, provisioning, deployment, external identity provider, live postings or legal issuance. Lovable app deployment to Cloudflare is unsupported; independent approved host wiring is still required.
- Physical printer/camera/USB scanner, cross-device concurrency and hosted security acceptance NOT RUN.
- OD-01 through OD-18 remain unchanged/open. No owner workspace reset, reseed, record deletion, historical rewrite or Antigravity access.
