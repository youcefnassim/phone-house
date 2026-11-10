# Daily native UI completion — 2026-11-08

## Verdict and source identity

**One cohesive daily native controller/adapter slice is implemented and locally
tested. The complete platform and per-page native activation are NOT finished.**

Source checkpoint observed after implementation: `fc4045a7d8683ce0e44a7713cd7183719a8aba3a`.
This identifies the code checkpoint before this report/evidence save, not a hosted
deployment or a claim that the original baseline SHA was checked out. Repository
history was not modified by commands. SHA-256 file/migration manifests accompany
this report under `docs/evidence/daily-native-ui/`.

The running application still uses its existing IndexedDB workspace. No owner
data was reset, imported, reseeded or migrated. No Cloudflare resource/provider,
credential, real identity, hosted migration, publication setting or Antigravity
was accessed. PH placeholder and original PNG slot remain; no logo was integrated.
OD-01 through OD-18 remain OPEN.

## Actual code changes

- `createDailyNativeController`: executable framework-independent retail action
  layer using the existing native repository. Strict receiving/POS/checkout/cash/
  customer/sales contracts remain separate from local draft types. Store-bound
  actions, observable loading/denial/error states, no optimistic/local success,
  original-key unknown outcome locking and explicit outcome lookup are implemented.
  Reads after writes precede a successful review. No automatic posting/retry.
- `useDailyNative`: inactive React subscription seam for an injected verified
  transport. Existing local screens **do not select it**. A shared dual-mode local
  and native presentation model and native daily form mounting remain incomplete.
- Native checkout review reads immutable receipt, updated stock, cash, sales and
  linked customer history together. Exact scanner selection excludes substring
  matches. Receiving uses the same repository and validates optional source,
  identifiers and quantity; unspecified packaging remains UNKNOWN.
- Fixed an actual native parity defect: a serial-only received phone was valid at
  intake but blocked by the legacy checkout guard. Native checkout now accepts
  recorded serial OR IMEI1, without changing identity uniqueness/stock guards.
- Generic command service gives definitive role/store FORBIDDEN before batch
  execution; in-batch authorization and session rechecks remain mandatory.
- `NativeDocumentDialog` and `projectNativeSpecimens`: separate native DTO A4
  invoice/warranty projection, same print-isolated design family, pure read-only
  printing, no local record casts, no buyer mutation, no fiscal/legal invention.
  Explicit NO produces no warranty specimen; YES accepts selected 1/3/6/12 months.
- Owner-only `/suppliers/history`: strict per-receipt source/correction DTO with
  concrete pagination, original/effective supplier separation, review actor/time/
  reason, purchase-linked and standalone sources, final revoked-owner recheck.
  No cost/margin fields or inferred sold-lot allocation.
- Test harness now uses a **real loopback HTTP server**, signed ES256 identity,
  unchanged Worker handler and actual Miniflare/workerd D1. This is not mocked
  fetch data. The HTTPS host/origin envelope is reconstructed by a test-only
  loopback bridge; Worker JavaScript executes in the Vitest process against real
  workerd D1. It is **not a fully bundled Worker HTTP runtime/deployment test**.

## Verification actually executed

- Full `bunx vitest run`: **550/550 PASS, 47 files**, prior 537 preserved.
- `bun run lint`: **0 errors**, 13 existing React-refresh warnings.
- Automatic harness strict TypeScript/build: latest **build OK**. Manual project
  typecheck/build were not run because this workspace requires harness execution.
- Daily controller file: **9 tests**, of which **7 real signed HTTP/D1 lifecycle
  tests** and 2 concrete policy/validation tests. Existing readiness file: 5 tests
  rerun through the real loopback adapter. Supplier history: 1 additional populated
  signed HTTP/D1 scenario plus 1 strict cost-rejection schema test.
- Native A4 React presentation: **2 UI tests**, print invocation/isolation and
  immutable input, plus NO-certificate denial. These tests mount native documents,
  but do **not** mount the whole retail native page against the HTTP Worker.
- Real native scenarios: M01 shared drawer opened by seller 1 and sold by seller 2;
  phone receipt/IMEI/exact barcode; inline atomic buyer and 3-month draft; customer
  reload through a fresh controller; Algiers date/IMEI/seller/buyer/tender filters;
  cash and stock readback; direct blind close and immutable owner flag; M02 variant
  quantity receipts with distinct optional suppliers, anonymous Bank sale with no
  customer/warranty/cash movement and manager direct close; serial-only phone sale;
  explicit NO; same-key idempotent repeat and oversell denial; lost committed
  response recovery without a second checkout; revoked operator and closed drawer
  denial with no customer/sale/cash/audit mutation; prohibited seller owner review;
  blocked cash evidence; owner-only append-only source correction and pagination.
