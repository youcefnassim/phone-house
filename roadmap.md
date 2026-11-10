# Phone House full-stack roadmap

## Batch 8b — remaining native lifecycle evidence
- [x] Full baseline first: 804 tests pass at e4c856402daf1873ac170b52a31dcd10e81023a2.
- [x] Signed mounted intake, supplier finance/payment, discrepancy resolution, SAV lifecycle/exchange, export and Zakat evidence; fix revealed defects.
- [x] Retained-key count/adjustment/review recovery and mixed/credit exchange reconciliation regressions.
- [x] Accurate checklist before/after totals and per-row tests; full suite, src lint, automatic strict check and logs.

## Batch 8a — finish 5b and mobile
- [x] Full baseline first: 792 tests pass at afe49034143adc0e865a7914d69adf8ed37ea58e.
- [x] Native owner five-card home, owner-gated reads, signed FR/AR/EN owner tests and seller/manager restricted direct-route regressions.
- [x] Explicit gated production imports and fail-closed native path; compiled build proof assigned to Claude Code.
- [x] Staff/transfer pagination beyond 100 rows passes signed mounted readback; FR/AR 390px native/local captures confirm no page overflow or closed sidebar interception. Native browser test bridge rendered real isolated signed D1 reads; bridge-only NO_METHOD telemetry remains, not hosted acceptance.
- [x] 804 tests pass, src lint 0 errors/23 warnings, automatic strict check/build OK; report saved.

## Batch 7 — visual design only
- [x] Baseline: 792 tests pass at 84599cbdf3943d333b4823a90d3253c2b88820fd.
- [x] One self-hosted font family, brand tokens, touch targets, bento owner home and immediate motion feedback; no SQL, permissions or financial rules changed.
- [x] 792 tests pass; src lint 0 errors/21 warnings; automatic strict/build OK; 32 preview captures FR/AR Light/Dark at 1440/390, no horizontal overflow/browser errors; scan focus and payment review checked.
- [ ] Separate preview/production build transcripts and compiled bundle delta unavailable: manual project builds/typechecks are prohibited in this environment; automatic build supplies no bundle artifact. Native browser captures await approved authenticated host wiring; signed native mounted regressions pass, preview screenshots are not production acceptance.
- [ ] Genuine horizontal full-colour/reversed logo and 16px-cut favicon await owner artwork.

## Batch 5b — production isolation, owner home, role navigation
- [x] Full baseline first: 752 tests pass at 787d5cb847b21dfe260836fe2ed8d97527531901.
- [x] Code isolation: mode-gated frames/pages/providers retain preview and fail closed in production; gating unit tests pass.
- [x] Five-card authenticated native owner dashboard and linked lists; signed mounted owner and negative staff evidence pass.
- [x] Centralized explicit route registry, menus and direct gates in permissions.ts; seller/manager restricted URL/server regressions pass.
- [x] Full tests, src lint and automatic strict/build signals verified in Batch 8a.
- [ ] Compiled production bundle/grep proof is assigned to Claude Code, per Batch 8a owner instruction; not run here.

## Batch 5a — native production completeness
- [x] Run baseline before changes: 741 tests pass at 29eadb51b2a668b02cd7cfd136b5ae5f09b8a8fe.
- [x] Inventory 54 requested options in docs/V1_OPTION_CHECKLIST.md: before 32 DONE / 22 PARTIAL / 0 MISSING; after 42 DONE / 12 PARTIAL / 0 MISSING.
- [ ] Completion remains unfinished: 12 checklist options need native signed lifecycle evidence, exchange mixed/credit regression coverage, stock-count recovery and operational mobile/export acceptance; these are code/test work, not external blockers.
- [x] Add 11 regressions including signed FR/AR/EN staff, settings recovery, customer history, transfer partial cancellation and used-purchase private readback; 752 tests PASS, src lint 0 errors/17 warnings, automatic strict check/build OK; full logs in docs/evidence/batches/batch5a-verification.txt.

