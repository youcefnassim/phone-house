-- READ ONLY. Run solely under the separately approved disposable execution gate.
-- One stable JSONB row, no business data. Definitions are not certification.
WITH ns AS (
 SELECT oid,nspname,nspowner,nspacl FROM pg_namespace
 WHERE nspname IN ('public','private','auth','review08_guard')
), relations AS (
 SELECT c.*,n.nspname FROM pg_class c JOIN ns n ON n.oid=c.relnamespace
 WHERE c.relkind IN ('r','p','v','m','S')
), routines AS (
 SELECT p.*,n.nspname FROM pg_proc p JOIN ns n ON n.oid=p.pronamespace
 WHERE p.prokind IN ('f','p')
), roles AS (
 SELECT * FROM pg_roles WHERE rolname IN ('postgres','anon','authenticated','service_role','ph_engine')
), evidence AS (
 SELECT 'schemas' section, nspname key,
 jsonb_build_object('name',nspname,'owner',pg_get_userbyid(nspowner),'acl',nspacl::text) value FROM ns
 UNION ALL
 SELECT 'relations',nspname||'.'||relname,
 jsonb_build_object('name',nspname||'.'||relname,'kind',relkind,'owner',pg_get_userbyid(relowner),
 'rls',relrowsecurity,'forceRls',relforcerowsecurity,'acl',relacl::text,
 'view',CASE WHEN relkind IN ('v','m') THEN pg_get_viewdef(oid,true) ELSE NULL END) FROM relations
 UNION ALL
 SELECT 'columns',r.nspname||'.'||r.relname||'.'||a.attnum,
 jsonb_build_object('table',r.nspname||'.'||r.relname,'position',a.attnum,'name',a.attname,
 'type',format_type(a.atttypid,a.atttypmod),'notNull',a.attnotnull,'identity',a.attidentity,
 'generated',a.attgenerated,'default',pg_get_expr(d.adbin,d.adrelid),'acl',a.attacl::text)
 FROM relations r JOIN pg_attribute a ON a.attrelid=r.oid
 LEFT JOIN pg_attrdef d ON d.adrelid=r.oid AND d.adnum=a.attnum WHERE a.attnum>0 AND NOT a.attisdropped
 UNION ALL
 SELECT 'constraints',n.nspname||'.'||c.conname||'.'||COALESCE(c.conrelid::regclass::text,''),
 jsonb_build_object('schema',n.nspname,'name',c.conname,'table',c.conrelid::regclass::text,
 'kind',c.contype,'definition',pg_get_constraintdef(c.oid,true),'validated',c.convalidated,
 'deferrable',c.condeferrable,'initiallyDeferred',c.condeferred)
 FROM pg_constraint c JOIN ns n ON n.oid=c.connamespace
 UNION ALL
 SELECT 'indexes',r.nspname||'.'||r.relname||'.'||i.indexrelid::regclass::text,
 jsonb_build_object('table',r.nspname||'.'||r.relname,'definition',pg_get_indexdef(i.indexrelid),
 'unique',i.indisunique,'valid',i.indisvalid,'ready',i.indisready) FROM pg_index i JOIN relations r ON r.oid=i.indrelid
 UNION ALL
 SELECT 'triggers',r.nspname||'.'||r.relname||'.'||t.tgname,
 jsonb_build_object('table',r.nspname||'.'||r.relname,'name',t.tgname,'enabled',t.tgenabled,
 'internal',t.tgisinternal,'definition',pg_get_triggerdef(t.oid,true))
 FROM pg_trigger t JOIN relations r ON r.oid=t.tgrelid
 UNION ALL
 SELECT 'functions',p.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')',
 jsonb_build_object('schema',p.nspname,'name',p.proname,'arguments',pg_get_function_identity_arguments(p.oid),
 'definition',pg_get_functiondef(p.oid),'owner',pg_get_userbyid(p.proowner),'securityDefiner',p.prosecdef,
 'settings',p.proconfig,'acl',p.proacl::text) FROM routines p
 UNION ALL
 SELECT 'policies',r.nspname||'.'||r.relname||'.'||p.polname,
 jsonb_build_object('table',r.nspname||'.'||r.relname,'name',p.polname,'command',p.polcmd,
 'permissive',p.polpermissive,'roles',(SELECT jsonb_agg(CASE WHEN x=0 THEN 'PUBLIC' ELSE pg_get_userbyid(x) END ORDER BY x) FROM unnest(p.polroles)x),
 'using',pg_get_expr(p.polqual,p.polrelid),'check',pg_get_expr(p.polwithcheck,p.polrelid))
 FROM pg_policy p JOIN relations r ON r.oid=p.polrelid
 UNION ALL
 SELECT 'roles',rolname,jsonb_build_object('name',rolname,'login',rolcanlogin,'superuser',rolsuper,
 'bypassRls',rolbypassrls,'inherit',rolinherit,'createRole',rolcreaterole,'createDb',rolcreatedb,'config',rolconfig) FROM roles
 UNION ALL
 SELECT 'memberships',parent.rolname||'.'||member.rolname,
 jsonb_build_object('role',parent.rolname,'member',member.rolname,'grantor',pg_get_userbyid(m.grantor),
 'admin',m.admin_option,'inherit',m.inherit_option,'set',m.set_option)
 FROM pg_auth_members m JOIN pg_roles parent ON parent.oid=m.roleid JOIN pg_roles member ON member.oid=m.member
 WHERE parent.oid IN (SELECT oid FROM roles) OR member.oid IN (SELECT oid FROM roles)
 UNION ALL
 SELECT 'defaultAcls',pg_get_userbyid(d.defaclrole)||'.'||COALESCE(n.nspname,'GLOBAL')||'.'||d.defaclobjtype,
 jsonb_build_object('owner',pg_get_userbyid(d.defaclrole),'schema',n.nspname,'kind',d.defaclobjtype,'acl',d.defaclacl::text)
 FROM pg_default_acl d LEFT JOIN ns n ON n.oid=d.defaclnamespace WHERE d.defaclnamespace=0 OR n.oid IS NOT NULL
 UNION ALL
 SELECT 'effectiveSchemaPrivileges',ro.rolname||'.'||n.nspname,
 jsonb_build_object('role',ro.rolname,'schema',n.nspname,'usage',has_schema_privilege(ro.oid,n.oid,'USAGE'),'create',has_schema_privilege(ro.oid,n.oid,'CREATE'))
 FROM roles ro CROSS JOIN ns n
 UNION ALL
 SELECT 'effectiveTablePrivileges',ro.rolname||'.'||r.nspname||'.'||r.relname||'.'||priv,
 jsonb_build_object('role',ro.rolname,'table',r.nspname||'.'||r.relname,'privilege',priv,'allowed',has_table_privilege(ro.oid,r.oid,priv))
 FROM roles ro CROSS JOIN relations r CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'])priv WHERE r.relkind<>'S'
 UNION ALL
 SELECT 'effectiveColumnPrivileges',ro.rolname||'.'||r.nspname||'.'||r.relname||'.'||a.attname||'.'||priv,
 jsonb_build_object('role',ro.rolname,'table',r.nspname||'.'||r.relname,'column',a.attname,'privilege',priv,'allowed',has_column_privilege(ro.oid,r.oid,a.attnum,priv))
 FROM roles ro CROSS JOIN relations r JOIN pg_attribute a ON a.attrelid=r.oid
 CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','REFERENCES'])priv WHERE r.relkind<>'S' AND a.attnum>0 AND NOT a.attisdropped
 UNION ALL
 SELECT 'effectiveSequencePrivileges',ro.rolname||'.'||r.nspname||'.'||r.relname||'.'||priv,
 jsonb_build_object('role',ro.rolname,'sequence',r.nspname||'.'||r.relname,'privilege',priv,'allowed',has_sequence_privilege(ro.oid,r.oid,priv))
 FROM roles ro CROSS JOIN relations r CROSS JOIN unnest(ARRAY['USAGE','SELECT','UPDATE'])priv WHERE r.relkind='S'
 UNION ALL
 SELECT 'effectiveExecute',ro.rolname||'.'||p.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')',
 jsonb_build_object('role',ro.rolname,'function',p.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')',
 'execute',has_function_privilege(ro.oid,p.oid,'EXECUTE')) FROM roles ro CROSS JOIN routines p
 UNION ALL
 SELECT 'publicExecute',p.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')',
 jsonb_build_object('function',p.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')',
 'execute',EXISTS(SELECT 1 FROM aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE')) FROM routines p
)
SELECT jsonb_build_object('format','phone-house-structure-v1','sections',
 (SELECT jsonb_object_agg(section,items ORDER BY section) FROM
 (SELECT section,jsonb_agg(value ORDER BY key COLLATE "C",value::text COLLATE "C") items FROM evidence GROUP BY section) sections))::text;