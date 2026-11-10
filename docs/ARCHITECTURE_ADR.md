# Architecture decisions

## Current frontend

TanStack Start routes, React 19, Tailwind CSS v4 semantic tokens. Shared root provider controls synthetic scope and theme. Demo adapter implements typed list contract; no live auth/database/server function added. Drafts live in shared session or component memory and do not mutate balances. Monetary values are decimal strings; BigInt minor-unit calculations preserve two decimal places without rounding. More than two decimal places are rejected, not rounded; future financial precision needs review.

## Future database design — not executed

Normalized PostgreSQL proposals with separate role and membership tables; confidential costs isolated in an ungranted table behind an owner RPC. Authenticated transactions must re-derive prices, totals, scope, seller and shifts from trusted records. Narrow function EXECUTE grants, safe search_path, row locking, audit and full-payload idempotency required. Six SQL proposals exist but none is executed; required atomic commands remain missing.

## Shared terminal

Future seller handoff must authenticate the incoming operator, close prior operator session, bind device/store/shift, expire authorizations, support revocation and audit every transition. UI preview does not establish identity. Offline PIN handoff is not authorized.

## Review 05 — unified data access

`ErpRepository` is the intended data-access boundary; current consumers still include direct `businessDemo` and session-store imports. Production activation must inject the repository into those consumers first. The demo implementation shares in-memory drafts without persistence; no replacement was activated.

## Review 05 — integration contracts

`src/domain/contracts.ts` fixes the request envelope (contract version, idempotency key, actor context) and the result union (success / VALIDATION / AUTHORIZATION / CONFLICT with retry safety). Idempotency key format is shared between the frontend contract and the proposed `idempotency_records` table.

## Review 05 — migration proposals

Version-controlled SQL proposals live in `db/proposed/0001–0006` (stores/users/roles, inventory, sales/cash, purchasing with confidential costs, facilities/transfers/SAV, audit/ledger/idempotency/offline). All are UNDEPLOYED and UNTESTED; execution requires explicit owner authorization and a dedicated test database.

## Review06 — inactive authenticated preparation

`SupabaseRepository` preserves the read interface, ignores role preview, validates strict cost-free Database DTOs and rejects synthetic draft methods. New strict command envelopes omit caller actor authority. A separate user-bound server-only gateway whitelists future one-transaction RPCs; no endpoint/client/auth code is connected. Real role/membership, inventory, prices and balances must be SQL-authoritative.

## Review06 — containment and acceptance

All six proposals remove direct authenticated business DML, tighten five helper search paths and sensitive reads, but missing constraints/transactions remain activation blockers. Real A-J test harness is opt-in for authorized disposable local Auth/PostgreSQL; ten skips are NOT acceptance passes. No production activation based on structural unit tests or demo browser evidence.
