# Final native adapter readiness — 2026-11-08

## Verdict

**A cohesive adapter/readiness subset is implemented and locally verified; the
whole platform is NOT yet ready for full daily native page activation.**
The running frontend remains the existing IndexedDB workspace. No owner data,
identity provider, hosted resource, deployment, publishing setting or Antigravity
project was accessed. There is no cashier production toggle and no native-error
fallback to local records.

## Implemented in this wave

- `/sales` is now an exact native route mapping rather than an overview fallback.
  Unknown native paths cannot resolve to dashboard reads or commands.
- Receiving, supplier selector and immutable sale specimen now have real HTTP
  adapter methods. Receipt DTOs are strict, cost-free and sale/store-bound.
  Lost/malformed receiving responses retain the original unknown-outcome key.
  Checkout has dedicated same-key outcome readback, distinct from generic commands.
- Generic page reads reject foreign store rows and request/response pagination
  mismatches. Native pages do not start reads with unverified identity.
- Trusted source activation prerequisites require owner approval, verified
  environment, verified schema and provider configuration, then actual verified
  status. Every operation rechecks status. Production provider injection without
  these prerequisites is disconnected. Evidence flags are **not independent
  hosted attestation**; a real host must supply/verify them, never browser settings.
- Supplier selector and receipt SQL include final account/session/membership gates
  to prevent mid-request revocation from yielding sensitive readback.
- SQLite test harness applies identity migration 0004 once, matching D1 inventory;
  JWT tests no longer independently apply it a second time.
- Original-logo slot `/assets/phonehouse-logo-original.png` is used unchanged in
  sidebar/sign-in if a valid image loads. Missing asset retains PH placeholder.
  No PNG was fabricated. Browser test intercepts a plain non-logo test bitmap;
  actual original artwork, favicon and print variants remain pending.

## Exact verification

- Full Vitest: **537 PASS, 44 files**, baseline 524 preserved.
- Lint: **0 errors**, 13 existing shadcn React-refresh warnings.
- Harness strict TypeScript/production build: latest **build OK** after correcting
  an exact-optional-property typing error. No manual project build/typecheck run;
  the harness executes these gates automatically.
- Local signed-ES256 Worker + actual Miniflare/workerd D1 through the same browser
  HTTP transport/repository: **5 integrated tests PASS**, not fake response adapters.
  Both stores' registered read routes, owner/seller/manager scope, revoked session,
  denied finance/staff, M01 receiving → phone scan → buyer/warranty cash sale →
  customer/history/cash/specimen readback, repeated checkout/reprint, conflicting
  receiving payload and attempted oversell are exercised. M02 anonymous accessory
  bank checkout produces no customer, warranty or cash movement and zero stock.
- Browser local frontend: **122 assertions PASS**, fresh isolated contexts,
  FR 1440 / EN 768 / AR RTL 390, Light/Dark, dashboard/POS/sales/settings and return
  navigation, nonblank heading, no page errors, no horizontal overflow; logo slot
  loading verified with intercepted non-logo bitmap. This is smoke coverage, not
  recertification of every earlier workflow or every route/control.
- Additive legacy migration: original supplier id/store/name/reference checksum
  unchanged through 0008; absent name key stays NULL. Scoped logical supplier
  export/restore into a second isolated migrated D1 passes checksum and foreign-key
  checks. **Not a complete D1 backup/export utility or hosted restore test.**

Evidence: `docs/evidence/final-native-adapter/`; executable signed local harness:
`src/test/local-d1-adapter-harness.ts`, scenarios:
`src/test/native-adapter-readiness.test.ts`. No browser tokens stored.

## Per-route wiring matrix

Every row below has local IndexedDB daily UI retained; native `read` was called
through the HTTP frontend adapter → Worker → real local D1 at M01 and M02.
Many read checks are empty authorized datasets: they prove endpoint/mapping/
pagination availability, **not full meaningful page workflow completion**.
Native shared page forms remain development/source tools, not activated routes.

