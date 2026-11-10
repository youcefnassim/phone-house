# External dedicated-development reconciliation

**NOT DEPLOYABLE AS A BUNDLE / NOT EXECUTED.** Historical `db/proposed/0001–0012` remain untouched evidence, not hosted migrations. Do not copy them into managed migration directories. Once the owner connects the exact dedicated nonproduction project, inspect the real schema and supported migration tooling, produce a digest-bound exact migration, and obtain approval before applying it. No schema changes or data resets are authorized now.

## Reconciliation requirements

- Retain platform-managed Auth, anon/authenticated/service roles; never execute local Auth simulations against hosted PostgreSQL.
- Confirm restricted nonlogin, non-bypass `ph_engine` creation and temporary ownership-transfer membership are supported by the actual migration principal. Remove temporary membership/CREATE privileges afterward.
- Avoid changing global default privileges for hosted `postgres`; explicit per-function ACLs and an approved application creator are required.
- Check actual exposed API schemas separately; `private` must not be exposed. Record full definitions, grants, RLS, owners and membership, not only table names.
- For a fresh dedicated empty project, produce one reconciled baseline. For existing objects, verify identity and definitions and use explicit backfills before NOT NULL constraints. Never silently use `IF NOT EXISTS` or fabricate provenance/costs.
- `strict_rpc_validation.sql` is a review candidate for direct RPC JSON-type parity, not an approved migration. It leaves all business policy gates intact. It requires predecessor function ownership and must be integrated once into the baseline, not blindly rerun.
- Transfer approval stage guards, seller-attributed shifts, authenticated operational read visibility, missing catalog/prices/supplier/SAV/facility/transfer commands and cost-free frontend DTO completeness still require reconciliation and tests before activation.
- Do not redirect disposable A–AJ acceptance runners toward hosted databases. Hosted acceptance must use real synthetic Auth identities, non-destructive fixture ownership, independent project confirmation and per-test persisted-state proof.

`hosted_preflight.sql` is read-only inspection source, NOT RUN. No migration workflow is available in this currently unconnected project; built-in Cloud must not be enabled to obtain one.