## Batch 4b — SAV, individual purchases, reports and Zakat
- [x] Full baseline first: 715 tests passed at 7fa14076dc9a9369900dd331d00939b84ab680a3.
- [x] Linked SAV tracking, manager/owner outcomes, capped atomic cash/bank refunds and owner restocking implemented/tested.
- [ ] Batch5a removed native original-sale single-line/non-credit restriction and added bank methods/retained recovery; mixed/credit exchange regression coverage and local parity still need completion.
- [x] Native/local used-phone purchases, role/store restrictions, private seller/image and owner-only cost; Batch5a signed native post-write private readback and lost-response recovery pass.
- [x] Store/day sales exports and owner preparatory Zakat with missing costs implemented; partially consumed accessory lots stay unknown instead of invented costing.
- [x] SVG/PNG original probe with unchanged placeholder; 741 full tests PASS, src lint 0 errors/17 warnings, automatic strict check/build OK. Desktop/mobile report downloads checked; mobile sidebar covered left content in browser capture, responsive acceptance incomplete.
- [ ] Remaining mounted signed native SAV/purchase flows and mobile acceptance are not completed (code/testing work); no production or hosted acceptance.

## Batch 4a — suppliers, transfers, inventory
- [x] Run full baseline first: 695 tests passed.
- [x] Owner-only receipt cost/payables and bank/open-shift supplier payments with cost isolation.
- [x] Carrier dispatch, partial receipt, owner discrepancy resolution/cancellation, exactly-once stock.
- [x] Blind monthly store counts and reasoned immutable accessory adjustments/owner review.
- [x] Local/native FR/AR/EN controls; 715 tests PASS, src lint 0 errors/17 existing warnings, automatic strict check/build OK; signed D1 mounted count/review and browser blind dialog checked.
- [ ] Remaining Batch 4a edges: make carrier mandatory for native commands while migrating superseded full-receipt tests; local damaged-line entry and post-partial cancellation policy need completion/clarification. Current cancellation refuses completed receipts rather than reversing arrived stock.

## Batch 1c — flexible staff roles

- [x] Centralize operation matrix and native/demo/navigation authorization; preserve the centralized transfer approver exception.
- [x] Remove roster caps, support explicit owner staff add/activation without rewriting legacy identities/history.
- [x] Add store/role/security regressions and append decision; 600 tests PASS, lint 0 errors/14 warnings, strict checker PASS, automatic build OK; isolated browser add/activation persisted after reload with no runtime errors.

## Batch 1b — error contract

- [x] Restore explicit existing-customer reuse regressions in demo/native checkout.
- [x] Implement read-only failed-batch diagnostics and stable API codes without write retries.
- [x] Preserve codes in localized daily UI; only unknown outcomes recover, unrecorded commands retry explicitly with original key.
- [x] Full suite 595 PASS; lint 0 errors/14 existing warnings; strict checker PASS; automatic build OK. Native mounted same-key retry verified in EN/FR/AR.

## Batch 1a — scoped correctness and audit privacy

- [x] Update only the three owner-superseded tests and accept matching newly typed demo buyers.
- [x] Share all SQLite/D1 test migration lists and fix strict optional-property typing.
- [x] Verify checkout PII-free audit, owner-only audit JSON projections and canonical receiving audit with three regressions.
- [x] Full tests: 557 PASS; ESLint: 0 errors/14 warnings; permitted strict checker: PASS; automatic build: OK.
- [ ] Exact manual `bunx tsc --noEmit` / `bunx vite build` transcripts require an environment permitting those commands; this environment forbids manual builds and tsc.

## Real application continuation

- [x] Mount isolated native POS, receiving, cash and sales forms through the trusted source integration; preserve default local UI and forbid fallback/mixed shell records.
- [x] Exercise the mounted forms against populated signed HTTP Worker/Miniflare D1, including recovery, both stores and immutable print/close review.
- [x] Run full regressions/lint and responsive multilingual checks; record exact per-module status and remaining code in REAL_APPLICATION_ACCEPTANCE.md.
- [ ] Complete remaining operational native module controllers, reports/staff projections and whole-D1 restore tooling (code work).
- [ ] Hosted acceptance, real provider/logo/devices and OD policies require outside approvals; no activation authorized.

## Daily native UI completion continuation

