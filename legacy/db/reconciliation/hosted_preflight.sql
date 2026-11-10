-- READ-ONLY evidence query. NOT RUN. Owner must confirm the exact external
-- nonproduction project before any database execution. No platform mutation.
SELECT current_database() AS database_name, current_user AS migration_user,
       current_setting('server_version') AS server_version;
SELECT nspname, pg_get_userbyid(nspowner) AS owner
  FROM pg_namespace WHERE nspname IN ('auth','public','private','extensions');
SELECT rolname, rolcanlogin, rolsuper, rolbypassrls, rolcreaterole
  FROM pg_roles WHERE rolname IN ('postgres','anon','authenticated','service_role','ph_engine');
SELECT r.rolname AS role, m.rolname AS member, a.admin_option
  FROM pg_auth_members a JOIN pg_roles r ON r.oid=a.roleid
  JOIN pg_roles m ON m.oid=a.member
  WHERE r.rolname='ph_engine' OR m.rolname='ph_engine';
SELECT extname, extversion, n.nspname AS schema
  FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace;
SELECT n.nspname AS schema, c.relname, c.relkind, c.relrowsecurity,
       c.relforcerowsecurity, pg_get_userbyid(c.relowner) AS owner, c.relacl
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname IN ('public','private') AND c.relkind IN ('r','p','v','m')
  ORDER BY 1,2;
SELECT n.nspname AS schema, p.proname, pg_get_function_identity_arguments(p.oid) AS arguments,
       pg_get_userbyid(p.proowner) AS owner, p.prosecdef, p.proconfig, p.proacl,
       pg_get_functiondef(p.oid) AS definition
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname IN ('public','private') AND p.prokind='f'
  ORDER BY 1,2,3;
SELECT schemaname, tablename, policyname, roles, cmd, qual, with_check
  FROM pg_policies WHERE schemaname IN ('public','private') ORDER BY 1,2,3;
SELECT pg_get_userbyid(defaclrole) AS creator, defaclnamespace::regnamespace AS schema,
       defaclobjtype, defaclacl FROM pg_default_acl;
-- PostgREST exposed schemas must also be read from hosted API settings; this
-- query alone does not certify that private finance is excluded from the API.