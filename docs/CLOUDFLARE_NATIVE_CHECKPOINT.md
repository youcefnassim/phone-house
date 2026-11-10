# Cloudflare-native data checkpoint

## Architecture decision

Owner correction at 23:27 UTC, 6 November 2026 overrides external Supabase. No Cloud, Supabase, Cloudflare connection, credentials, provisioning, hosted migration or deployment is authorized. Antigravity is untouched. Existing PostgreSQL proposals/reconciliation and evidence remain unchanged references, not native migrations.

**Recommended: native D1 + private R2**, because business data must reside at Cloudflare. D1 uses SQLite, with no PostgreSQL RLS or SECURITY DEFINER. An authenticated private server must own all SQL access and enforce actual account/store roles. Private documents require server authorization too. Existing PL/pgSQL proposals require substantial reengineering, not a rename.

**Alternative: Workers + Hyperdrive + externally hosted PostgreSQL** preserves PostgreSQL transaction/RLS semantics but does NOT meet the owner's Cloudflare-resident data requirement. Hyperdrive is a connection service, not a PostgreSQL host. Ephemeral containers are not a financial database solution.

## Implemented in code

- `db/sqlite/0001_erp.sql`: versioned SQLite source covering stores/accounts/roles, drawers/shifts, catalog/phone identifiers/accessory stock/prices, sales/payment/journal/audit, procurement/nullable confidential costs/receiving, customers/debts/repayments, transfer approval/scan records, M01 facilities/installments/bank evidence, SAV, expenses, private document metadata and settings. No actual company/customer fixtures. SQLite has no RLS; private costs remain accessible only through owner-authorized projection code.
- `src/backend/sqlite/port.ts`: injected database/verified-identity/private-document contracts; no provider credentials or browser database binding.
- `d1-port.ts`: structural D1 binding adapter using ONE `batch()` for the ordered command plan. No Worker application, deployment entrypoint, Wrangler configuration or provisioning code.
- `checkout.ts`: authoritative integer-centime pricing from SQL, key/actor/store/hash binding, seller/store/shift/stock checks inside batch, serialized exclusivity, aggregated accessory quantities, exact tender/change, stock movements, payment, cash, balanced journal, audit and response readback. Deliberate CHECK failures reject and roll back the whole batch; no dependence on zero-row updates or cross-statement `changes()`.
- `service.ts`: injected verified identity, database-backed role checks, explicit operational projections for every module, separate global Super Admin finance, private owner-only documents pending classification. Bank tender is unreconciled, not bank confirmation. Unsupported financial operations fail closed. Unknown outcome retains the request key.
- Existing server functions no longer activate the Supabase transport, even if old environment values appear. Settings now names D1/R2 and no longer recommends Supabase in any language.

## Verification scope

Tests use an actual local SQLite engine on synthetic in-memory records, plus one isolated temporary file for lock contention. This is **local SQLite-executed evidence**, not D1/Workers/R2 or hosted-auth acceptance. Statement syntax and local atomic rollback are exercised. Remote batch concurrency, retries, quotas, replication and real identity verification remain NOT RUN.

Observed: **234 tests pass in 20 files**, including **19 local SQLite tests**; automatic build/typecheck OK. French desktop/mobile Settings displays D1/R2, has no Supabase connection instructions, no page errors and no horizontal overflow. All 19 content routes retain sharing metadata. Evidence: `docs/evidence/native-sqlite/`. Browser check is target/status presentation only, not an authenticated native backend workflow. Schema SHA-256: `5539bdd0c9f9625eaf3114dee23867ca94adf8f16e9db262495a082ad862e48f`.

## Incomplete / blocked

- Native schema coverage is not complete transactional workflow coverage. Only native checkout is implemented end-to-end as a transaction plan. Native intake/receiving, shift commands, transfer progression, debt posting/repayment recording, facility allocation, expense posting, SAV actions, account onboarding/invitations/recovery, backup/restore and attachment uploads still need command implementation and acceptance; financial/return/offline policies remain OPEN.
- Current ERP pages remain the isolated TEST workspace. Native service results are NOT cast into demo DTOs or activated as authoritative UI. Full production mapping and authenticated UI integration remain unfinished.
- Identity verifier is an injected port, not a fake sign-in flow or implemented identity provider. Profile requirements and account-provider design still need resolution. No real users were created.
- Purchase confidentiality additionally depends on a genuinely private D1 binding and no public database APIs. Source checks alone are not a deployed isolation certification.
- Native batch authorization must be applied to future commands too. Multi-step read authorization does not prove revocation-race handling; D1 Sessions/read consistency and same-batch sensitive read gating need hosted verification.
- All document bytes are conservatively owner-only until attachment classification is approved; no public object URLs.
- Historical full-stack checkpoint is superseded for provider recommendations, not deleted.

## Exact approval / hosting requirement

Lovable does **not support deploying this app to Cloudflare Workers/Pages**. Its Cloudflare connector manages account resources, not moving or hosting this app. Consequently no Cloudflare app deployment infrastructure is generated here. A separately supported external deployment path operated by the owner/developer is required for the desired native host; Lovable Publish must not be presented as deploying it to Cloudflare.

Before any hosted work, owner must separately approve: the specific development Cloudflare account (verified account ID), the exact D1 database and private R2 bucket identities/names and region/jurisdiction requirements, resource creation vs existing-resource use, associated costs, the exact schema version/hash and synthetic acceptance commands, and the chosen real identity verifier/issuer/audience and account flows. Connection is not migration or deployment approval. If runtime account operations are later authorized, an existing least-privilege accessible Cloudflare workspace connection must be linked only then (D1 database and R2 permissions restricted to the selected development account). No token entry or broad access is requested now.

## Official compatibility references

- https://developers.cloudflare.com/d1/worker-api/d1-database/
- https://developers.cloudflare.com/d1/sql-api/foreign-keys/
- https://developers.cloudflare.com/d1/sql-api/query-json/
- https://developers.cloudflare.com/d1/worker-api/return-object/

Keep OD-01 through OD-18 OPEN and originals byte-preserved. No production release or unapproved posting.