- [x] Implement executable, isolated daily receiving/POS/cash/history/specimen controller with typed native contracts, loading/denial/unknown-outcome handling and no local fallback; inactive React hook/native A4 presentation added.
- [x] Exercise controller actions through real loopback HTTP, signed Worker handler and real Miniflare D1 with both stores, shared drawer, buyer reload, immutable close/print and revoked/stale negatives; populated supplier history/correction adapter added.
- [x] Run full regression/lint and multilingual responsive actual local flows; 550 tests, lint 0 errors, harness build OK; exact slice and remaining native page wiring in DAILY_NATIVE_UI_COMPLETION.md.
- [ ] Native daily forms now mounted in isolated host shell; common local/native presentation, remaining operational page controllers and rich report/staff DTOs remain code work, not hosting blockers; see REAL_APPLICATION_ACCEPTANCE.md.

## Final native adapter readiness wave

- [x] Complete receiving/immutable specimen/supplier-selector adapter contracts, exact sales route mapping and fail-closed activation prerequisite gate; comprehensive supplier history adapters remain pending.
- [x] Verify typed adapters against isolated signed-JWT Worker/D1; additive legacy supplier migration and scoped logical restore dry run; no owner workspace access.
- [x] Add replaceable original-logo asset slot without fabricated artwork; 122 multilingual/theme browser smoke assertions PASS.
- [x] Record exact per-route source/read/command gaps in FINAL_NATIVE_ADAPTER_READINESS.md; 537 Vitest PASS, lint 0 errors, automatic strict TS/build OK.
- [ ] Remaining code work: complete daily local/native view-model interface and route-specific retail UI mappings, supplier-history/correction adapters, typed generic reads, dated native dashboard/reports and complete D1 backup tooling. Not blocked by hosting; incomplete this cohesive wave.

## Official design and final code completion wave

- [ ] Unify shared shell/design tokens and ledger dashboard; preserve temporary logo until original artwork supplied.
- [ ] Fix formatting and genuine lint errors without suppressions; run full regression and fresh multilingual browser checks.
- [ ] Complete safe native POS search DTO/read/adapter slice with role/store/cost isolation tests.
- [ ] Record per-module completion and remaining native integration, policy and external-hosting dependencies honestly.

## Native parity execution

- [x] Atomic inline buyer/warranty/immutable receipt native checkout verified in SQLite and isolated Miniflare D1.
- [x] Native close review/session revoke and obsolete role/store rejection verified locally.
- [x] Unconfigured Worker source, fail-closed checkout boundary and standalone receiving source with separate supplier receipts.
- [x] Full regression 497 PASS; isolated browser 189 PASS; exact limitations in NATIVE_PARITY_ACCEPTANCE.md.
- [ ] Hosted identity/resources and activation — blocked by unselected identity provider and missing resource-specific owner authorization; no hosted operations performed.
- [x] Native read parity slice: typed customer search/history, sales history (period/IMEI/seller/tender) and cash ledger projections with final in-query auth gates, API routes, fail-closed adapter; 515 Vitest PASS, lint 0 errors, build OK; docs/NATIVE_FRONTEND_PARITY_ACCEPTANCE.md.
- [x] Native operational parity: transfer dual-approval/scan/dispatch/receive E2E + negatives, SAV cases/events/scoped reads, debt/facility/expense draft reads, owner-only append-only standalone provenance correction, normalized supplier dedup key (migration 0008), typed fail-closed adapter methods, locally tested Worker entrypoint (real Miniflare D1 + ES256 JWT roundtrip, fail-closed gates). 524 Vitest PASS, lint 0 errors, typecheck/build OK; docs/NATIVE_OPERATIONAL_PARITY_ACCEPTANCE.md.
- [ ] Remaining native parity: per-page native read activation (intentionally off), hosted Worker configuration — blocked by unselected identity provider and missing resource-specific owner authorization.

## Supplier provenance addendum

- [x] Optional supplier intake/quick-add, phone source, per-receipt accessory history and append-only owner corrections.
- [x] Additive D1 FK/owner-authorized source; 472 unit + 75 browser PASS. Native standalone optional receiving and hosted activation remain unimplemented, documented in SUPPLIER_PROVENANCE_ACCEPTANCE.md.

