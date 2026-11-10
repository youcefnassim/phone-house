# Developer Setup — Phone House Maghnia (Track B)

## Prerequisites

- Node.js 20.19+ or 22.12+ and [Bun](https://bun.sh) (Vite 8 compatible).
- A checkout of this repository. No backend, database or external account is
  required: the app runs entirely on synthetic demo data.

## Install and run

```bash
bun install
bun run dev        # Vite dev server (default port 8080)
```

## Quality gates

```bash
bunx vitest run            # unit/component tests (src/test/)
oj typecheck -b --noEmit   # TypeScript project check
```

The hosted harness also runs build + typecheck automatically on every edit.

## Source map

| Path                  | Purpose                                                                                                                                                                                                                                            |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/domain/`         | Typed domain: `erp.ts` (money, cart, roles), `operations.ts` (POS/cash/inventory schemas), `business.ts` (customers, debts, suppliers, transfers, facility, SAV), `contracts.ts` (future API contracts), `repository.ts` (data-access boundary)    |
| `src/data/`           | `demo.ts` + `operations-demo.ts` (fixtures), `business-demo.ts` (scoped read contract), `business-owner-demo.ts` (SUPER_ADMIN-only finance projection), `session-store.ts` (shared synthetic session), `demo-repository.ts` (demo `ErpRepository`) |
| `src/components/erp/` | Shell, dashboard, POS, cash, inventory, business modules, catalog, users, audit, reports, settings                                                                                                                                                 |
| `src/routes/`         | TanStack Start file routes (one per workspace)                                                                                                                                                                                                     |
| `db/proposed/`        | UNDEPLOYED/UNTESTED PostgreSQL migration proposals                                                                                                                                                                                                 |
| `docs/`               | Decision register, verification reports, architecture, runbooks                                                                                                                                                                                    |

## Working agreements

- Money is always a decimal string; compute in integer minor units.
- Demo data is labeled DEMO DATA; session drafts never mutate fixtures.
- No backend, authentication, Cloud or Supabase without explicit owner
  authorization. Never access the separate Antigravity implementation.
- Visual tokens live in `src/styles.css`; both Light and Dark themes must
  stay equivalent.

## Inactive backend preflight

See `REVIEW06_BACKEND_SPEC.md`, `REVIEW06_SQL_AUDIT.md`,
`REVIEW06_AUTHORIZATION.md`, `REVIEW06_TEST_MATRIX.md` and the updated backend
runbook. `SupabaseRepository` and user-bound command gateway are inactive;
no SDK/server endpoint/auth flow is enabled. Unit tests validate structure only.
`python3 tests/integration/review06_transactions.py` reports ten skips without
explicit local approval; genuine database execution still requires owner
authorization, completed SQL commands and isolated synthetic accounts.
