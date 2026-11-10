# Executive Review07 — Transaction engine source

## Status

**Source implemented; operational activation BLOCKED.** No database connection, SQL execution, account creation, Cloud activation or production adapter activation occurred. This is the same maintained ERP application, not a replacement prototype.

### Implemented source

- Rewritten fresh-install proposals 0001–0010 with explicit grants/RLS and nonlogin, non-bypass `ph_engine` function ownership.
- Operational roles are `(user_id, store_id, role)`; global Super Admin requires null store. Active profiles and unrevoked assignments are checked and locked for command transactions. No role-plus-unrelated-membership composition.
- Global default PUBLIC EXECUTE revoked for both actual proposed function creators; explicit per-signature ACLs; creation privileges removed after ownership transfer.
- Private, unexposed purchase finance, supplier payments, price approvals, audit, journals and replay records. Owner projection returns decimal text only after current Super Admin verification.
- Canonical cross-slot IMEI registry; immutable phone/catalog identities; composite subtype and store references; locked accessory balances and append-only quantity ledger.
- One physical drawer/store, partial unique open-shift index, shared shift row lock for posting and close.
- Seven command RPCs: phone intake, accessory receiving, shift open, cash movement, blind close, checkout, repayment. Each accepts one strict JSON envelope and derives actor/store permissions inside PostgreSQL.
- Checkout handles mixed baskets, locks deterministically, derives prices from stored approved sources, creates sale/lines/payment/cash/stock/journal/audit/replay within one transaction. Later tender failure raises and rolls back earlier inventory changes.
- Bound immutable replay: actor, operation, version, requested store and PostgreSQL-computed SHA256 canonical-jsonb payload fingerprint. Replay requires current permission before returning the original transaction.
- Exact decimal string validation before unconstrained NUMERIC cast; no scale rounding. Technical reconciliation journals are balanced, append-only, require audit, and are not approved statutory accounting/tax classifications.
- Cumulative repayment/refund guards; original sale/customer/store/line/IMEI linkage. Refund eligibility and posting command remain unavailable.
- Contract-specific normalized installment rows with exact deferred sum validation. Salary evidence and verified bank remittance rows are separate. No rate/formula/month cap imposed by SQL.
- Transfer provenance references actual store-role assignment, protects manifest, enforces DRAFT insertion/stage order and exact full receipt count/code. Transfer stock-posting commands are outside the first seven commands and remain unavailable.
- Authenticated TanStack server-function source and user-bound fetch/RPC transport, no-store headers, strict decimal DTOs, precise SQLSTATE classifications and injected repository/cache factory. Resolver deliberately refuses configuration; current routes never call these functions.
- Provisioning preparation: first-owner operator SQL ends ROLLBACK; owner-only assignment/revocation code, inactive invitation port, independent-sign-in handoff requirement. No signup/session/PIN policy invented.

## Verification results

| Check                                        | Result                  | Meaning                                                                                                               |
| -------------------------------------------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Existing 92 local tests                      | PASS                    | Preserved baseline                                                                                                    |
| 20 added local tests                         | PASS                    | Inputs, money, unequal schedules, typed errors, mocked user-bound transport                                           |
| Total Vitest                                 | PASS: 112/112, 10 files | Not database acceptance                                                                                               |
| Latest harness preview compilation           | PASS                    | Preview build/typecheck signal; not published runtime certification                                                   |
| All 19 existing routes                       | PASS                    | Opened in browser, correct app-specific metadata, zero page errors                                                    |
| Dashboard screenshot                         | PASS                    | Existing Light layout preserved; no visual redesign                                                                   |
| SQL outer grammar                            | PASS: 10 files          | pglast static parse only, no SQL executed                                                                             |
| PL/pgSQL static bodies                       | PARTIAL                 | Parser cannot resolve `private.idempotency_records` composite; other inspected bodies parse; not database compilation |
| A–T real database tests                      | NOT RUN: 20 skipped     | Explicit database authorization absent                                                                                |
| Hosted Auth/RLS/real user UI readback        | NOT RUN                 | No backend connected                                                                                                  |
| Actual rollback/concurrency/default ACLs     | NOT RUN                 | Test definitions exist; no passing database claims                                                                    |
| Published Worker, restore, hardware, offline | NOT RUN                 | Separate acceptance needed                                                                                            |

## Remaining blockers / limitations

1. Execute and repair migrations/functions on an owner-approved disposable environment; static parsing does not resolve relation/type ownership, PL/pgSQL SQL planning or effective inherited privileges.
2. A–T harness uses independent SQL authenticated-role/JWT-sub contexts and privileged synthetic fixture readbacks, not actual hosted Auth credentials. Preserve Review06 HTTP harness and extend it with real independent users/server UI flows after authorization. No hosted signup/sign-in settings have been verified.
3. Intake/receiving record evidence requirements but do not yet atomically link inventory entries to purchase-receipt rows and confidential supplier obligation accounting. Receiving-cap trigger exists; full purchase receiving provenance is still a follow-up engine boundary.
4. Safe reversal links and immutable balanced history exist, but exact per-account opposite-line reversal posting, refunds, transfers, facility bank allocation and owner finance posting commands still need implementation and approved accounting/policy boundaries.
5. Provisioning invitation and revocation ports are preparation, not configured Auth administration. Shared-terminal handoff requires independent authentication; no simulated dropdown can become authorization.
6. Production repository is not activated. Generated authenticated clients/bearer attacher and replacement of remaining direct demo consumers await authorized integration. No runtime environment secrets read or backend URL configured.
7. Open-shift raw cash balances are withheld. Sales/repayment reads may allow partial inference; strict blind-count threat-model acceptance is NOT RUN.
8. Database administrator can disable triggers/alter ACLs; append-only controls do not claim administrator-proof immutability.
9. Expenses projection remains empty because no operational expense schema/command was added; existing synthetic UI is unchanged. Confidential demo fixture exclusion before release remains necessary.
10. All OD-01–OD-18 remain OPEN; original register unchanged. E-commerce, couriers, offline sales and official issuance remain frozen.

## Approval checkpoint — isolated tests only

The owner may authorize a NEW disposable loopback PostgreSQL/Auth test environment named `ph_review07_disposable`, completely independent of Antigravity, with synthetic records only. Permission must explicitly cover connection, applying proposals 0001–0010, creating synthetic test identities/accounts, destructive fixture resets, effective privilege/catalog/RLS checks, concurrency and rollback tests, and deleting that disposable environment afterward. No remote or production connection, Cloud activation, production adapter switch, actual business transaction, or commercial policy approval is included.

Until that explicit authorization, the runner stays skipped. No credentials are requested in chat.
