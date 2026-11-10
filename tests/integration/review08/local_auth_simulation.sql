-- NOT RUN. Approved fresh NETWORKLESS disposable container ONLY.
-- This is NOT hosted authentication and creates no operational accounts.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;
CREATE SCHEMA auth;
CREATE TABLE auth.users(id uuid PRIMARY KEY);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE SET search_path=pg_catalog
AS $$ SELECT NULLIF(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
GRANT USAGE ON SCHEMA auth TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated,service_role;
CREATE SCHEMA review08_guard;
CREATE TABLE review08_guard.identity(run_id text PRIMARY KEY);
REVOKE ALL ON SCHEMA review08_guard FROM PUBLIC,anon,authenticated,service_role;
-- Operator inserts the independently approved run_id exactly once, before approval is sealed.