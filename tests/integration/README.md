# Guarded Review09 PostgreSQL acceptance — NOT RUN

Current executable handoff: `docs/FIRST_REAL_POSTGRESQL_HANDOFF.md`. Old Review09 approval format is retired. Stage A schema approval cannot reset/test/destroy; Stage B separately binds inspected canonical structural/ACL evidence and exact cleanup resources. No approval means NOT RUN and the acceptance entry point now exits nonzero, not success. Docker/PostgreSQL are unavailable in this Lovable sandbox; an independently attested local operator is required.

Only current path: `review09_acceptance.py` → shared Review08 guarded runner/safety/fixture source. Historical Review06/07 activation is retired. Never use a host DSN, Cloud, external database or old approval flags.

Read `docs/REVIEW09_EXECUTION_CHECKPOINT.md` for the exact separate owner approval, pinned image, private signed-off identity record, ordered schema, resets and disposal checks. No approval was supplied. Normal local invocation reports **37 skips**, not passes. Offline safety discovery never starts containers or connects databases:

```bash
python3 -m unittest discover -s tests/integration -p 'test_review*_safety.py' -v
python3 tests/integration/review09_acceptance.py
```

Actual approved SQL tests require local Bun dependencies for strict production response validation. Private approval and independently confirmed digest must not be included in source, screenshots or exported evidence. Synthetic subject/role simulation is not hosted sign-in/session/Worker acceptance.
