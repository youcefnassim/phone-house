# Real application acceptance — 8 November 2026

## Verdict

**A functioning native daily form slice is now mounted, not merely a controller or empty read test. Whole-platform SOURCE_COMPLETE and host-ready acceptance are not claimed.**

The default application remains the existing browser-local IndexedDB ERP. The inert `nativeHostIntegration` is null. An explicitly injected transport selects a separate workspace-free native shell; failed verified-host prerequisites show denial/disconnection and never render local route children as a fallback. No cashier production switch was added. No owner data, hosted resources, credentials, provider, publication settings or Antigravity were accessed.

Observed source checkpoint before this report: `c8e1aefdbeded75eafba9b603b51df0621760170`. This is a pre-report checkpoint, not a final commit or deployed SHA. The evidence directory includes exact source and migration SHA-256 manifests; repository history is managed externally.

## Implemented functioning slice

- `Shell` selects `NativeShell` only for explicit host integration. Native shell has server-verified memberships, scoped store selection, native stock search, existing theme/language controls and no local actor selector, fixture KPI or workspace subscription.
- `NativeDailyPage` mounts POS, phone/accessory intake, drawer forms and sale history through `useDailyNative`, the strict native repository, signed HTTP Worker handler and actual Miniflare D1. DTOs are not coerced into local workspace types.
- POS exact Enter/manual lookup and existing gesture-started camera parser; quantity selection; anonymous accessory cash/bank; required inline phone buyer, existing customer lookup/reuse, explicit NO or selected 1/3/6/12-month draft warranty; exact centime payment serialization; server-derived operator; atomic checkout and authorized receipt/stock/cash/customer/sales readback.
- Receiving selects scoped catalog, optional existing/quick-added supplier, phone identifiers/condition/packaging/color/battery or accessory quantity; distinct inbound supplier receipts. Owner catalog and price forms issue real native commands. CODE128 print uses existing isolated pure projection.
- Cash open, seller/manager blind direct close and subsequent owner flagged/no-issue review use native commands and authorized readback. Bank sales do not create physical cash movements. Closure records remain immutable.
- Native sales dates/IMEI/seller/tender filters, pagination, immutable invoice/warranty specimen readback and isolated reprint. After unknown checkout reconciliation the basket is replaced rather than allowing the recovered basket to post under another key.
- Loading, definitive authorization errors, validation errors and unknown-outcome locked states are explicit. Recovery only queries the original key, does not retry checkout and cannot manufacture local success.
- Cost-free scoped daily catalog/drawer DTO and `/daily/resources` endpoint with final session/membership recheck. No migration was needed in this slice.

## Executed evidence

| Command/check | Actual result |
|---|---|
| `bunx vitest run` | **554/554 PASS, 48 files**, all baseline 550 retained |
| `bunx vitest run src/test/native-mounted-daily.test.tsx` after final recovery change | **4/4 PASS** |
| `bun run lint` | **0 errors, 14 React-refresh warnings** (one additional export warning) |
| Harness strict TypeScript + production build | latest **build OK**, 13:00:39 UTC |
| Manual strict TS/build | not executed: environment requires automatic harness checks |
| Isolated Chromium local sale → invoice/warranty reprint → reload history → blind close | PASS; persisted snapshot identical before/after both prints |
| FR Light 1440 / EN Light 768 / AR RTL Dark 390 | 18 daily route visits, headings/direction/overflow checks PASS, no page errors; screenshots inspected |

The four new mounted tests use the **same React daily forms** and real loopback HTTP adapter, ES256 identity, unchanged Worker handler and genuine workerd D1, not mocked fetch datasets:

1. Owner new catalog/price → M01 seller drawer and phone receiving/source/Code128 → second M01 seller inline customer + deliberate 3-month Cash checkout → persisted customer/receipt/history/reprint → first seller blind close → owner flag, immutable closure.
2. M02 manager, Arabic forms → two accessory receipts with different suppliers → anonymous Bank sale → no customer/warranty/cash posting → direct zero-cash close.
3. Committed checkout response lost → original-key lock → explicit status recovery/receipt without a second checkout.
4. Invalid source gate hides local children; cross-store and revoked-session reads denied with no sales written.

Worker JavaScript runs in the test process against real Miniflare D1 via an HTTP bridge reconstructing its approved HTTPS origin. **This is not a fully bundled Worker deployment/browser test.** Canvas text metrics are supplied in the DOM harness; CODE128 bars still use genuine JsBarcode. React test act warnings remain; tests passed without unhandled errors.