| Route | Native read endpoints | Native commands/source | Local evidence / remaining daily UI gap |
|---|---|---|---|
| `/` | read:reports | none | Generic report read PASS; native dated KPI/chart aggregation and dashboard mapping still incomplete |
| `/pos` | pos/search, customers/search, cash/ledger | checkout; checkoutOutcome | M01 phone/buyer/3-month draft/Cash and M02 anonymous/Bank adapter E2E PASS; retail native checkout controls not wired into active POS |
| `/stock/phones` | read:inventory, pos/search | receive | Serialized receiving and IMEI adapter E2E PASS; native compact intake/scan/label controls not fully mapped |
| `/stock/accessories` | read:catalog, pos/search | receive, price.set | M02 quantity receiving/sale PASS; variant/intake native UI mapping incomplete; adjustments OD-17 |
| `/catalog` | read:catalog | catalog.save, price.set | Generic read PASS; existing command source; full native management UI pending |
| `/customers` | customers/search, customers/history, read:customers | inline checkout buyer, customer.save | Search adapter PASS; history existing SQLite tests; active daily page mapping pending |
| `/sales` | sales/history, receipt, read:sales | pure read/reprint | Immutable receipt strict DTO and history adapter PASS; native filters/document A4 renderer still need daily-page integration |
| `/cash` | cash/ledger, read:cash | cash.open, cash.close, cash.review, cash.evidence | Ledger adapter PASS; existing close/review D1 tests retained; native direct-close UI mapping pending |
| `/suppliers` | suppliers/lookup, suppliers/sources, read:suppliers | supplier.save, suppliers/correct, suppliers/correct-standalone | Selector adapter PASS; source/corrections service tests retained; provenance sources/correction adapters/UI still incomplete |
| `/purchases` | read:purchases; separate finance | purchase.save, purchase.finance, stock.receive | Generic read PASS; purchase authorization is not inferred; daily native receiving/finance presentation pending |
| `/transfers` | transfers/detail, read:transfers | create/approve/scan/dispatch/receive | Existing D1 workflow tests preserved; generic adapter read PASS; manifest daily UI mapping pending; partial receipt policy blocked |
| `/sav` | sav/cases, read:sav | sav.open, sav.event, sav.refund.review | Existing SQLite scoped/event tests; generic D1 adapter read PASS; refund blocked; daily native case UI pending |
| `/facility` | facility/list, read:facility | facility.draft, facility.evidence | Existing scoped draft tests; generic reads PASS (M02 empty); M01-only typed facility boundary; no bank settlement posting |
| `/debts` | debts/list, read:debts | debt.draft, repayment.draft | Existing draft tests; generic D1 reads PASS; no credit/collection authorization invented; daily native UI pending |
| `/expenses` | expenses/list, read:expenses | expense.draft | Existing draft tests; generic D1 read PASS; no profit/category policy invented; daily native UI pending |
| `/reports` | read:reports; separate finance | none | Generic D1 adapter PASS, seller finance denied; richer dated aggregates/native charts pending |
| `/audit` | read:audit | immutable command/source evidence | Generic D1 adapter PASS; daily event filters/typed event mapping pending |
| `/users` | read:users | account/role/session source | Owner PASS, manager/seller denied; no real accounts created; owner roster read completeness/global owner presentation pending |
| `/settings` | status, read:settings | none | Prerequisite/revocation fail-closed tests PASS; local UI stays not connected; actual hosted sign-in unconfigured |

## Explicit remaining gaps

1. A single complete daily-UI read+command repository for both local and native is
   **not finished**. Local/domain contracts remain intentionally separate from SQL
   DTOs; casting one into another would mix authority and silently lose semantics.
   Route-specific view models, retail-native controls and scoped failure/recovery
   presentation must still be implemented (especially POS/receipt/receiving/cash).
2. Generic scalar-row reads are not complete strict per-resource schemas. Rich
   supplier provenance/correction adapters, dated dashboard/report aggregation,
   complete staff projection and module-specific pagination remain work.
3. Transfers/SAV/draft commands have earlier SQLite/D1 evidence as documented in
   NATIVE_OPERATIONAL_PARITY_ACCEPTANCE, but not every command has been exercised
   through a mounted frontend page against the signed Worker this wave.
4. Whole-database portable D1 backup/export/restore tooling, independent hosted
   concurrency/restore acceptance and private R2 publication remain unverified.
5. External blockers: approved verified host/resources/schema, selected/configured
   identity provider/sign-in, real business data, genuine original logo and OPEN
   OD-01..OD-18 legal/financial decisions. Hosted Workers/D1/R2/Auth **NOT CONNECTED,
   NOT TESTED**. Local results never imply production security or legal issuance.