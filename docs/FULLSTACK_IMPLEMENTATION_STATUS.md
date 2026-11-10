# Owner-authorized external development: actual status

Starting revision verified: `1662d60dccc957180db02ac011705f31e58e3bc8`. Built-in Cloud was not enabled. No external connection, database execution, accounts, production data or publishing occurred.

## Implemented in code

- Request-scoped authenticated transaction/read functions now resolve server-owned dedicated development configuration rather than an unconditional stub. Host/ref/key/environment/owner attestation must match; Auth verification and RPC use the same bearer. Missing configuration denies access. Real UI activation remains disabled.
- Settings calls the actual connection-status server function and accurately reports NOT CONNECTED. New text and previously fixed-English policy labels use all three locale dictionaries.
- Lost/undecodable mutation responses preserve unknown outcome and original idempotency key. Successful responses must match the request key. Money input bound is exact NUMERIC(14,2), without rounding.
- Separate durable production outbox implementation: immutable parsed requests, duplicate-key/payload checks, project/user/device/store routing separation, policy/auth stops, tab leases, crash recovery, conflict states and same-key reconciliation. No production replay port or operational offline UI is activated; no service worker/device approval exists.
- Typed supplier-create, original-sale-linked SAV inspection and service-event commands plus authenticated gateway dispatch and exact result schemas. SQL candidates include original-sale/customer/store/IMEI validation, inspection duplicate constraint, immutable event history, RLS/grants and server-derived attribution; no refunds/restock/replacement or warranty entitlement introduced.
- Hosted read-only preflight and strict direct-RPC JSON-type validation candidates under `legacy/db/reconciliation/`. These are not managed migrations, not approved and not compiled/executed. Historical twelve proposals remain intact. Full hosted baseline reconciliation is incomplete.

## Actual verification

- Initial command `bunx vitest run`: **184 pass**, baseline preserved.
- First expanded run: 205 assertions passed but one unhandled abort rejection and three TypeScript issues occurred; that run was not clean. Aborted transaction rejection handling and test types were corrected.
- Follow-up full run: **209 pass**, no unhandled errors; final full run including supplier/SAV: **215 pass**, 19 test files, no failures or unhandled errors, recorded in `docs/evidence/external-backend/unit-results.txt`.
- Build/typecheck: automatic harness output checked in `/tmp/observability/build-errors.log`; no manual project build/typecheck commands run.
- Browser script: `python3 /tmp/browser/external-backend/check_connection.py`; actual FR status response, real IndexedDB duplicate/policy-block checks, persisted readback after renewed navigation, EN status, AR dark 390×844 with no horizontal overflow and no page errors. Initial run interrupted by development-server navigation; rerun passed. This is not a hosted transaction test and does not re-certify all previous 31 workflows.
- Browser evidence/script copied under `docs/evidence/external-backend/`; no secrets stored there. Outbox confirmation/concurrent-replay unit tests use mocks, not real PostgreSQL.

## Blocked / not run / incomplete

**Connection blocker:** owner creates a dedicated nonproduction external Supabase project and connects it in Lovable Settings → General → External Supabase → Connect. No built-in Cloud shortcut.

Required profile-data question has been asked; no new sign-in/invitation/reset code was written before that answer. After connection, confirm exact environment and review/approve exact migrations before execution. Hosted Auth settings are unverified.

The complete real ERP is **not finished**: remaining authoritative UI mappings, complete hosted baseline, catalog/pricing/procurement/transfer/facility/finance/storage/export/account commands, real sign-in, approved device replay and hosted acceptance remain open. Existing local workspace stays operational and isolated. All PostgreSQL, direct RLS/cost secrecy, concurrency/rollback/journal, hosted account, backup/restore, hardware and live-release checks are **NOT RUN**. Unapproved legal/credit/refund/transfer discrepancy/bank reconciliation/offline policies remain blocked. Do not call the app ready for live trade.