## Owner low-friction checkout clarification

- [x] Move Clients out of daily navigation without removing its route or records.
- [x] Anonymous accessory checkout; inline phone buyer staged and linked with the sale, explicit warranty YES/NO and 1/3/6/12 month choices.
- [x] 463 full-suite tests and 125 isolated browser checks; local records preserved, native/hosted blockers documented in POS_OWNER_UX_ACCEPTANCE.md.

## Integrated POS/customer/cash/security wave

- [x] Require linked phone buyers, reuse/create customers, per-phone warranty drafts and POS camera scan.
- [x] Add scoped Algeria-date sales history and immutable specimen reprints; inventory actor/store guards.
- [x] Harden implemented native JWT/checkout/shared-drawer role subset; no deployment infrastructure.
- [ ] Complete native warranty/receipt/customer/cash-review mappings and remaining role reconciliation; integration and owner policy/host approvals remain required.
- [x] Execute 453 full-suite tests and 48 isolated browser checks; document precise incomplete source/hosted blockers.
- [ ] Hosted Cloudflare/identity deployment and OD-gated policies — owner authorization and decisions required.

## Receiving, camera scan and labels

- [x] Compact phone/accessory receiving, truthful unspecified packaging, shared camera/keyboard scanning and isolated CODE128 printing.
- [x] 431 unit PASS + 85 targeted browser PASS; latest harness build OK. Evidence in RECEIVING_SCANNER_ACCEPTANCE.md; physical hardware/hosted security remain NOT RUN.

## Approved staff and cash closeout

- [x] Four active identities, retained historical actors, shared role/store preview and M02 manager POS/receiving.
- [x] Direct blind close, immutable retrospective owner review and stale/double/cross-store command guards.
- [x] Focused/full regressions: 411 unit PASS; 358 isolated browser PASS; evidence in STAFF_CLOSEOUT_ACCEPTANCE.md; no owner-data reset or hosted operations.

## Everyday usability refinement

- [x] Simplify navigation, dashboard, inventory intake and checkout with progressive disclosure; retain all routes, validation and storage.
- [x] Run full regressions: 379 unit + 396 isolated browser PASS; exact limits in RETAIL_USABILITY_ACCEPTANCE.md.
- [x] Add a short employee tour and before/after delivery note without replacing historical acceptance evidence.

## Single-application client review

- [x] Remove shell mode selector/gate and repeated environment banners; retain isolated backend source.
- [x] Preserve local persistence; Settings disclosure, export and explicit rehearsal reset versus empty-start; no owner-data deletion executed. Five isolated lifecycle regressions pass.
- [x] Verify single-app flows and 19 routes/locales/themes/sizes: 373 unit tests, 381 browser checks PASS; automatic build/typecheck OK. Walkthrough/readiness updated; hosted acceptance and destructive UI execution NOT RUN.

## Immediate client handover (hosting deferred)

- [x] Linked localized A4 specimens, automatic named-sale preview, independent warranty/history reopen and zero-mutation printing verified again in single-app intake flow.
- [ ] Repair feasible user-facing gaps; preserve and extend previous control evidence and acceptance catalog without invented IDs or PASS claims.
- [x] Print verification: 14/14 browser checks (invocation, print DOM, @media print, zero ledger mutation on reprint, history reopen, AR RTL); earlier "print invocation failure" was a Playwright evaluate-serialization artifact, app code correct (print_verify.py).
- [x] Delivery docs: CLIENT_DELIVERY_READINESS.md + CLIENT_ACCEPTANCE_81_CASE_MATRIX.md (canonical 81 IDs never supplied; A-xx rows built from brief areas, honestly marked).
- Historical chunked per-control audit stopped: obsolete selectors after single-app change. Partial results not merged; full historical matrix preserved, not recertified. Current route/workflow evidence is separate under docs/evidence/single-app/.

## Current owner-authorized Cloudflare-native data target

