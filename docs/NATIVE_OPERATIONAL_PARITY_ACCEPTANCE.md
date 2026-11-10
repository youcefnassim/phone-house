# Native operational parity acceptance — 2026-11-08

Scope: end-to-end native D1 workflow parity for transfers, SAV, debts/facility/
expenses, standalone supplier provenance corrections, typed adapter parity and a
locally tested Worker entrypoint. No hosting, no provider connection, no owner
data reset, no Antigravity access. Frontend still runs on the local IndexedDB
workspace; the native adapter stays configured-only and fails closed.

## Implemented this wave

- `db/sqlite/0008_supplier_name_keys.sql` — additive nullable `name_key` on
  suppliers (accent/case/whitespace/Arabic-tatweel folded dedup key). Existing
  rows keep NULL and stay matched via `lower(trim(name))`; nothing rewritten.
- `src/backend/sqlite/standalone-receiving.ts` — quick-add supplier dedup now
  matches on the folded `name_key` (plus legacy raw match), so
  "Société Câbles" and "  SOCIETE   CABLES " resolve to one supplier while
  genuinely different names never merge.
- `src/backend/sqlite/supplier-provenance.ts` — `correctStandalone`: owner-only,
  append-only provenance correction for standalone receipts
  (`standalone_source_reviews`: old/new supplier, actor, time, mandatory
  reason). Original receipt rows stay immutable (APPEND_ONLY triggers);
  cross-store supplier or receipt is rejected.
- `src/domain/native-operations.ts` — strict cost-free DTOs: transfer detail
  (lines, dual approvals, dispatch/receipt evidence), SAV cases with
  append-only events, debts with repayment drafts, M01-only facility with
  installments and UNVERIFIED bank evidence, expense drafts, standalone
  correction command.
- `src/backend/sqlite/service.ts` — `transferDetail`, `savCases`, `debtList`,
  `facilityList`, `expenseList`: authenticate + authorize precheck plus final
  in-query authorization gate; expenses owner/manager only; facility hard-bound
  to M01; all projections cost-free.
- `src/backend/native-api.ts` — routes `transfers/detail`, `sav/cases`,
  `debts/list`, `facility/list`, `expenses/list`,
  `suppliers/correct-standalone` (POST, same-origin, bearer, existing guards).
- `src/data/native-repository.ts` — typed adapter methods for all six; fail
  closed on NOT_CONNECTED / unverified / synthetic transport;
  PROJECTION_SCOPE_MISMATCH on cross-store or wrong-transfer responses;
  correction result must match the request key. No local fallback.

## Verification (all run this wave)

- `bunx vitest run src/test/native-operations.test.ts` — 7/7 PASS:
  - Transfer E2E: M01 seller create → owner approve → M02 manager approve →
    scanned dispatch → M02 scanned receipt → phone AVAILABLE at M02, accessory
    5→3/0→2 exactly once, stage COMPLETED.
  - Negatives: M01 seller approval rejected; wrong-code scan rejected at scan
    time; dispatch blocked while scans missing; double dispatch rejected;
    dispatcher cannot self-receive; same-key replay returns the original
    result; altered payload on the same key is OUTCOME_UNKNOWN.
  - SAV: open on real sold phone + IMEI, append-only event, scoped read by
    IMEI, M02 manager denied on M01, cross-store open rejected, refund review
    stays POLICY_BLOCKED.
  - Debts/facility/expenses: debt POLICY_BLOCKED + repayment DRAFT with
    separated amounts; facility draft M01 ok, M02 payload rejected before SQL;
    expense draft POLICY_BLOCKED; seller expense read FORBIDDEN; all reads
    cost-free.
  - Standalone correction: owner-only, chains old→new across two corrections,
    original receipt row unchanged, unknown/cross-store supplier rejected.
  - Supplier dedup: accent/case/whitespace variants merge to one supplier;
    both receipts keep their own provenance rows.
  - Adapter: scope mismatch, NOT_CONNECTED, FORBIDDEN and key-mismatch
    OUTCOME_UNKNOWN propagation.
- `bunx vitest run src/test/native-worker.test.ts` — 2/2 PASS: NOT_CONFIGURED
  without bindings, HOST_REJECTED, ORIGIN_REJECTED, RATE_LIMITED,
  RATE_LIMIT_UNAVAILABLE (no local limiter substitute); real Miniflare/workerd
  D1 roundtrip with an ES256-signed JWT: anonymous status unverified, signed
  status verified with GLOBAL/SUPER_ADMIN membership, forged-key token denied,
  authenticated `read` route returns Magasin 1 (M01) settings row.
- `bunx vitest run` (full suite) — 524/524 PASS (43 files); baseline 515
  preserved plus 9 new tests.
- `bun run lint` — 0 errors (13 pre-existing react-refresh warnings in base
  shadcn ui components, unchanged).
- `oj typecheck -b --noEmit` — clean.
- `bun run build` — production build OK; harness build log: build OK.

## Per-area status matrix

| Area | UI wired | Native source | Local DB tested | Owner policy blocked | Hosted |
|---|---|---|---|---|---|
| Transfers dual approval + scans | yes (local) | yes | yes (E2E + negatives) | partial/mismatched handling (OD-11) | NOT RUN |
| SAV cases + events | yes (local) | yes | yes | refund/exchange (OD-08/09) | NOT RUN |
| Debts / repayments | yes (local) | yes | yes | credit posting (OD-12/13) | NOT RUN |
| Facility (M01, bank only) | yes (local) | yes | yes | settlement terms (OD-12/13) | NOT RUN |
| Expenses | yes (local) | yes | yes | categories/profit (OD-14) | NOT RUN |
| Supplier provenance corrections | yes (local) | yes (+ standalone) | yes | — | NOT RUN |
| Worker entrypoint | — | yes | yes (local D1 + JWT) | — | NOT RUN |

## Remaining gaps

- Frontend pages still read the local IndexedDB workspace by default; per-page
  native activation is intentionally off until an approved host + identity
  provider exist.
- Worker is source-complete and locally tested but unconfigured: no public
  host, secrets, R2 binding or identity provider. Hosted Workers/D1/R2/Auth:
  NOT CONNECTED, NOT TESTED — requires resource-specific owner authorization.
- Official Phone House logo asset still absent; shell keeps the explicit
  temporary placeholder. Awaiting the original PNG upload.
- OD-01..OD-18 remain OPEN; unapproved postings stay blocked/draft.
