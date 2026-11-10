# Native frontend parity acceptance — 2026-11-07

Scope of this wave: close the highest-priority native read-parity gaps (customers,
sales history, cash ledger) with typed D1 projections, a fail-closed client adapter
and real local SQLite verification. No hosting, no provider connection, no owner
data reset, no Antigravity access.

## Implemented this wave

- `src/domain/native-history.ts` — strict DTOs: customer search/history, sales
  history (period/IMEI/customer/seller/tender filters, Africa/Algiers day bounds),
  cash ledger (shifts + immutable closure/review state + movements).
- `src/backend/sqlite/service.ts` — `customerSearch`, `customerHistory`,
  `salesHistory`, `cashLedger`: authenticate + authorize precheck plus a final
  in-query authorization gate (revoked session mid-flight returns zero rows),
  own-store scope, cost-free projections (no cost/margin/profit fields).
- `src/backend/native-api.ts` — routes `customers/search`, `customers/history`,
  `sales/history`, `cash/ledger` (POST, same-origin, bearer, existing guards).
- `src/data/native-repository.ts` — typed adapter methods; fail closed on
  NOT_CONNECTED / unverified / synthetic transport; PROJECTION_SCOPE_MISMATCH on
  cross-store or wrong-customer responses. Never falls back to local pretend data.
- `src/domain/sales-review.ts` — `normalizedBuyer` now folds accents/diacritics
  and Arabic tatweel in addition to case/whitespace (shared by local workspace
  and native checkout dedup; genuinely different names stay distinct).

## Verification (all run this wave)

- `bunx vitest run src/test/native-history.test.ts` — 7/7 PASS: scoped customer
  search (name/reference/accent-insensitive key), customer purchase history with
  IMEI lines, sales-history filters (period, IMEI, seller, customer, tender,
  pagination hasMore), cash ledger with PENDING/FLAGGED review state, revoked-
  session mid-flight denial, API roundtrip 200, adapter scope-mismatch and
  NOT_CONNECTED/FORBIDDEN propagation, normalized-key folding.
- `bunx vitest run` (full suite) — 515/515 PASS (41 files), baseline 508 preserved.
- `bun run lint` — 0 errors; 13 pre-existing react-refresh warnings in base
  shadcn ui components (unchanged by this wave).
- `oj typecheck -b --noEmit` — clean.
- `bun run build` — production build OK; harness build log: build OK.
- Browser smoke (isolated context, 1440px): dashboard, POS, sales history render
  with zero page errors. Evidence: `docs/evidence/native-frontend-parity/`
  (smoke.py + screenshots).

## Per-area status matrix

| Area | UI wired | Native source wired | Local DB tested | Owner policy blocked | Hosted |
|---|---|---|---|---|---|
| POS search (phone/accessory) | yes (local) | yes | yes | — | NOT RUN |
| Customer search/history | yes (local) | yes (this wave) | yes | — | NOT RUN |
| Sales history filters | yes (local) | yes (this wave) | yes | — | NOT RUN |
| Cash ledger/close/review | yes (local) | yes (this wave) | yes | — | NOT RUN |
| Atomic checkout (buyer/warranty/receipt/cash) | yes (local) | yes | yes | credit/discount (OD-05/12) | NOT RUN |
| Receiving + supplier provenance | yes (local) | yes | yes | — | NOT RUN |
| Transfers dual approval | yes (local) | command source | partial | — | NOT RUN |
| SAV / refunds | yes (local) | command source | partial | refund posting | NOT RUN |
| Debts/facility/expenses/reports | yes (local) | read models + commands | partial | unapproved postings | NOT RUN |
| Documents (private R2) | specimen only | staged finalize source | yes | official issuance (OD-01/09) | NOT RUN |

## Remaining gaps (next wave)

- Frontend pages still read the local IndexedDB workspace by default; the native
  adapter is configured-only and fails closed until an approved host exists.
  Per-page switching to native reads is intentionally not enabled.
- Transfers/SAV/debts native command coverage is partial (command planner source
  exists; end-to-end D1 flows not all tested).
- `src/backend/worker.ts` standalone Worker entrypoint remains unconfigured
  (no approved host, identity provider, D1/R2 bindings).
- Official Phone House logo asset still absent; shell shows an explicit
  temporary placeholder. Awaiting the original 549x147 PNG upload.
- Hosted Workers/D1/R2/Auth: NOT CONNECTED, NOT TESTED — requires
  resource-specific owner authorization.
