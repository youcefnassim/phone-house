-- HISTORICAL REVIEW06 DESIGN SUPERSEDED by Review07 0001–0009.
-- NOT RUN. Do not apply the former global-role/membership design to Review07.
-- Effective privilege checks now live in tests/integration/review07_transactions.py.
-- GLOBAL default function privileges (without IN SCHEMA) are defined in 0001.
-- Existing function ACLs are explicitly revoked per signature in each migration.
-- Confidential finance is now in private, not public.
BEGIN;
ROLLBACK;
