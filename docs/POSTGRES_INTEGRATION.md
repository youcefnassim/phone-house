# PostgreSQL Integration Design — UNDEPLOYED / UNTESTED

Status: **proposal only**. No migration in `db/proposed/` has been executed
against any database. The real database connection remains postponed until
explicit owner authorization. The future database must be a dedicated,
owner-controlled PostgreSQL instance, fully separate from the Antigravity
implementation (no shared code, credentials, databases or deployments).

Review06 supersedes the invariant claims below: these describe intended design,
not supplied executable command enforcement. See `REVIEW06_SQL_AUDIT.md` for
defects and containment, `REVIEW06_BACKEND_SPEC.md` for missing RPC boundaries.
Direct authenticated posting privileges are now withheld. The current proposal
is intentionally non-operational and some read policies need safe redesign.

## Migration files

| File                                           | Contents                                                                                                                                                        |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `db/proposed/0001_core_stores_users_roles.sql` | stores, profiles, `user_roles` (separate from profiles), `store_memberships`, `has_role` / `is_member_of` security-definer functions                            |
| `db/proposed/0002_inventory.sql`               | catalog entries, serialized `phone_units`, append-only `accessory_stock_ledger`                                                                                 |
| `db/proposed/0003_sales_cash.sql`              | customers, drawers, shifts (one OPEN per drawer), movements, sales + lines with idempotency key, debts, repayments, overpayment guard                           |
| `db/proposed/0004_purchasing.sql`              | suppliers, cost-free operational purchases, receipts, confidential `purchase_finance` (no authenticated grant), `owner_purchase_finance()` gated to SUPER_ADMIN |
| `db/proposed/0005_facility_transfers_sav.sql`  | M01-only facility contracts with exact schedule check, remittance evidence, dual-approval transfers, scan/discrepancy tables, warranty cases, refunds           |
| `db/proposed/0006_audit_offline.sql`           | append-only `audit_events` and `ledger_entries`, `idempotency_records`, device sessions, offline submissions, sync conflicts                                    |

## Data types and constraints

- All money is `NUMERIC(14,2)` with `CHECK (… > 0)` / `>= 0` as appropriate.
  The frontend already computes in integer minor units; the database stores
  decimals and must never use floating point.
- Dates: `DATE` for due/expected dates, `TIMESTAMPTZ` for events, `TEXT` with
  `^\d{4}-(0[1-9]|1[0-2])$` for facility months.
- IMEIs: `TEXT` with `^\d{15}$` check; `imei1` globally `UNIQUE`; `imei2`
  must differ from `imei1`.
- Idempotency keys: `TEXT PRIMARY KEY` matching
  `^[A-Za-z0-9][A-Za-z0-9-]{15,79}$` (same rule as `src/domain/contracts.ts`).

## Transaction boundaries and locking

- **POS checkout** is one transaction: insert sale + lines, transition
  `phone_units` to `SOLD` (`SELECT … FOR UPDATE` on each serialized row),
  append accessory ledger deltas, insert cash movement, insert idempotency
  record. Any failure rolls back everything.
- **Repayment** locks the debt row (`FOR UPDATE`) and rejects amounts above
  outstanding inside `assert_repayment_within_outstanding`.
- **Cash shift** open conflicts are prevented by the partial unique index
  `one_open_shift_per_drawer`; blind close updates the shift row only.
- **Transfer** stage transitions lock the transfer row
  (`assert_transfer_stage`); dispatch requires both approval flags.
- **Stock balances** are derived from append-only ledgers; concurrent writers
  never update the same balance row.

## Inventory / financial invariants

1. A serialized phone is sold at most once (`phone_units.status` transition
   guarded by row lock).
2. Receipts never exceed ordered quantity (checked against SUM of prior
   receipts inside the receiving transaction).
3. Repayments never exceed outstanding balance.
4. Facility schedule sums exactly to contract price
   (`installment_amount * months = contract_price`).
5. Facility remittances are bank evidence only — never cash movements.
6. Ledger and audit tables are append-only (no UPDATE/DELETE grants).

## Authorization matrix (proposed)

| Capability                         | SUPER_ADMIN    | MANAGER        | SELLER                      |
| ---------------------------------- | -------------- | -------------- | --------------------------- |
| Scope                              | M01 + M02      | Assigned store | Assigned store              |
| POS checkout                       | yes            | yes            | yes (own store, open shift) |
| Phone intake / accessory receiving | yes            | yes            | no                          |
| Cash movement                      | yes            | yes            | own drawer only             |
| Blind close verification           | yes            | yes            | no                          |
| Debt / repayment drafts            | yes            | yes            | no                          |
| Supplier receiving                 | yes            | yes            | no                          |
| Purchase costs / settlement        | yes            | **no**         | **no**                      |
| Transfer approval                  | yes (SA half)  | M02 half only  | no                          |
| Facility contracts / remittance    | yes            | read M01       | no                          |
| Refund execution                   | policy-blocked | policy-blocked | no                          |
| User/role administration           | yes            | no             | no                          |

## Confidentiality of owner purchase costs

`purchase_finance` has **no authenticated GRANT**. The only read path is
`owner_purchase_finance()`, a security-definer function that re-checks
`has_role(auth.uid(),'SUPER_ADMIN')` and is granted `EXECUTE` to
`authenticated` only. Operational purchase API responses contain no cost
columns at all, so costs cannot leak through ordinary list endpoints.
Client-side dynamic imports and role previews in the current frontend are
**not** access control and are never treated as such.

## RLS notes

- Every table enables RLS; policies use `has_role` / `is_member_of`
  (security-definer, `search_path` pinned, `EXECUTE` revoked from anon).
- `audit_events` and `ledger_entries` grant SELECT only to authenticated;
  writes go through service_role or security-definer functions.
- All future externally callable privileged commands must enforce identity and
  scope internally. Current internal helpers are not complete command paths;
  execution/ownership/default privilege behavior remains database-untested.
