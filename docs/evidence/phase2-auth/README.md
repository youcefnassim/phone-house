# Phase 2.2b — sign-in screens, real-browser evidence (local only)

Captured 2026-11-10 with installed Google Chrome 157 (headless, driven by `puppeteer-core`) against the
production build served by `wrangler dev --env dev --local` (Miniflare D1, synthetic accounts only).
Script: `scripts/browser-check-auth.mjs`; pending sellers created with `scripts/dev-create-seller.sh`.
Run output: `browser-run.txt`. Server log: 0 uncaught exceptions, 0 crashes, no 5xx; the only 404s are the
brand-logo probe (`/assets/phonehouse-logo-original.svg|png`), because the owner's artwork is not in the repo.

| File                               | What it shows                                                                                |
| ---------------------------------- | -------------------------------------------------------------------------------------------- |
| fr-1-login                         | FR login                                                                                     |
| fr-2-change-password               | Forced change of the temporary password (first login on the shop PC)                         |
| fr-2b-password-policy-message      | Server policy refusal (password contains the seller's name)                                  |
| fr-3-set-pin                       | PIN setup right after the password change                                                    |
| fr-4-app-after-first-login         | ERP with the seller's name shown large, lands on the point of sale                           |
| fr-9-login-390px                   | FR login at 390 px, no horizontal scroll                                                     |
| ar-1-login / ar-2-login-error      | AR (RTL) login and the generic error                                                         |
| ar-3-owner-bar / ar-4-owner-alerts | Owner on the M01 PC; new-device security alerts                                              |
| ar-5-choose-seller                 | "تغيير البائع": sellers still on a temporary password are shown pending and cannot be chosen |
| ar-6-pin-pad                       | PIN pad for the chosen seller                                                                |
| ar-7-active-seller-karim           | Karim switched in by PIN; his name is shown large                                            |
| ar-8-dark-after-reload             | Dark mode after a reload: the session resumed from the HttpOnly cookie, Karim still active   |

Checks printed by the script: FR active name after first login; no "not connected" state; AR `dir=rtl`;
active seller after PIN; active seller after reload; no access token in browser storage; no overflow at 390 px.
This is local evidence only — not hosted, hardware or client acceptance.
