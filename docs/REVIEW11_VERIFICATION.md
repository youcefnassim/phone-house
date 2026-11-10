# Review 11 verification (browser-local TEST workspace only)

Base commit: 0a1d147 (confirmed). No Cloud/database/migration/deployment/real accounts. Antigravity untouched.

## Fixed

- Debt figures split (`debtFigures` in `src/data/test-workflows.ts`): obligation (recorded vs draft-only), confirmed repayments recorded, unposted repayment drafts (not collected), outstanding on confirmed records, projected remaining. Drafts never count as collected money. Shown on Debts list/stats/detail and customer profile in en/fr/ar.
- `saveCreditRequestDraft` now uses pure `priceTestBasket` (stock-validated, no fake tender).
- Transfer vs POS conflict: `transferConflicts`, `transfersListing`, `revalidateTestTransfer`. Conflict badge + alert, advance/approval refused, explicit revalidation removes unavailable lines and clears stale approvals (back to DRAFT). POS shows a hint for basket items listed on undispatched transfers. No reservation policy invented; dispatch refusal kept.
- Audit actions/areas localized via `src/locales/audit-actions.ts` (raw codes stay stored).
- Dialog focus return: controlled dialogs restore focus to the opener on close (was falling to <body>).
- Cash amount input had an English-only `aria-label="amount"` overriding the localized label; removed.
- Credit-draft upfront field relabeled as "stated, not collected" (en/fr/ar).

## Results

- Vitest: 184/184 PASS (176 baseline + 8 in `src/test/review11.test.ts`).
- Browser (`docs/evidence/review11/r11.py`, `results.json`): 31 PASS / 0 FAIL / 0 SKIPPED, records read back from IndexedDB after reload.
  Includes 12 keyboard checks (Tab/Shift+Tab trap, Escape, focus return) at 1440×900, 768×1024, 390×844 on customers/transfers/debts dialogs and POS review.
- First run found 6 FAIL: 2 script issues (number format, blind-close label), reset confirm handler, and 3 real defects (focus return, POS keyboard check, English aria-label) — fixed, rerun green.
- Build OK.

## Not proven

- English-leak check is a word-list heuristic, not full translation proof. Nested dialog text in all 108 route/theme/locale cells was not exhaustively screenshotted.
- Facility/SAV flows not re-run in browser this round (covered by Vitest and Review10 run).
- No database, RLS, server posting, multi-device or offline behavior tested — none exists.
