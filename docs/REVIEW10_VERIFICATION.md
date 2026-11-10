# Review 10 — Shared test workflows + language/UX acceptance

Base revision verified before edits: `b822b6f`. Browser-local TEST workspace only (IndexedDB, fixture `TW-2026.11-r3`). No Cloud, database, migration, deployment, real auth or posting.

## Code

- `src/data/test-workflows.ts` (new): transfers (DRAFT→APPROVALS→DISPATCH→IN_TRANSIT→RECEIPT→COMPLETED, identity-attributed preview approvals, full-scan completion, partial blocked), POS credit-request drafts, checked debt/repayment drafts, M01 facility contracts + separate salary-deduction / bank-remittance evidence (bank requires evidence file, per-month cap, never touches cash), SAV cases linked to real sold units, service events, capped refund reviews, attachment metadata.
- `src/data/test-workspace.ts`: transfers in persisted state, revision r3, shared mutators.
- `src/data/session-store.ts`: attachments collection, `updateDraft`.
- `src/data/business-demo.ts`: test sales projected as sale references.
- UI: `transfers-business.tsx`, `facility-business.tsx`, `service-business.tsx` rewritten on the shared store; `customers-debts.tsx`, `pos.tsx` (credit request draft), `operation-ui.tsx` (domain errors shown inline), `business-ui.tsx` (live re-read).
- i18n: `src/locales/flows.ts`, `messages.ts` (domain errors), `display.ts` (`displayText` for seeded fixture text); users/catalog/audit/reports/expenses headers and fixture text.
- CSS: table-cell layout for LTR cells in RTL, `.form-label` inputs.

## Results

| Check                                               | Result                                                                    |
| --------------------------------------------------- | ------------------------------------------------------------------------- |
| Typecheck (`tsgo -b --noEmit`)                      | PASS                                                                      |
| Vitest                                              | 176/176 PASS (166 baseline + 10 new in `src/test/test-workflows.test.ts`) |
| Browser E2E (`evidence/review10/flows.py`)          | 17/17 PASS, records read back from IndexedDB after reload                 |
| Route matrix 18 × fr/ar/en × light/dark at 1440×900 | 108 screenshots captured, 0 page errors                                   |
| AR 390×844 / 768×1024 transfer dialog + SAV         | no horizontal overflow                                                    |
| Previous 31 browser results                         | NOT RE-RUN (script not retained)                                          |
| Keyboard focus trap per dialog                      | NOT RUN                                                                   |
| Database / RLS / atomic posting / offline           | BLOCKED (no authorization)                                                |

Remaining FR/AR leak scan items are technical codes (DEMO-C001, TPL-RECEIPT) plus session-generated audit action text, which is still English.
