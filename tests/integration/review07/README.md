# Review07 isolated PostgreSQL test source — NOT RUN

No connection or SQL execution was authorized. `python3 tests/integration/review07_transactions.py` therefore reports twenty skips.

Only after the approval checkpoint in `docs/REVIEW07_IMPLEMENTATION.md`: prepare a NEW loopback PostgreSQL/Auth stack, database `ph_review07_disposable`, apply reviewed 0001–0010 manually with stop-on-error, then install psycopg in the isolated developer runner. Supply `PH_REVIEW07_TEST_DSN` securely and set `PH_REVIEW07_DISPOSABLE_DB_APPROVED=YES`. Never print credentials. Every test resets the supplied destructive synthetic fixture source. Never run on production/remote data.

The runner checks SQL identities via SET LOCAL ROLE authenticated and independent JWT subject values; it does not fabricate hosted Auth logins. Database oracle is the independent isolated postgres connection and concrete SQL readbacks, never business-server PASS flags. Hosted account/session/UI acceptance remains separate and NOT RUN.

## Review08 supersession

The DSN/environment activation above is RETIRED and disabled in source. Do not use it. See `docs/REVIEW08_EXECUTION_CHECKPOINT.md` for networkless container identity and separately approved reset safeguards.