- [x] Wave 3: per-module production reads/forms for all 18 routes via injected transport (server pagination/search, key-bound receipts, unknown-outcome readback, owner-only finance panel); portable Workers-style API handler (origin/method/bearer/correlation/sanitized errors/timeouts); staged R2 finalize/quarantine; offline replay classification (never final); migration 0003. 354 Vitest pass (15 new API-over-SQLite, 30 new page tests); 36 synthetic browser page checks. Hosted Workers/D1/R2/Auth NOT RUN.
- [x] Meeting readiness: 59 browser checks + 354 tests pass; topbar overflow + POS shift badge fixed; docs/CLIENT_MEETING_WALKTHROUGH.md.
- [ ] POS checkout form wiring to the atomic pos.checkout contract in production mode; backup/export/restore tooling; hosted acceptance.
- [x] Next wave source: native command planner for receipts, cash counts, transfers, debt/facility/expense drafts, SAV, protected roles/session revocation and private document staging; 20 new local SQLite cases. Policy posting and hosted acceptance blocked; docs/NATIVE_WAVE_IMPLEMENTATION.md.
- [x] Typed native repository/transport, 18-route mapping and shared production gate; 37 contract + 18 page tests; browser 18-route blocked mode/test POS/AR dark RTL checks. Module-specific production forms/DTOs and API wiring remain open below.
- [ ] Native target: Workers + SQLite-based D1 + private R2. Supabase and built-in Cloud forbidden; no provider connection/provisioning/migrations/deployment authorized. Lovable app deployment to Cloudflare is unsupported.
- [x] Implement provider-independent SQLite schema for every module, injected identity/private document/D1-compatible ports, one atomic checkout plan and 19 actual local SQLite tests. Full native workflow command coverage remains unfinished; PostgreSQL references preserved.
- [ ] Confirm exact Cloudflare account/D1/R2 identities and obtain resource-specific approvals before hosted operations; D1/hosted-auth acceptance NOT RUN.
- [ ] Real sign-in/reset/invitation and account profiles — awaiting profile-data answer, identity-provider design and approved externally supported native host; no accounts created.
- [ ] Reconcile all existing module SQL/DTO mappings and implement missing transactional commands without importing fixtures or weakening OPEN policies.
- [ ] Integrate authoritative reads/writes across all existing pages only through verified environment/session; preserve isolated local test mode.
- [x] Implement separate durable outbox with immutable keys, tab leases, recovery and server-policy replay port; 13 local tests plus actual browser persisted readback. Operational offline activation remains blocked by OD-18 and hosted verification.
- [ ] Hosted role/store/cost-secrecy/concurrency/rollback/backup acceptance and actual scanner/printer verification; no live release authorization.
- [x] Current source-change regression: 215 Vitest pass, automatic build/typecheck OK, FR/EN connection status and AR dark mobile verified, browser queue deduplication/policy stop/readback verified. PostgreSQL/hosted Auth NOT RUN.
- [x] Hosting correction: 234 full-suite tests pass (19 real local SQLite checks), automatic build OK; French desktop/mobile native-target status checked without page errors or horizontal overflow. D1/Workers/R2/real Auth NOT RUN. Checkpoint: docs/CLOUDFLARE_NATIVE_CHECKPOINT.md.
- [x] Implement dedicated server configuration gate, unknown-outcome/key protection, exact NUMERIC(14,2) bounds, supplier/SAV typed command dispatch and review-only SQL candidates. Complete production mapping remains open above.

## Historical frontend evidence (prior approval restrictions superseded)

