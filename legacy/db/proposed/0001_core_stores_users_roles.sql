-- REVIEW07 SOURCE ONLY — UNDEPLOYED / NOT RUN. No connection or SQL execution authorized.
-- Fresh disposable database only; not an upgrade script for a deployed Review06 database.
BEGIN;
-- Migration creator MUST be postgres; repeat GLOBAL defaults for any additional actual creator.
DO $$ BEGIN IF current_user <> 'postgres' THEN RAISE EXCEPTION 'Reviewed creator postgres required'; END IF; END $$;
CREATE ROLE ph_engine NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
REVOKE ph_engine FROM anon, authenticated, service_role;
REVOKE CREATE ON SCHEMA public FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE ph_engine REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
CREATE SCHEMA private AUTHORIZATION postgres;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated, service_role;
GRANT USAGE ON SCHEMA public, private, auth TO ph_engine;
-- Required for ALTER FUNCTION OWNER during creation; revoked in final migration.
GRANT CREATE ON SCHEMA public, private TO ph_engine;
GRANT EXECUTE ON FUNCTION auth.uid() TO ph_engine;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
CREATE TYPE public.app_role AS ENUM ('SUPER_ADMIN','MANAGER','SELLER');
CREATE TABLE public.stores (
id text PRIMARY KEY CHECK(id IN ('M01','M02')), label text NOT NULL
);
GRANT ALL ON public.stores TO ph_engine;
GRANT ALL ON public.stores TO service_role;
ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;
CREATE POLICY engine_access ON public.stores TO ph_engine USING (true) WITH CHECK (true);
CREATE TABLE public.profiles (
id uuid PRIMARY KEY REFERENCES auth.users(id), display_name text NOT NULL, active boolean NOT NULL DEFAULT false
);
GRANT ALL ON public.profiles TO ph_engine;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY engine_access ON public.profiles TO ph_engine USING (true) WITH CHECK (true);
CREATE TABLE public.user_roles (
id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES public.profiles(id), store_id text REFERENCES public.stores(id), role public.app_role NOT NULL, revoked_at timestamptz, CHECK ((role='SUPER_ADMIN') = (store_id IS NULL))
);
GRANT ALL ON public.user_roles TO ph_engine;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY engine_access ON public.user_roles TO ph_engine USING (true) WITH CHECK (true);
CREATE UNIQUE INDEX active_global_role ON public.user_roles(user_id) WHERE role='SUPER_ADMIN' AND revoked_at IS NULL;
CREATE UNIQUE INDEX active_store_role ON public.user_roles(user_id,store_id,role) WHERE store_id IS NOT NULL AND revoked_at IS NULL;
CREATE FUNCTION public.has_role(_user_id uuid, _role public.app_role, _store_id text DEFAULT NULL)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
SELECT auth.uid() IS NOT NULL AND _user_id=auth.uid() AND EXISTS (
 SELECT 1 FROM public.profiles p JOIN public.user_roles r ON r.user_id=p.id
 WHERE p.id=auth.uid() AND p.active AND r.revoked_at IS NULL AND r.role=_role
 AND (r.store_id=_store_id OR (r.role='SUPER_ADMIN' AND _store_id IS NULL)))
$$;
ALTER FUNCTION public.has_role(uuid,public.app_role,text) OWNER TO ph_engine;
REVOKE ALL ON FUNCTION public.has_role(uuid,public.app_role,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.has_role(uuid,public.app_role,text) TO authenticated,ph_engine;
CREATE FUNCTION public.can_access_store(_store_id text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
SELECT public.has_role(auth.uid(),'SUPER_ADMIN') OR public.has_role(auth.uid(),'MANAGER',_store_id) OR public.has_role(auth.uid(),'SELLER',_store_id)
$$;
ALTER FUNCTION public.can_access_store(text) OWNER TO ph_engine;
REVOKE ALL ON FUNCTION public.can_access_store(text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.can_access_store(text) TO authenticated,ph_engine;
GRANT SELECT ON public.stores,public.profiles,public.user_roles TO authenticated;
CREATE POLICY store_read ON public.stores FOR SELECT TO authenticated USING(public.can_access_store(id));
CREATE POLICY self_profile ON public.profiles FOR SELECT TO authenticated USING(id=auth.uid() OR public.has_role(auth.uid(),'SUPER_ADMIN'));
CREATE POLICY self_roles ON public.user_roles FOR SELECT TO authenticated USING(user_id=auth.uid() OR public.has_role(auth.uid(),'SUPER_ADMIN'));
INSERT INTO public.stores(id,label) VALUES ('M01','Magasin 1 (M01)'),('M02','Magasin 2 (M02)');
COMMIT;
