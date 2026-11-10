-- NOT RUN. Explicit one-time operator-reviewed bootstrap, NOT an automatic migration.
-- Requires a separately provisioned synthetic/owner Auth account; no account creation here.
BEGIN;
DO $$ BEGIN IF current_user<>'postgres' THEN RAISE EXCEPTION 'Trusted database operator only'; END IF; END $$;
-- Operator sets this transaction-local value to the explicitly approved Auth UUID.
DO $$
DECLARE target uuid:=NULLIF(current_setting('ph.approved_bootstrap_user',true),'')::uuid;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('owner-role-management',0));
 IF target IS NULL OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=target) OR EXISTS(SELECT 1 FROM public.user_roles WHERE role='SUPER_ADMIN' AND revoked_at IS NULL) THEN RAISE EXCEPTION 'Explicit first-owner bootstrap required'; END IF;
 INSERT INTO public.profiles(id,display_name,active) VALUES(target,'Owner',true);
 INSERT INTO public.user_roles(user_id,role) VALUES(target,'SUPER_ADMIN');
 INSERT INTO private.audit_events(actor_id,operation,subject_id) VALUES(target,'owner.bootstrap',target);
END $$;
ROLLBACK; -- Change only after separate explicit approval; review default never persists.