- Browser **local-only**: FR Light 1440, EN Dark 768, AR RTL Dark 390 actual phone
  intake → reload → barcode search, plus five route checks per viewport (heading,
  direction, no overflow), no page errors. Separate EN local sale: open drawer →
  phone scanner → inline buyer → deliberate YES/3 months → confirm → invoice and
  warranty print twice → zero ledger mutation → sales reload → blind direct close.
  Screenshots inspected. These are not native browser lifecycle evidence, hardware
  acceptance or all-route/all-control recertification; both themes are sampled,
  not every viewport/theme combination. Scripts and JSON are in the evidence folder.
- Existing additive migration 0008 checksum-preservation and scoped supplier
  logical restore into a second isolated D1 reexecuted and PASS. No new migration
  was needed. All eight SQL files have SHA-256 evidence. This is NOT complete
  database backup/restore, hosted restore or concurrency certification.

## Per-component status

All rows retain `HOSTED_NOT_RUN` and the existing browser-local UI; “controller”
means the executable presentation seam, not an activated daily page.

| Component | Exact status | Native page wiring still remaining |
|---|---|---|
| POS | BUILT / LOCAL_UI_WORKING / NATIVE_CONTROLLER_AND_ADAPTER / WORKER_D1_TESTED | Native product/basket/buyer controls not mounted; shared local/native presentation model incomplete |
| Phone receiving | BUILT / LOCAL_UI_WORKING / NATIVE_CONTROLLER_AND_ADAPTER / WORKER_D1_TESTED | Native compact intake, camera and label controls not mounted |
| Accessory receiving | BUILT / LOCAL_UI_WORKING / NATIVE_CONTROLLER_AND_ADAPTER / WORKER_D1_TESTED | Native unknown-barcode catalog creation and daily receiving controls pending |
| Cash open/close/review | BUILT / LOCAL_UI_WORKING / NATIVE_CONTROLLER_AND_ADAPTER / WORKER_D1_TESTED | Native drawer/count/review forms and detailed ledger presentation pending |
| Cash reason evidence | BUILT / POLICY_BLOCKED / WORKER_D1_TESTED | IN/OUT records are evidence only, not authorized physical cash postings |
| Sales/customer history | BUILT / LOCAL_UI_WORKING / NATIVE_CONTROLLER_AND_ADAPTER / WORKER_D1_TESTED | Native daily filter and customer-search presentation pending |
| A4 specimens | BUILT / NATIVE_CONTROLLER_AND_ADAPTER / WORKER_D1_TESTED (receipt read) | Native React print UI separately unit-tested; whole mounted HTTP-native sale/print not tested |
| CODE128 labels | LOCAL_UI_WORKING; existing pure renderer preserved | Native intake connection/hardware not tested this wave |
| Suppliers/provenance | BUILT / LOCAL_UI_WORKING / NATIVE_CONTROLLER_AND_ADAPTER (repository) / WORKER_D1_TESTED | Native history/correction page controls pending; effective supplier name resolution pending |
| Purchases | LOCAL_UI_WORKING; existing native draft/source | No new page controller; purchase approval cannot be inferred |
| Transfers | LOCAL_UI_WORKING; existing typed detail/command source | Native manifest, full scans and approval retail controller/mounted HTTP page remain pending; existing regression tests preserved |
| SAV | LOCAL_UI_WORKING; existing typed cases/events source | Native case/event daily controller pending; refund POLICY_BLOCKED |
| Facility/debts/expenses | LOCAL_UI_WORKING / POLICY_BLOCKED; existing typed source | Native draft/evidence page controllers pending; no settlement or credit policy invented |
| Dashboard/reports | LOCAL_UI_WORKING (ledger-derived) | Rich dated native KPI/low-stock/store charts and known-cost-only owner profit pending |
| Audit/users/settings | LOCAL_UI_WORKING; existing source/activation gates | Strict richer native event/staff projections and daily views pending; provider NOT CONFIGURED |

## Remaining work and external blockers

Remaining **code work**, not blocked by host provisioning: complete local/native
presentation interfaces and mount native POS/receiving/cash/history controls; connect
native A4 review to that page flow; detailed operational controllers for purchases,
transfers, SAV and drafts; rich dashboard/report/audit/staff DTOs; whole-D1 logical
backup tooling and full concurrency acceptance. This report does not call those
items finished simply because endpoints exist or an empty read passed.

External blockers: resource-specific owner authorization, verified real host/schema,
selected identity provider and credentials, genuine logo PNG, private R2 access/
retention approvals and unresolved legal/financial OD decisions. Official fiscal
invoice, legal warranty, credit/discount/refund/tax/offline financial posting remain
POLICY_BLOCKED. Hosted Workers/D1/R2/Auth remain NOT CONFIGURED / HOSTED_NOT_RUN.