Existing full-suite populated controller tests retain stale closed drawer, revoked actors, oversell/atomic rollback, double posting and transfer/SAV security coverage. These are **controller/SQL tests**, not all newly mounted page workflows. Existing additive legacy migration/checksum and supplier logical restore tests passed in the full suite; whole-D1 restore is not implemented/accepted.

Browser coverage above is **browser-local only**, not native-browser connectivity. Older intake browser script failed to open the current intake dialog and was not counted as passing; responsive route checks and actual local sale/print/close were independently rerun. Hardware camera/USB/printer acceptance was not run.

## Exact module status

Every row is **HOSTED_NOT_RUN**. “Wired” means the inert injected native shell, not live activation.

| Module | Native UI / source status | Evidence / limits |
|---|---|---|
| POS | NATIVE_UI_WIRED; LOCAL_WORKER_D1_E2E_PASS for documented Cash phone and anonymous Bank accessory flows | Camera reused, physical scan untested; customer reuse/mixed basket native mounted scenarios still pending |
| Phone stock | NATIVE_UI_WIRED; LOCAL_WORKER_D1_E2E_PASS intake/source/Code128 | Movement/status-rich presentation and owner acquisition cost form pending |
| Accessories | NATIVE_UI_WIRED; LOCAL_WORKER_D1_E2E_PASS two supplier lots and scoped quantity | Owner catalog/price tested; manufacturer-code locate/create UX and richer stock pagination pending |
| Cash | NATIVE_UI_WIRED; LOCAL_WORKER_D1_E2E_PASS open/blind close/review | Safe cash evidence form/references, pagination and detailed native discrepancy UI pending; unapproved cash posting POLICY_BLOCKED |
| Sales/documents | NATIVE_UI_WIRED; LOCAL_WORKER_D1_E2E_PASS receipt/history/reprint | Today/yesterday/week shortcuts, buyer filter, full specimen selection/recovery UX pending; fiscal/legal issuance POLICY_BLOCKED |
| Customers | Inline native search/reuse and persistence built; separate page remains generic | Detailed native customer page controller pending |
| Suppliers/purchases | Native commands/history/correction source tested previously; generic native page | Dedicated directory/order/source/correction forms and owner cost-isolated UI pending |
| Transfers | Native typed commands and populated D1 dual-approval/scan tests retained | Dedicated mounted manifest/scan/dispatch/receipt controller pending |
| SAV/warranties | Native sold-phone/case/event source retained/tested | Dedicated mounted buyer/phone/case timeline pending; refund/exchange/legal warranty POLICY_BLOCKED |
| Debts/facility/expenses | Scoped native draft read/command source; generic forms | Dedicated draft/evidence UI pending; unapproved finance postings POLICY_BLOCKED |
| Dashboard/reports | Generic native read; local ledger-derived dashboard unchanged | Rich dated native KPI/charts/alerts/known-cost profit DTO + presentation pending |
| Staff/audit/settings/notifications | Scoped native source + generic views; native shell no fake staff actor | Rich active/history staff, audit filters, notification actions and host-safe settings pending |
| Offline | Separate bound outbox/lease/idempotency source retained | Live financial replay POLICY_BLOCKED pending OD-18; complete mounted recovery workflow pending |
| Migration/restore/private R2 | Additive migration and narrow logical restore regression PASS | Complete D1 logical export/restore/integrity and private R2 acceptance pending |

## Residual code, not external blockers

The native and local presentations are safely separated but **not yet a single shared dual-repository presentation model**. Full daily completeness still needs the missing filters/movements/cash evidence/manufacturer barcode mappings above, mounted mixed/NO/reuse and stale/revoked mutation scenarios, native browser responsive screenshots, and all dedicated P1 pages/report/staff/restore tools. Do not label these hosting blockers or claim A+B across the platform.

External prerequisites are separately: owner-specific Cloudflare resources/deployment authorization, selected verified staff identity provider/session wiring, real data migration approval, original genuine logo PNG, physical devices/multi-user/concurrency/backup acceptance, and OD-01…OD-18 policy decisions. No resource or credential was created. Original-logo placeholder/slot retained without imitation. Official invoice/tax/discount/credit/refund/warranty/offline policy remains blocked only where affected.