- [ ] First real PostgreSQL acceptance — BLOCKED: sandbox has no Docker/Podman client or Docker socket; independent host attestation and separate Stage A/Stage B owner approvals required.
- [x] Prepare executable local handoff, phase-specific authorization enforcement and full structural evidence without database execution; 30 offline safety tests pass, actual PostgreSQL evidence NOT RUN.
- [x] Review 09: correct trigger event handling and verify production read/schema/adapter parity without activation.
- [x] Review 09: consolidate A–AJ guarded SQL acceptance with independent state assertions; prepare exact isolation/cleanup approval scope.
- [x] Review 09: run local regressions and offline safety checks, preserve ERP and export source with integrity evidence.
- [ ] Review 09: real PostgreSQL execution — BLOCKED pending separate owner approval of exact archive/environment/commands.
- [x] Review 08: correct catalog/physical units, active-sale ownership and authenticated purchase receipt provenance in source only; database behavior uncertified.
- [x] Review 08: consolidate production contracts, cash confidentiality and remaining safe/blocked command boundaries; unresolved policies remain execution blockers.
- [x] Review 08: strengthen isolated execution preflight, extend acceptance source, run local regression and export hashed source/evidence.
- [ ] Review 08: database and hosted acceptance — BLOCKED pending separate explicit owner authorization and isolated-environment proof.
- [x] Review 07: implement source for revised relational invariants, store-bound authorization, private finance and seven atomic PostgreSQL commands without execution; remaining posting gaps documented.
- [x] Review 07: implement inactive authenticated server boundary, typed RPC transport and precise failure classification; configuration/hosted Auth remains blocked.
- [x] Review 07: prepare concrete isolated fixtures and twenty permission/concurrency tests; local 112-test regression and 19-route browser checks passed; source evidence exported.
- [ ] Review 07: actual database acceptance — BLOCKED until explicit disposable-test-database authorization; no connection or SQL execution authorized.
- [x] Application foundation, navigation, Light/Dark design system, executive dashboard.
- [x] Initial frontend interfaces for all approved areas with typed synthetic adapters and basic draft validation.
- [x] Review 04: differentiated Customers/Receivables, Suppliers/Purchases, Expenses, Transfers, M01 Facilities and SAV interfaces with isolated session drafts and adverse states; production execution remains blocked.
- [x] Review 04: 71 role/store/form/regression tests, eight business browser workflows, Light/Dark/mobile and navigation resilience checked locally; not independent certification.
- [x] Readable review 03/04 evidence export with observed source revision and hashes; exact results and limitations documented.
- [ ] Official A4 issuance, credit eligibility, warranty/refund eligibility, partial transfer receipt and bank confirmation — BLOCKED by OPEN OD-01/08/09/11/12/13.
- [x] Browser navigation, core demo interactions, themes and responsive verification; engineering records.
- [ ] Real authentication, database transactions, RLS, offline sales and operational release — BLOCKED pending explicit owner activation approval and unresolved security/policy decisions.
- [x] Restore supplied original OD-01..OD-18 register verbatim and update source references.
- [x] Executive review 02: baseline routes, ten tests, and 1440px Light/Dark dashboard evidence.
- [x] Operational wave 02: structured POS, cash, phone intake and accessory receiving simulations.
- [x] Verify wave 02 forms, barcode/receipt previews, navigation, Light/Dark and mobile layouts; record evidence before further waves.
- [x] Executive video correction: reproduced delayed-chunk mismatch and corrected stale content; verified 19 direct routes and refreshes.
- [x] Deepen POS payment/basket states and seller attribution drafts, drawer-bound blind counts, phone sale pricing, existing-SKU receiving, accessible validation and barcode decoding.
- [x] Capture complete forms, desktop Light/Dark and mobile evidence; 47 automated tests passed; exact changes and limitations in review 03.
- [x] Review 05: unified domain/data-access layer with shared cross-module synthetic session state and repository contracts.
- [x] Review 05: version-controlled PostgreSQL migration proposals + RLS/authorization matrix, labeled UNDEPLOYED/UNTESTED (not executed).
- [x] Review 05: typed production integration contracts (validation/authorization/conflict/idempotency) for all operational groups.
- [x] Review 05: domain-specific Catalog, Users & Roles, and Audit pages; draft print templates with approval blockers.
- [x] Review 05: offline POS architecture document (no operational offline claims).
- [x] Review 05: handoff pack — developer setup, backend runbook, technical debt register, ADR/test-matrix updates, completion report.
- [x] Review 06: audit all six SQL proposals and document security defects, authorization matrix and transaction invariants.
- [x] Review 06: prepare inactive authenticated repository, command/read boundaries and local structural tests.
- [x] Review 06: prepare secure bootstrap/activation runbook and executable isolated database/auth test specifications (10 skipped; real execution blocked).
- [x] Review 06: run local regression tests and export complete reviewable source package with hashes and blockers.- [x] Client-walkthrough wave: three-language support (ar-DZ RTL / fr-DZ / en) with functional selector, persistence, Noto Kufi Arabic typography and LTR-safe identifiers across shell, dashboard, POS, cash, inventory, customers/debts, transfers, settings and all shared dialogs/tables.
- [x] Client-walkthrough wave: RTL layout rules (sidebar, tables, dialogs, mobile drawer) verified on all 18 routes in Arabic with zero page errors; French dark and mobile Arabic navigation verified.
- [x] Client-walkthrough wave: corrected stale Settings claim about the open-decisions register; language preference wired to the real selector.
- [x] Remaining English inner labels translated (see corrective passes).

