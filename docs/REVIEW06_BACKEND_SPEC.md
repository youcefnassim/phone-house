# Review 06 — inactive backend integration specification

Status: PREPARATION ONLY, NOT PRODUCTION-READY. No database connected, SQL executed, account provisioned or transaction posted.

## Preserved architecture and actual framework

The working application still selects `demoRepository`. `SupabaseRepository` is an uninstantiated implementation of `ErpRepository`, with a separately injected authenticated transport. No existing draft call becomes a posting: production draft methods fail closed. Production records have `source: Database`; strict operational DTO parsing rejects confidential extra fields. The legacy `read(scope, role)` signature is preserved, but the production adapter ignores the role preview. Requested scope is a filter, never authority.

The installed manifest specifies TanStack Start 1.168.60, Router 1.170.41, React 19, Vite 8.1.5 and Lovable Vite config 2.26.5 (not the generic Vite 7 template description). SSR/server functions execute on Cloudflare workerd after publishing; local dev runs on Node. No Node-only database driver is added. Future Supabase clients use fetch-based APIs. No SDK or generated integration module is imported before owner connection.

## Inactive authenticated command boundary

`src/backend/command-gateway.server.ts` defines a user-bound port and gateway only. It is not an HTTP endpoint. No credentials, env reads, service-role client or backend initialization exist. Future wiring: `createServerFn` with generated `requireSupabaseAuth`; load the helper only inside the handler; adapt `context.supabase.auth.getUser()` and `context.supabase.rpc()`. Register the generated bearer attacher only if no equivalent exists. Set authenticated responses `Cache-Control: no-store`. Protected pages belong beneath the managed `_authenticated` client-only layout; public pages must not call authenticated loaders. Preserve demo previews until explicitly switched.

The gateway whitelists RPC names, validates the envelope, never accepts `actor` in the trusted envelope, revalidates identity, and uses the same user-bound client for RPC. The proposed RPCs do not yet exist: invoking this preparation against the six SQL files will fail. It is structural preparation, not a completed production adapter.

## Command and read contracts

| Boundary            | Planned SQL entry point                             | Required behavior                                                                                                                                   |
| ------------------- | --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Read                | `read_operational_snapshot(requested_scope)`        | Resolve identity, roles and membership; intersect requested scope; explicit cost-free columns; exact decimal JSON strings; no raw row serialization |
| Owner read          | `owner_purchase_finance(uuid)`                      | Authenticated Super Admin only; narrow return shape; cost/payment values as decimal strings, no shared caching                                      |
| Intake              | `command_phone_intake(request)`                     | Manager+ assigned store; global identity registry covers IMEI1 and IMEI2; immutable identity                                                        |
| Accessory receipt   | `command_accessory_receiving(request)`              | Manager+; SKU kind verified; lock balance key before ledger append; never below zero                                                                |
| Shift open          | `command_cash_shift_open(request)`                  | Same-store drawer/operator verified; one physical drawer/store and one open shift/drawer                                                            |
| Checkout            | `command_pos_checkout(request)`                     | Seller+ active identity/shift; server price; canonical payload hash; atomic sale, lines, stock, payment, ledger, audit and replay record            |
| Cash movement/close | `command_cash_movement`, `command_cash_shift_close` | Open shift locked; actor derived; blind count read path hides expected totals; close verification rights enforced                                   |
| Repayment           | `command_debt_repayment(request)`                   | Manager+; lock debt; cumulative cap; same-store linked sale/customer; correct cash/bank ledger                                                      |

Client seller/operator IDs and unit prices in older payload schemas remain untrusted assertions. A command must reject mismatch or derive values from current authorized session/price rows; never use them as authority. Review05 `OperationRequest.actor` is legacy descriptive context, not an authentication mechanism. New `commandEnvelope` is strict and omits it. Transfer, refund, supplier settlement, facility confirmation and operational offline commands intentionally have no executable gateway until policy and transaction design are approved.

## Required transaction algorithm (not implemented SQL)

1. Validate auth.uid(), active provisioning, current database roles and membership inside the command; no JWT role claims/browser state as business authority.
2. Reserve `(actor, operation, idempotency_key)` with a unique key and canonical payload hash, contract version and requested store. Concurrent same-key requests serialize; mismatch rejects; replay returns the original safe result without new effects.
3. Lock shift, phone units, accessory SKU/store balance keys, debt or obligation in a stable order. A SUM over a ledger alone does not prevent overspend. Re-check all foreign-key store/kind relationships and current availability under locks.
4. Calculate with unscaled NUMERIC or validated decimal strings converted after precision check. Reject values with more than two fractional digits before storage; never let NUMERIC(14,2) silently round input. Capacity/precision policy remains reviewable, not owner-approved.
5. Write all operational effects and tender-specific cash/bank/debt/supplier ledger entries, immutable attribution, audit and final replay response in the same database transaction. Failure must roll back every effect.
6. For serialization/deadlock conflict, roll back and return retry-safe conflict; business collisions are not automatic retries. Network uncertainty retries only the exact same key and payload. Do not replay stale offline commands automatically.

## Completion gates

SQL functions, mapping read projections, provisioning/session lifecycle, privilege-hardening, financial/reversal design, migration execution, genuine multi-role RLS tests, concurrency tests and published Worker verification remain unfinished. No claim of operational authentication, financial integrity or offline reliability is made.
