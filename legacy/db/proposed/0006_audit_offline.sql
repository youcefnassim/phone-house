-- REVIEW07 SOURCE ONLY — UNDEPLOYED / NOT RUN. No connection or SQL execution authorized.
-- Fresh disposable database only; not an upgrade script for a deployed Review06 database.
BEGIN;
CREATE TABLE private.audit_events (
id uuid PRIMARY KEY DEFAULT gen_random_uuid(), actor_id uuid NOT NULL REFERENCES auth.users(id), operation text NOT NULL, subject_id uuid NOT NULL, store_id text REFERENCES public.stores(id), created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON private.audit_events TO ph_engine;
ALTER TABLE private.audit_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY engine_access ON private.audit_events TO ph_engine USING (true) WITH CHECK (true);
CREATE TABLE private.journals (
id uuid PRIMARY KEY, store_id text NOT NULL REFERENCES public.stores(id), operation text NOT NULL, subject_id uuid NOT NULL, actor_id uuid NOT NULL REFERENCES auth.users(id), reversal_of uuid UNIQUE REFERENCES private.journals(id), created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON private.journals TO ph_engine;
ALTER TABLE private.journals ENABLE ROW LEVEL SECURITY;
CREATE POLICY engine_access ON private.journals TO ph_engine USING (true) WITH CHECK (true);
CREATE TABLE private.ledger_entries (
id uuid PRIMARY KEY DEFAULT gen_random_uuid(), journal_id uuid NOT NULL REFERENCES private.journals(id), account text NOT NULL, debit numeric NOT NULL DEFAULT 0 CHECK(debit>=0 AND scale(debit)<=2), credit numeric NOT NULL DEFAULT 0 CHECK(credit>=0 AND scale(credit)<=2), CHECK((debit>0)<>(credit>0))
);
GRANT ALL ON private.ledger_entries TO ph_engine;
ALTER TABLE private.ledger_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY engine_access ON private.ledger_entries TO ph_engine USING (true) WITH CHECK (true);
CREATE TABLE private.idempotency_records (
key text PRIMARY KEY CHECK(key ~ '^[A-Za-z0-9][A-Za-z0-9-]{15,79}$'), actor_id uuid NOT NULL REFERENCES auth.users(id), operation text NOT NULL, store_id text NOT NULL REFERENCES public.stores(id), contract_version text NOT NULL, payload_hash text NOT NULL, transaction_id uuid UNIQUE NOT NULL, response jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON private.idempotency_records TO ph_engine;
ALTER TABLE private.idempotency_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY engine_access ON private.idempotency_records TO ph_engine USING (true) WITH CHECK (true);
CREATE FUNCTION private.deny_change() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$ BEGIN RAISE EXCEPTION 'Append-only history' USING ERRCODE='42501'; END $$;
REVOKE ALL ON FUNCTION private.deny_change() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER immutable_history BEFORE UPDATE OR DELETE ON private.audit_events FOR EACH ROW EXECUTE FUNCTION private.deny_change();
CREATE TRIGGER immutable_history BEFORE UPDATE OR DELETE ON private.journals FOR EACH ROW EXECUTE FUNCTION private.deny_change();
CREATE TRIGGER immutable_history BEFORE UPDATE OR DELETE ON private.ledger_entries FOR EACH ROW EXECUTE FUNCTION private.deny_change();
CREATE TRIGGER immutable_history BEFORE UPDATE OR DELETE ON private.idempotency_records FOR EACH ROW EXECUTE FUNCTION private.deny_change();
CREATE TRIGGER immutable_history BEFORE UPDATE OR DELETE ON private.phone_identifiers FOR EACH ROW EXECUTE FUNCTION private.deny_change();
CREATE FUNCTION private.journal_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE j uuid;
BEGIN
 IF TG_TABLE_NAME='journals' THEN
  j:=NEW.id;
 ELSE
  j:=NEW.journal_id;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM private.ledger_entries WHERE journal_id=j) OR (SELECT sum(debit-credit) FROM private.ledger_entries WHERE journal_id=j)<>0 THEN RAISE EXCEPTION 'Unbalanced journal' USING ERRCODE='23514'; END IF;
 IF NOT EXISTS(SELECT 1 FROM private.journals h JOIN private.audit_events a ON a.subject_id=h.subject_id AND a.operation=h.operation AND a.actor_id=h.actor_id AND a.store_id=h.store_id WHERE h.id=j) THEN RAISE EXCEPTION 'Mandatory audit missing' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
ALTER FUNCTION private.journal_guard() OWNER TO ph_engine;
REVOKE ALL ON FUNCTION private.journal_guard() FROM PUBLIC,anon,authenticated,service_role;
CREATE CONSTRAINT TRIGGER balanced_journal AFTER INSERT ON private.journals DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION private.journal_guard();
CREATE CONSTRAINT TRIGGER balanced_line AFTER INSERT ON private.ledger_entries DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION private.journal_guard();
-- Account names below are technical reconciliation buckets, NOT an approved statutory accounting policy.
COMMIT;
