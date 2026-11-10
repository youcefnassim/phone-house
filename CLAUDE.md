# PHONE HOUSE MAGHNIA — CLAUDE CODE (finishing phase)

Repository exported from Lovable project "Phonehousev2" (branch main) as a ZIP.
Last auditor-reviewed Lovable commit: a2cb2d1e (local git history starts at the
"Lovable export" commit; GitHub not connected yet). Lovable is FROZEN: no edits there.

## CONTEXT
- Internal ERP/POS for two phone stores, M01 and M02. Not e-commerce.
- Stack: TanStack Start + React 19 + Tailwind + shadcn (frontend);
  Cloudflare Worker + D1 (SQLite) + private R2 (backend). No Supabase, ever.
- Backend: src/backend/worker.ts, src/backend/native-api.ts,
  src/backend/sqlite/*, migrations db/sqlite/0001… (additive only; never edit
  an existing migration, add a new numbered one).
- Permissions + route registry: src/domain/permissions.ts.
- Read first: docs/DECISION_REGISTER.md (overrides older docs),
  docs/V1_OPTION_CHECKLIST.md, docs/DESIGN_SYSTEM.md.
- Legacy Supabase/PostgreSQL code is quarantined under legacy/. Never use it.
- Brand: Vazirmatn font, Phone Blue #1238C9, Night Ink #0B1233, Door Yellow
  #FFC21A for attention only; 3 button levels; see docs/DESIGN_SYSTEM.md.

## SAFETY RULES
- Never touch real customer data. Local Miniflare/D1 with synthetic data only.
- No Cloudflare deployment, DNS change, secret creation or production
  migration without the owner's explicit "go" for that exact resource.
- Never weaken a test or change fixtures to make a test pass.
- Never store secrets in the repo.
- Ask before installing anything system-wide.

## TOOLING
- Node 22 via fnm (~/Library/Application Support/fnm), bun at ~/.bun/bin/bun.

## PHASES
- Phase 1 — Verify: report findings ranked P0/P1/P2 with file:line, then STOP
  for owner approval.
- Phase 2 — Production wiring: owner-approved resources only.
- Phase 3 — Acceptance: hardware, browser smoke, M01 pilot GO / NO-GO with evidence.
