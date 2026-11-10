# Native retail presentation

- Native daily controllers and document presentation consume strict native DTOs without importing the local workspace; source-level HTTP lifecycle tests can therefore run without activating or mixing hosted and browser-local data.
- Native mutation outcomes retain the original key until authorized post-write readback succeeds; no automatic retry or local success substitutes for an uncertain transaction.
- An explicit host transport selects a workspace-free native shell and daily forms; absent host integration preserves local pages, while denied host prerequisites never fall back to them.

- Native SQL gates, demo operations and navigation derive roles from `src/domain/permissions.ts`; transfer approver policy is isolated there so store assignments never imply role authority.
- Local staff overrides persist separately from immutable legacy identity fixtures, preserving historical attribution and preventing implicit reactivation.
- Cross-module synthetic drafts live in the shared in-memory session store (`src/data/session-store.ts`); the demo read contract merges them so a draft from one module is selectable in another during the same session, without persisting or posting anything.
- Cross-module local test workflows (transfers, debts/credit requests, repayments, facility evidence, SAV, refund reviews) live in `src/data/test-workflows.ts`, re-validate against current workspace state and persist via the IndexedDB workspace; components never hold their own business drafts, so one source of truth survives reload/reset.
- `debtFigures` splits recorded vs draft amounts; drafts are never collected money.
- Transfers never reserve stock; conflicts require revalidation clearing approvals.
- Dashboard and report figures derive from the test ledger via `src/data/ledger-view.ts`; never hardcode demo totals so presented numbers match the workspace.
