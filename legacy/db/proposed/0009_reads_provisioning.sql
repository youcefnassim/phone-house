-- REVIEW07 SOURCE ONLY / NOT RUN. Never install without explicit owner approval.
BEGIN;
CREATE FUNCTION public.read_operational_snapshot(requested_scope text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE scopes text[]; result jsonb;
BEGIN
 IF requested_scope NOT IN ('ALL','M01','M02') OR requested_scope IS NULL THEN RAISE EXCEPTION 'Invalid scope' USING ERRCODE='22023'; END IF;
 SELECT array_agg(id) INTO scopes FROM public.stores WHERE public.can_access_store(id) AND (requested_scope='ALL' OR id=requested_scope);
 IF scopes IS NULL THEN RAISE EXCEPTION 'Store permission denied' USING ERRCODE='42501'; END IF;
 -- Explicit projections only; no SELECT *, finance joins, ledger totals or open-shift expected balances.
 SELECT jsonb_build_object(
 'availability',jsonb_build_object('sales',CASE WHEN public.has_role(auth.uid(),'SUPER_ADMIN') THEN 'AVAILABLE' ELSE 'FORBIDDEN' END,'repayments',CASE WHEN public.has_role(auth.uid(),'SUPER_ADMIN') THEN 'AVAILABLE' ELSE 'FORBIDDEN' END),
 'customers',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',id,'store',store_id,'name',name,'contact',contact,'reference',reference,'address',address,'notes',notes,'source','Database')) FROM public.customers WHERE store_id=ANY(scopes)),'[]'::jsonb),
 'sales',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',id,'customerId',customer_id,'store',store_id,'item','Posted sale','amount',total::text,'date',created_at::date::text)) FROM public.sales WHERE store_id=ANY(scopes) AND public.has_role(auth.uid(),'SUPER_ADMIN')),'[]'::jsonb),
 'debts',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',id,'customerId',customer_id,'store',store_id,'saleReference',sale_id,'amount',amount::text,'dueDate',due_date::text,'authorizationReference',authorization_reference,'notes',notes,'source','Database')) FROM public.debts WHERE store_id=ANY(scopes)),'[]'::jsonb),
 'repayments',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',id,'subjectId',debt_id,'amount',amount::text,'date',created_at::date::text,'method',method,'reference',reference,'authorizationReference',authorization_reference,'source','Database')) FROM public.repayments WHERE store_id=ANY(scopes) AND public.has_role(auth.uid(),'SUPER_ADMIN')),'[]'::jsonb),
 'suppliers',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',id,'name',name,'contact',contact,'store',store_id,'documentReference',document_reference,'notes',notes,'source','Database')) FROM public.suppliers WHERE store_id=ANY(scopes)),'[]'::jsonb),
 'purchases',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',id,'supplierId',supplier_id,'store',store_id,'kind',kind,'product',product,'quantity',quantity::text,'documentReference',document_reference,'expectedDate',expected_date::text,'notes',notes,'source','Database')) FROM public.purchases WHERE store_id=ANY(scopes)),'[]'::jsonb),
 'expenses',jsonb_build_object('status','UNIMPLEMENTED_POLICY_BLOCKED','data',NULL),
 'facilities',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',f.id,'customerId',f.customer_id,'store',f.store_id,'employer',f.employer,'contractReference',f.contract_reference,'contractPrice',f.contract_price::text,'installments',COALESCE((SELECT jsonb_agg(jsonb_build_object('month',to_char(due_month,'YYYY-MM'),'amount',amount::text) ORDER BY due_month) FROM public.facility_installments i WHERE i.facility_id=f.id),'[]'::jsonb),'source','Database')) FROM public.facility_contracts f WHERE store_id=ANY(scopes)),'[]'::jsonb),
 'cases',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',id,'customerId',customer_id,'store',store_id,'saleReference',sale_id,'imei',imei,'issue',issue,'requestedAction',requested_action,'documentReference',document_reference,'notes',notes,'stage',stage,'history',jsonb_build_object('status','UNIMPLEMENTED_POLICY_BLOCKED','data',NULL),'source','Database')) FROM public.warranty_cases WHERE store_id=ANY(scopes)),'[]'::jsonb)) INTO result;
 RETURN result;
END $$;
ALTER FUNCTION public.read_operational_snapshot(text) OWNER TO ph_engine;
REVOKE ALL ON FUNCTION public.read_operational_snapshot(text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.read_operational_snapshot(text) TO authenticated;
-- Raw sales/repayments allow inferring blind-close cash. Operational users use controlled projections only.
REVOKE SELECT ON public.sales,public.sale_lines,public.repayments FROM authenticated;
CREATE FUNCTION public.command_assign_store_role(target_user uuid,requested_store text,requested_role public.app_role,reason text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE subject uuid;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('owner-role-management',0));
 PERFORM private.require_access(COALESCE(requested_store,'M01'),true);
 IF NOT public.has_role(auth.uid(),'SUPER_ADMIN') OR COALESCE(length(trim(reason)),0)=0 THEN RAISE EXCEPTION 'Owner authorization required' USING ERRCODE='42501'; END IF;
 IF (requested_role='SUPER_ADMIN')<>(requested_store IS NULL) THEN RAISE EXCEPTION 'Invalid role scope' USING ERRCODE='22023'; END IF;
 PERFORM 1 FROM public.profiles WHERE id=target_user AND active FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Active provisioned account required' USING ERRCODE='22023'; END IF;
 INSERT INTO public.user_roles(user_id,store_id,role) VALUES(target_user,requested_store,requested_role) RETURNING id INTO subject;
 INSERT INTO private.audit_events(actor_id,operation,subject_id,store_id) VALUES(auth.uid(),'role.assign',subject,requested_store);
END $$;
CREATE FUNCTION public.command_revoke_store_role(assignment uuid,reason text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE r public.user_roles;
BEGIN
 -- Serialize before checking current caller permissions; never authorize before waiting.
 PERFORM pg_advisory_xact_lock(hashtextextended('owner-role-management',0));
 PERFORM private.require_access('M01',true);
 IF NOT public.has_role(auth.uid(),'SUPER_ADMIN') OR COALESCE(length(trim(reason)),0)=0 THEN RAISE EXCEPTION 'Owner authorization required' USING ERRCODE='42501'; END IF;
 SELECT * INTO r FROM public.user_roles WHERE id=assignment FOR UPDATE;
 IF NOT FOUND OR r.revoked_at IS NOT NULL THEN RAISE EXCEPTION 'Role already absent' USING ERRCODE='23514'; END IF;
 IF r.role='SUPER_ADMIN' AND (SELECT count(*) FROM public.user_roles x JOIN public.profiles p ON p.id=x.user_id WHERE x.role='SUPER_ADMIN' AND x.revoked_at IS NULL AND p.active)<=1 THEN RAISE EXCEPTION 'Last owner protected' USING ERRCODE='23514'; END IF;
 UPDATE public.user_roles SET revoked_at=now() WHERE id=assignment;
 INSERT INTO private.audit_events(actor_id,operation,subject_id,store_id) VALUES(auth.uid(),'role.revoke',assignment,r.store_id);
END $$;
ALTER FUNCTION public.command_assign_store_role(uuid,text,public.app_role,text) OWNER TO ph_engine;
ALTER FUNCTION public.command_revoke_store_role(uuid,text) OWNER TO ph_engine;
REVOKE ALL ON FUNCTION public.command_assign_store_role(uuid,text,public.app_role,text),public.command_revoke_store_role(uuid,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.command_assign_store_role(uuid,text,public.app_role,text),public.command_revoke_store_role(uuid,text) TO authenticated;
-- Final containment: ordinary users never obtain direct DML or sensitive raw read paths.
REVOKE INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON ALL TABLES IN SCHEMA public FROM anon,authenticated;
REVOKE ALL ON ALL TABLES IN SCHEMA private FROM PUBLIC,anon,authenticated,service_role;
REVOKE CREATE ON SCHEMA public,private FROM ph_engine;
-- No device/outbox ingestion, refund/transfer/facility posting or unrestricted signup is activated.
COMMIT;
