# Approved staff and cash closeout — local acceptance

Starting source: a096a3a2243573b698daba11dd4d786e507708fa. Last checked implementation source before final documentation: a41a2e127ad191b291b025caec01caea80383b73. Changes are client-review only; no backend source changed, provider provisioned, credential accessed or owner browser reset.

## Implemented

- Active roster: U-OWN owner across M01/M02, U-S01 + U-S03 M01 sellers, U-M02 M02 Manager/POS operator. U-M01 and U-S02 are inactive and still resolvable historically.
- Hydration changes retired **current operator choices only** to active defaults; sale, shift, cash and audit snapshots keep original attribution. No fixture reseed/revision reset. New sales/cash carry stable operator IDs; old records need no synthetic backfill.
- Exactly DRAWER-M01 and DRAWER-M02; distinct M01 sale operators share a shift. Store scope follows operator; role selection remains explicitly not authentication.
- Both M01 sellers and M02 Manager close directly. M01 CLOSED carries REVIEW_PENDING; owner appends reviewed/no-issue or flagged metadata. Original count, expected amount, discrepancy, closer and time remain unchanged. M02 owner review is optional.
- Stale session ID, duplicate sale key, repeated cash movement, closed drawer and cross-store posting guards run synchronously before local mutation. Only net cash sale total enters the physical drawer; bank, facility evidence and credit drafts do not.
- Transfer approvals still require named active owner and M02 Manager. Sellers cannot approve; destination completion requires every manifest scan. Scope checked for prepare/dispatch/receive/scan.
- Existing owner finance projection stays owner-only in previews; no server-security claim. Discounts/credit/warranty/fiscal/refund OD policies remain unconfigured; no new posting rules.

## Executed evidence

| Check                                            | PASS | FAIL | Evidence                                                                  |
| ------------------------------------------------ | ---: | ---: | ------------------------------------------------------------------------- |
| Focused new domain cases                         |   15 |    0 | src/test/staff-closeout.test.ts, full suite includes these                |
| Full Vitest suite                                |  411 |    0 | evidence/staff-closeout/unit-results.txt, 31 files                        |
| Linked isolated browser scenarios                |   16 |    0 | run.py, results.json, shots/                                              |
| 19 routes × FR/AR/EN × Light/Dark × 390/768/1440 |  342 |    0 | matrix/routes.py, route_results.json, screenshots/                        |
| Automatic build/typecheck                        |   OK |    — | latest observability build OK; harness-managed, no manual build/typecheck |

Browser scenarios: two seller accessory sales on one M01 shift, blind close by each seller, pending review, forbidden seller review, owner flag retaining close snapshot, reload, M02 scope, manager phone intake and named cash checkout, separate invoice/warranty specimens and zero-ledger-mutation printing, direct manager close and no ERP-context runtime error. Scripts use fresh Chromium contexts and never restore owner credentials. Initial runner failures were selector/language timing issues; final stabilized runs above replace them.

## NOT RUN / blocked

- Hosted Workers/D1/private R2, genuine identity/PIN/session, cross-device/server transaction races, rollback and physical drawer/scanner/printer: NOT RUN, authorization/connection deferred.
- Single-thread local commands and one IndexedDB snapshot transaction are not multi-device locking; BroadcastChannel is not transactional concurrency protection. Real deployment needs server-enforced identity/store/role authorization and concurrency/idempotency acceptance.
- Existing owner browser data were not inspected. Preservation is covered by isolated migration/lifecycle tests and new workflow reload, not by reading real customer data.
- New cash-close/review interactive flow was exercised in EN desktop only. FR/AR, themes and sizes received render checks, not all form permutations. Transfer/facility/credit negative rules exercised by unit suite, not replayed interactively this wave. Every-control audit, real device acceptance and certified backup remain NOT RUN.

## Changed source

src/domain/review-staff.ts; src/data/{test-workspace,test-workflows}.ts; src/components/erp/{context,business-ui,shell,pos,transfers-business,cash,users}.tsx; src/locales/{retail,messages,audit-actions,display}.ts; src/test/staff-closeout.test.ts; AGENTS.md; roadmap.md; walkthrough/readiness and this evidence. Existing native/PostgreSQL references, context identity module, intake schemas and historic audit matrices preserved.
