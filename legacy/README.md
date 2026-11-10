# Legacy quarantine (2026-11-09, batch 1e)

Inactive Supabase/PostgreSQL reference code. Excluded from the app build, `tsconfig.json`,
ESLint and Vitest (`src/**` only). Never imported by `src/`. PostgreSQL proposals in
`db/proposed/` are UNDEPLOYED/UNTESTED and must never be executed without explicit owner authorization.
