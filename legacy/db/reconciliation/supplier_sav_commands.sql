-- REVIEW CANDIDATE: NOT APPROVED, COMPILED, EXECUTED OR A MANAGED MIGRATION.
-- Include only after hosted baseline reconciliation + exact owner approval.
-- Requires strict_rpc_validation.sql. No refund, warranty entitlement, stock
-- release, replacement, supplier settlement or commercial posting introduced.
BEGIN;
CREATE TABLE public.service_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), case_id uuid NOT NULL REFERENCES public.warranty_cases(id),
 store_id text NOT NULL REFERENCES public.stores(id), note text NOT NULL CHECK(length(trim(note))>0),
 document_reference text NOT NULL CHECK(length(trim(document_reference))>0),
 recorded_by uuid NOT NULL REFERENCES auth.users(id), created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.service_events TO authenticated;
GRANT SELECT,INSERT ON public.service_events TO ph_engine;
GRANT ALL ON public.service_events TO service_role;
ALTER TABLE public.service_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY engine_access ON public.service_events TO ph_engine USING(true) WITH CHECK(true);
CREATE POLICY scoped_read ON public.service_events FOR SELECT TO authenticated USING(public.can_access_store(store_id));
CREATE TRIGGER immutable_history BEFORE UPDATE OR DELETE ON public.service_events FOR EACH ROW EXECUTE FUNCTION private.deny_change();
CREATE UNIQUE INDEX one_inspection_case_per_sale_line ON public.warranty_cases(sale_line_id) WHERE stage='Inspection';

CREATE FUNCTION public.command_supplier_create(request jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE p jsonb:=request->'payload'; replay jsonb; subject uuid:=gen_random_uuid();
BEGIN
 replay:=private.command_begin(request,'supplier.create',true); IF replay IS NOT NULL THEN RETURN replay; END IF;
 IF length(trim(p->>'name'))=0 OR length(trim(p->>'contact'))=0 OR length(trim(p->>'documentReference'))=0 THEN RAISE EXCEPTION 'Supplier identity required' USING ERRCODE='22023'; END IF;
 INSERT INTO public.suppliers(id,store_id,name,contact,document_reference,notes)
 VALUES(subject,p->>'store',p->>'name',p->>'contact',p->>'documentReference',COALESCE(p->>'notes',''));
 RETURN private.finish(request,'supplier.create',subject,jsonb_build_object('supplierId',subject));
END $$;
CREATE FUNCTION public.command_sav_case_create(request jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE p jsonb:=request->'payload'; replay jsonb; subject uuid:=gen_random_uuid(); original public.sale_lines;
BEGIN
 replay:=private.command_begin(request,'sav.case.create',true); IF replay IS NOT NULL THEN RETURN replay; END IF;
 SELECT l.* INTO original FROM public.sale_lines l JOIN public.sales s ON s.id=l.sale_id
 WHERE l.id=(p->>'saleLineId')::uuid AND l.sale_id=(p->>'saleId')::uuid
 AND l.store_id=p->>'store' AND s.customer_id=(p->>'customerId')::uuid FOR UPDATE OF l;
 IF NOT FOUND OR original.phone_unit_id IS NULL OR original.ownership_released_at IS NOT NULL THEN RAISE EXCEPTION 'Original active sale required' USING ERRCODE='23514'; END IF;
 PERFORM 1 FROM public.phone_units WHERE id=original.phone_unit_id AND status='SOLD' AND (p->>'imei') IN (imei1,imei2) FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Original sold IMEI required' USING ERRCODE='23514'; END IF;
 IF length(trim(p->>'issue'))=0 OR length(trim(p->>'requestedAction'))=0 OR length(trim(p->>'documentReference'))=0 THEN RAISE EXCEPTION 'Service evidence required' USING ERRCODE='22023'; END IF;
 INSERT INTO public.warranty_cases(id,customer_id,store_id,sale_id,sale_line_id,imei,issue,requested_action,document_reference,notes)
 VALUES(subject,(p->>'customerId')::uuid,p->>'store',original.sale_id,original.id,p->>'imei',p->>'issue',p->>'requestedAction',p->>'documentReference',COALESCE(p->>'notes',''));
 RETURN private.finish(request,'sav.case.create',subject,jsonb_build_object('caseId',subject,'stage','Inspection'));
END $$;
CREATE FUNCTION public.command_sav_event_record(request jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE p jsonb:=request->'payload'; replay jsonb; event uuid:=gen_random_uuid(); subject uuid:=(p->>'caseId')::uuid;
BEGIN
 replay:=private.command_begin(request,'sav.event.record',true); IF replay IS NOT NULL THEN RETURN replay; END IF;
 PERFORM 1 FROM public.warranty_cases WHERE id=subject AND store_id=p->>'store' AND stage='Inspection' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Inspection case in scope required' USING ERRCODE='23514'; END IF;
 IF length(trim(p->>'note'))=0 OR length(trim(p->>'documentReference'))=0 THEN RAISE EXCEPTION 'Service event evidence required' USING ERRCODE='22023'; END IF;
 INSERT INTO public.service_events(id,case_id,store_id,note,document_reference,recorded_by)
 VALUES(event,subject,p->>'store',p->>'note',p->>'documentReference',auth.uid());
 RETURN private.finish(request,'sav.event.record',event,jsonb_build_object('caseId',subject,'eventId',event));
END $$;
ALTER FUNCTION public.command_supplier_create(jsonb) OWNER TO ph_engine;
ALTER FUNCTION public.command_sav_case_create(jsonb) OWNER TO ph_engine;
ALTER FUNCTION public.command_sav_event_record(jsonb) OWNER TO ph_engine;
REVOKE ALL ON FUNCTION public.command_supplier_create(jsonb),public.command_sav_case_create(jsonb),public.command_sav_event_record(jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.command_supplier_create(jsonb),public.command_sav_case_create(jsonb),public.command_sav_event_record(jsonb) TO authenticated;
COMMIT;