## Corrective pass (multilingual + test workspace)

- [x] IndexedDB test workspace: phone intake → stock → POS; accessory receiving balances; local test sales; seller switching; reset with fixture revision
- [x] FR/AR for suppliers, purchases, expenses, facility, SAV, catalog, users, reports, audit; localized validation and statuses
- [x] Remaining English: fixture record names/details, USER/ROLE/AREA headers, users capability descriptions, catalog templates (technical codes intentionally unchanged)
- [x] Transfers, facility, SAV, debts/credit requests and repayments use the persisted workspace (src/data/test-workflows.ts)
- [x] Screenshot matrix 18 routes × 3 locales × 2 themes (108) at 1440×900; AR mobile/tablet transfer + SAV checks
- [ ] Session-generated audit action text (e.g. 'Test phone intake') still English in FR/AR audit list
- [ ] Keyboard focus-trap audit for every dialog not individually executed

- [x] Review 11: debt figures split confirmed/draft/projected; pure credit-draft pricing; transfer-vs-POS conflict flag + revalidation; audit action localization; dialog focus return; 184 Vitest + 31 browser PASS.

## Option 01 — simple phone intake

- [x] Compact intake, explicit store in ALL scope, generated unit barcode, IMEI checksum/serial fallback, one-unit rule, double-submit guard, tests + browser evidence (docs/evidence/phone-intake/)

## Batch 2b — warranty and documents
- [x] Shared owner legal/warranty settings and explicit staff read list.
- [x] Confirmable warranty rules in native/local POS; provider saved and SAV guidance.
- [x] Additive atomic legal/public numbering and immutable bilingual documents with print-only legal gates.
- [x] Rule/UI/atomic regressions, full suite, src lint, automatic strict check/build, short report with logs.

## Batch 3a — POS and sale correction
- [x] Atomic split settlement, server discount limit snapshot and audited owner setting.
- [x] Terminal-only parked baskets without reservations in local/native POS.
- [x] Store manager/owner atomic idempotent open-shift void and immutable receipt history.
- [x] Rule/mounted regressions, full suite, src lint, strict check, automatic build and short report.

## Batch 3b — cash movements and customer credit
- [x] Additive atomic cash movements, credit settlement/debt and capped repayment/reversal commands.
- [x] Local/native cash, POS and credit interfaces; owner reasons and scoped overdue alerts.
- [x] Concrete rules and mounted flows, full tests, lint, strict check, build and report.

## Batch 9a
- [x] Move legacy db/reconciliation, db/security to legacy/db; batch logs to docs/evidence/batches
- [x] 4 signed lifecycle rows active (sealed box, supplier cost, supplier payments, transfer discrepancy); 11 others describe.todo
- [x] Checklist 46 DONE / 8 PARTIAL

## Batch 9b
- [x] 6 SAV signed lifecycle rows active; exchange mixed and credit regressions
- [x] Fix: SAV return of a credit sale cancels unpaid debt (0017)
- [x] Checklist 52 DONE / 2 PARTIAL

## Batch 9c
- [x] Report XLSX/PDF + Zakat signed test (no cost/margin for staff), stock-count lost-reply recovery test active; no describe.todo left
- [x] Checklist 54 / 54 DONE

## Batch 9d
- [x] 0018: SAV return reduces credit only by returned line; refund limited to excess; zero-money return allowed
- [x] Signed tests: multi-line credit, single-phone credit, repayment before return

## Batch 10 — final visual style
- [x] Vazirmatn, three button levels, POS Encaisser bar, quiet panels, greys, design doc, 32 captures
