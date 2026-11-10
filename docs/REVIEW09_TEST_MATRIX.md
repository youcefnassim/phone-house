# Review09 complete acceptance matrix — NOT RUN

37 guarded SQL test definitions: historical A–T, Review08 U–AJ and actual SQL response schema validation. No database test has run; skips are not passes. Each denial compares deterministic ordered persisted row content in 24 tables, not backend success flags. Success assertions read PostgreSQL independently.

| ID  | Expected database state / independent readback                                                                                                                                         | Current status |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| A   | M02 manager denied M01 intake/read; complete ordered row oracle unchanged.                                                                                                             | NOT RUN        |
| B   | Cross-slot IMEI collision 23505; one phone/two registry identifiers; receipt and all state unchanged after rejection.                                                                  | NOT RUN        |
| C   | Balance and ledger delta 2; purchase receipt quantity 2 linked to purchase/actor; one audit, zero finance journal.                                                                     | NOT RUN        |
| D   | Two simultaneous opens: one winner/one 23505, one OPEN shift and one replay row.                                                                                                       | NOT RUN        |
| E   | Mixed 140.01 checkout; exact sale/line/payment/movement/journal/audit/replay/movement deltas; stock zero, actor/store/shift linkage; per-journal balance.                              | NOT RUN        |
| F   | Same-key replay identical transaction and unchanged rows; changed payload 23505/different actor 42501 with full rollback.                                                              | NOT RUN        |
| G   | Blind close omits discrepancy; stored -0.01; closed-shift checkout 23514, owner projection denied manager.                                                                             | NOT RUN        |
| H   | Owner exact 80.01 finance; manager/seller 42501 with no mutation.                                                                                                                      | NOT RUN        |
| I   | Last accessory race one winner/23514; balance zero, one sale; journals independently balanced.                                                                                         | NOT RUN        |
| J   | Underpayment 22023; full ordered oracle equality, phone AVAILABLE, balance 2.                                                                                                          | NOT RUN        |
| K   | Mixed-role receiving denied; no-role/inactive/revoked subjects denied 42501, state unchanged.                                                                                          | NOT RUN        |
| L   | 0.001 rejected without mutation; 9007199254740993.01 preserved exactly; journal balanced.                                                                                              | NOT RUN        |
| M   | Catalog effective DML/EXECUTE/private-schema/membership/bypass/SELECT denial plus RLS flags.                                                                                           | NOT RUN        |
| N   | Future postgres/engine-created probe PUBLIC EXECUTE absent; transaction ROLLBACK leaves no probe or CREATE grant.                                                                      | NOT RUN        |
| O   | Two 15.00 repayments against synthetic 20.00 debt: one succeeds, one 23514; sum/movement 15.00, balanced journal.                                                                      | NOT RUN        |
| P   | IMEI, receipt and storage identity edits reject 23514; full oracle unchanged.                                                                                                          | NOT RUN        |
| Q   | Nonuniform 50.00+50.01=100.01; DELETE/update breaking total reject 23514; exact replacement DELETE/INSERT commits 100.01.                                                              | NOT RUN        |
| R   | Wrong-store shift rejected by open-shift guard 23514; separate valid-M02-shift/M01-customer insert rejects FK 23503; no artifacts.                                                     | NOT RUN        |
| S   | Dispatch without approvals 23514; forged assignment 42501; valid role-linked approvals; wrong scan denied; exact scan readback; stage-only completion does not imply stock relocation. | NOT RUN        |
| T   | First privileged constraint-only 60.00 refund stored; second 60.00 rejects 23514; sum 60.00; phone remains SOLD/unreleased.                                                            | NOT RUN        |
| U   | Physical color/storage/battery/remarks/packaging/serial SQL roundtrip exact.                                                                                                           | NOT RUN        |
| V   | Variant mismatch 22023; full oracle unchanged.                                                                                                                                         | NOT RUN        |
| W   | Wrong supplier/procurement context 42501; full oracle unchanged.                                                                                                                       | NOT RUN        |
| X   | Ten-unit authorized cap; eleventh rejected 23514; receipts sum ten.                                                                                                                    | NOT RUN        |
| Y   | Unknown cost/obligation stays NULL in both seeded finance rows.                                                                                                                        | NOT RUN        |
| Z   | Duplicate IMEI 23505; no extra phone/receipt/ledger/audit/replay.                                                                                                                      | NOT RUN        |
| AA  | Two same-phone checkouts one winner/23514; one serialized sale line.                                                                                                                   | NOT RUN        |
| AB  | Active-owner unique index; direct DML denied; privileged second ownership insert 23505; line count stays one.                                                                          | NOT RUN        |
| AC  | Manager owner-finance projection 42501 and full state unchanged.                                                                                                                       | NOT RUN        |
| AD  | Blind-close response no expected/discrepancy; independent persisted discrepancy 0.01.                                                                                                  | NOT RUN        |
| AE  | Same receipt replay same transaction/replayed true and complete ordered oracle unchanged.                                                                                              | NOT RUN        |
| AF  | Standalone cash movement policy-blocked 42501; no financial mutation.                                                                                                                  | NOT RUN        |
| AG  | Close/checkout barrier: close completes; zero or one checkout; balance/sales/discrepancy exactly reconciled.                                                                           | NOT RUN        |
| AH  | Revoked receipt authorization prevents receiving 42501; oracle unchanged.                                                                                                              | NOT RUN        |
| AI  | Alternate raw cash/shifts/sales/lines/repayment SELECT privileges absent.                                                                                                              | NOT RUN        |
| AJ  | Engine cannot UPDATE sale lines; append-only history trigger exists; no ownership-release path.                                                                                        | NOT RUN        |
| DTO | Actual SQL operational/inventory readback for six role compositions validates production Zod schemas via offline Bun; scope and forbidden finance keys checked recursively.            | NOT RUN        |

## Separate evidence classes

Local Vitest: 138 tests; offline Python safety/protocol: 17 tests. These are not PostgreSQL, Docker isolation or hosted security evidence. Top-level SQL parsing is not function-body compilation. SQL role/JWT-subject simulation is not actual bearer validation or signup/session proof. Hosted Auth/direct HTTP API/published Worker, backup restore, printers/scanners, offline conflicts and legally valid issuance remain NOT RUN / separately gated. M exercises SQL-side API role/EXECUTE restrictions, not a hosted PostgREST service.

## Execution acceptance rule

All 37 must execute without hidden skip after exact approval. Every unexpected SQLSTATE, infrastructure stop, assertion failure, compilation issue, DTO rejection or residual disposable resource blocks acceptance. Constraint-only privileged setup for debt/facility/refund/transfer is not completed operational business posting. Do not relax constraints or OPEN policies to pass cases. Optional richer provenance/assertion expansion is documented as future strengthening, not already executed proof.
