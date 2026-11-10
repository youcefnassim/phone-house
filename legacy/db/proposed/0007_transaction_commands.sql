-- REVIEW07: UNDEPLOYED / NOT RUN. Fresh schema 0001–0006 required. Never execute without owner approval.
BEGIN;
CREATE FUNCTION private.money(value text, allow_zero boolean DEFAULT false) RETURNS numeric
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
DECLARE n numeric;
BEGIN
 IF value IS NULL OR value !~ '^[0-9]+(\.[0-9]{1,2})?$' THEN RAISE EXCEPTION 'Invalid decimal precision' USING ERRCODE='22023'; END IF;
 n:=value::numeric;
 IF n<0 OR (n=0 AND NOT allow_zero) THEN RAISE EXCEPTION 'Invalid amount' USING ERRCODE='22023'; END IF;
 RETURN n;
END $$;
CREATE FUNCTION private.require_access(s text, manager boolean DEFAULT false) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE u uuid:=auth.uid();
BEGIN
 -- Lock authorization rows until commit so revocation cannot race a command.
 PERFORM 1 FROM public.profiles WHERE id=u AND active FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Inactive or unauthenticated' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.user_roles WHERE user_id=u AND revoked_at IS NULL AND
 ((role='SUPER_ADMIN' AND store_id IS NULL) OR (store_id=s AND (role='MANAGER' OR (NOT manager AND role='SELLER')))) FOR SHARE;
 IF NOT FOUND OR s NOT IN ('M01','M02') THEN RAISE EXCEPTION 'Store permission denied' USING ERRCODE='42501'; END IF;
 RETURN u;
END $$;
CREATE FUNCTION private.reject_extra(p jsonb, allowed text[]) RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF jsonb_typeof(p)<>'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(p) k WHERE NOT(k=ANY(allowed))) THEN RAISE EXCEPTION 'Unexpected input' USING ERRCODE='22023'; END IF;
END $$;
CREATE FUNCTION private.command_begin(request jsonb, op text, manager boolean DEFAULT false) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE u uuid; s text:=request->'payload'->>'store'; r private.idempotency_records; fingerprint text;
BEGIN
 PERFORM private.reject_extra(request,ARRAY['contractVersion','idempotencyKey','clientRequestId','payload']);
 IF request->>'contractVersion'<>'2026-11-review08' OR request->>'contractVersion' IS NULL OR (request->>'idempotencyKey') IS NULL OR (request->>'idempotencyKey') !~ '^[A-Za-z0-9][A-Za-z0-9-]{15,79}$' OR (request->>'clientRequestId') IS NULL THEN RAISE EXCEPTION 'Invalid envelope' USING ERRCODE='22023'; END IF;
 PERFORM (request->>'clientRequestId')::uuid;
 u:=private.require_access(s,manager);
 -- jsonb text is canonical in PostgreSQL; no browser hash is accepted.
 fingerprint:=encode(sha256(convert_to((request->'payload')::text,'UTF8')),'hex');
 -- Global key lock prevents cross-actor key misuse; key records are immutable.
 PERFORM pg_advisory_xact_lock(hashtextextended(request->>'idempotencyKey',0));
 SELECT * INTO r FROM private.idempotency_records WHERE key=request->>'idempotencyKey';
 IF FOUND THEN
  IF r.actor_id<>u THEN RAISE EXCEPTION 'Replay actor denied' USING ERRCODE='42501'; END IF;
  IF (r.operation,r.store_id,r.contract_version,r.payload_hash) IS DISTINCT FROM (op,s,request->>'contractVersion',fingerprint) THEN RAISE EXCEPTION 'Idempotency binding conflict' USING ERRCODE='23505'; END IF;
  RETURN r.response || jsonb_build_object('replayed',true);
 END IF;
 RETURN NULL;
END $$;
CREATE FUNCTION private.finish(request jsonb,op text,subject uuid,result jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE response jsonb; t uuid:=gen_random_uuid(); s text:=request->'payload'->>'store';
BEGIN
 INSERT INTO private.audit_events(actor_id,operation,subject_id,store_id) VALUES(auth.uid(),op,subject,s);
 response:=jsonb_build_object('ok',true,'transactionId',t,'idempotencyKey',request->>'idempotencyKey','replayed',false,'data',result);
 INSERT INTO private.idempotency_records(key,actor_id,operation,store_id,contract_version,payload_hash,transaction_id,response)
 VALUES(request->>'idempotencyKey',auth.uid(),op,s,request->>'contractVersion',encode(sha256(convert_to((request->'payload')::text,'UTF8')),'hex'),t,response);
 RETURN response;
END $$;
CREATE FUNCTION private.journal(s text,op text,subject uuid,amount numeric,debit_account text,credit_account text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE j uuid:=gen_random_uuid();
BEGIN
 IF amount=0 THEN RETURN; END IF;
 INSERT INTO private.journals(id,store_id,operation,subject_id,actor_id) VALUES(j,s,op,subject,auth.uid());
 INSERT INTO private.ledger_entries(journal_id,account,debit,credit) VALUES(j,debit_account,amount,0),(j,credit_account,0,amount);
END $$;
CREATE FUNCTION private.lock_shift(id uuid,s text) RETURNS public.cash_shifts
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE sh public.cash_shifts;
BEGIN
 SELECT * INTO sh FROM public.cash_shifts WHERE cash_shifts.id=lock_shift.id AND store_id=s FOR UPDATE;
 IF NOT FOUND OR sh.state<>'OPEN' THEN RAISE EXCEPTION 'Open shift required' USING ERRCODE='23514'; END IF;
 RETURN sh;
END $$;
CREATE FUNCTION public.command_phone_intake(request jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE p jsonb:=request->'payload'; replay jsonb; price numeric; id uuid:=gen_random_uuid(); c public.catalog_entries;
BEGIN
 replay:=private.command_begin(request,'phone.intake',true); IF replay IS NOT NULL THEN RETURN replay; END IF;
 PERFORM private.reject_extra(p,ARRAY['store','modelId','imei1','imei2','serial','barcode','condition','packaging','documentReference']);
 SELECT * INTO c FROM public.catalog_entries WHERE catalog_entries.id=(p->>'modelId')::uuid AND kind='phone_model';
 IF NOT FOUND THEN RAISE EXCEPTION 'Phone model required' USING ERRCODE='22023'; END IF;
 SELECT amount INTO price FROM private.approved_prices WHERE store_id=p->>'store' AND catalog_id=c.id FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Approved selling price required' USING ERRCODE='23514'; END IF;
 IF COALESCE(length(trim(p->>'documentReference')),0)=0 THEN RAISE EXCEPTION 'Evidence required' USING ERRCODE='22023'; END IF;
 INSERT INTO public.phone_units(id,catalog_id,store_id,imei1,imei2,serial,barcode,condition,packaging,sale_price)
 VALUES(id,c.id,p->>'store',p->>'imei1',NULLIF(p->>'imei2',''),NULLIF(p->>'serial',''),p->>'barcode',p->>'condition',p->>'packaging',price);
 RETURN private.finish(request,'phone.intake',id,jsonb_build_object('phoneId',id));
END $$;
CREATE FUNCTION public.command_accessory_receiving(request jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE p jsonb:=request->'payload'; replay jsonb; q integer; c uuid; subject uuid:=gen_random_uuid(); balance integer;
BEGIN
 replay:=private.command_begin(request,'accessory.receiving',true); IF replay IS NOT NULL THEN RETURN replay; END IF;
 PERFORM private.reject_extra(p,ARRAY['store','skuId','quantity','documentReference']);
 IF p->>'quantity' IS NULL OR p->>'quantity' !~ '^[1-9][0-9]*$' THEN RAISE EXCEPTION 'Whole quantity required' USING ERRCODE='22023'; END IF;
 q:=(p->>'quantity')::integer; c:=(p->>'skuId')::uuid;
 IF NOT EXISTS(SELECT 1 FROM public.catalog_entries WHERE id=c AND kind='accessory_sku') THEN RAISE EXCEPTION 'Accessory SKU required' USING ERRCODE='22023'; END IF;
 IF COALESCE(length(trim(p->>'documentReference')),0)=0 THEN RAISE EXCEPTION 'Evidence required' USING ERRCODE='22023'; END IF;
 INSERT INTO public.accessory_balances(store_id,catalog_id) VALUES(p->>'store',c) ON CONFLICT DO NOTHING;
 SELECT quantity INTO balance FROM public.accessory_balances WHERE store_id=p->>'store' AND catalog_id=c FOR UPDATE;
 UPDATE public.accessory_balances SET quantity=quantity+q WHERE store_id=p->>'store' AND catalog_id=c;
 INSERT INTO public.accessory_stock_ledger(id,store_id,catalog_id,quantity_delta,reason,reference,created_by) VALUES(subject,p->>'store',c,q,'RECEIVING',subject,auth.uid());
 RETURN private.finish(request,'accessory.receiving',subject,jsonb_build_object('receiptId',subject,'quantity',q));
END $$;
CREATE FUNCTION public.command_cash_shift_open(request jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE p jsonb:=request->'payload'; replay jsonb; amount numeric; id uuid:=gen_random_uuid();
BEGIN
 replay:=private.command_begin(request,'cash.shift.open'); IF replay IS NOT NULL THEN RETURN replay; END IF;
 PERFORM private.reject_extra(p,ARRAY['store','drawerId','openingFloat']);
 amount:=private.money(p->>'openingFloat',true);
 PERFORM 1 FROM public.cash_drawers WHERE cash_drawers.id=(p->>'drawerId')::uuid AND store_id=p->>'store' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Drawer scope denied' USING ERRCODE='42501'; END IF;
 INSERT INTO public.cash_shifts(id,store_id,drawer_id,opened_by,opening_float) VALUES(id,p->>'store',(p->>'drawerId')::uuid,auth.uid(),amount);
 PERFORM private.journal(p->>'store','cash.shift.open',id,amount,'CASH_DRAWER','OPENING_RECONCILIATION');
 RETURN private.finish(request,'cash.shift.open',id,jsonb_build_object('shiftId',id,'state','OPEN'));
END $$;
CREATE FUNCTION public.command_cash_movement(request jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE p jsonb:=request->'payload'; replay jsonb; amount numeric; id uuid:=gen_random_uuid();
BEGIN
 replay:=private.command_begin(request,'cash.movement',true); IF replay IS NOT NULL THEN RETURN replay; END IF;
 -- Movement eligibility, negative-balance treatment and expense rules are unresolved.
 RAISE EXCEPTION 'Cash movement policy unconfigured' USING ERRCODE='42501';
 PERFORM private.reject_extra(p,ARRAY['store','shiftId','direction','amount','reason','documentReference']);
 amount:=private.money(p->>'amount'); PERFORM private.lock_shift((p->>'shiftId')::uuid,p->>'store');
 IF p->>'direction' IS NULL OR p->>'direction' NOT IN ('IN','OUT') OR COALESCE(length(trim(p->>'reason')),0)=0 OR COALESCE(length(trim(p->>'documentReference')),0)=0 THEN RAISE EXCEPTION 'Movement evidence required' USING ERRCODE='22023'; END IF;
 INSERT INTO public.cash_movements(id,store_id,shift_id,direction,amount,reason,reference,created_by) VALUES(id,p->>'store',(p->>'shiftId')::uuid,p->>'direction',amount,p->>'reason',p->>'documentReference',auth.uid());
 PERFORM private.journal(p->>'store','cash.movement',id,amount,CASE WHEN p->>'direction'='IN' THEN 'CASH_DRAWER' ELSE 'MOVEMENT_RECONCILIATION' END,CASE WHEN p->>'direction'='IN' THEN 'MOVEMENT_RECONCILIATION' ELSE 'CASH_DRAWER' END);
 RETURN private.finish(request,'cash.movement',id,jsonb_build_object('movementId',id));
END $$;
CREATE FUNCTION public.command_cash_shift_close(request jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE p jsonb:=request->'payload'; replay jsonb; counted numeric; expected numeric; sh public.cash_shifts;
BEGIN
 replay:=private.command_begin(request,'cash.shift.close',true); IF replay IS NOT NULL THEN RETURN replay; END IF;
 PERFORM private.reject_extra(p,ARRAY['store','shiftId','countedAmount','notes']);
 counted:=private.money(p->>'countedAmount',true); sh:=private.lock_shift((p->>'shiftId')::uuid,p->>'store');
 SELECT sh.opening_float+COALESCE(sum(CASE WHEN direction='IN' THEN amount ELSE -amount END),0) INTO expected FROM public.cash_movements WHERE shift_id=sh.id;
 UPDATE public.cash_shifts SET state='CLOSED',closed_at=now(),counted_amount=counted,discrepancy=counted-expected WHERE id=sh.id;
 -- No auto-adjustment or discrepancy journal: accounting treatment remains unapproved.
 RETURN private.finish(request,'cash.shift.close',sh.id,jsonb_build_object('shiftId',sh.id,'state','CLOSED','countedAmount',counted::text));
END $$;
CREATE FUNCTION public.command_pos_checkout(request jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE p jsonb:=request->'payload'; replay jsonb; line jsonb; total numeric:=0; price numeric; tendered numeric; qty integer; phone public.phone_units; c uuid; balance integer; sale uuid:=gen_random_uuid(); customer uuid;
BEGIN
 replay:=private.command_begin(request,'pos.checkout'); IF replay IS NOT NULL THEN RETURN replay; END IF;
 PERFORM private.reject_extra(p,ARRAY['store','shiftId','customerId','lines','tender','tenderedAmount','bankReference']);
 PERFORM private.lock_shift((p->>'shiftId')::uuid,p->>'store');
 customer:=NULLIF(p->>'customerId','')::uuid;
 IF customer IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.customers WHERE id=customer AND store_id=p->>'store') THEN RAISE EXCEPTION 'Customer scope denied' USING ERRCODE='42501'; END IF;
 IF jsonb_typeof(p->'lines') IS DISTINCT FROM 'array' OR jsonb_array_length(p->'lines')=0 THEN RAISE EXCEPTION 'Basket required' USING ERRCODE='22023'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p->'lines') l GROUP BY l->>'itemId',l->>'kind' HAVING count(*)>1) THEN RAISE EXCEPTION 'Duplicate basket identity' USING ERRCODE='22023'; END IF;
 -- Same ordering in every checkout: shift, then kind/item UUID, then price row.
 FOR line IN SELECT value FROM jsonb_array_elements(p->'lines') ORDER BY value->>'kind',value->>'itemId' LOOP
  PERFORM private.reject_extra(line,ARRAY['itemId','kind','quantity']);
  IF line->>'quantity' IS NULL OR line->>'quantity' !~ '^[1-9][0-9]*$' THEN RAISE EXCEPTION 'Whole quantity required' USING ERRCODE='22023'; END IF;
  qty:=(line->>'quantity')::integer; c:=(line->>'itemId')::uuid;
  IF line->>'kind'='phone' THEN
   SELECT * INTO phone FROM public.phone_units WHERE id=c AND store_id=p->>'store' FOR UPDATE;
   IF NOT FOUND OR phone.status<>'AVAILABLE' OR qty<>1 THEN RAISE EXCEPTION 'Phone unavailable' USING ERRCODE='23514'; END IF;
   price:=phone.sale_price;
   UPDATE public.phone_units SET status='SOLD' WHERE id=c;
  ELSIF line->>'kind'='accessory' THEN
   SELECT quantity INTO balance FROM public.accessory_balances WHERE store_id=p->>'store' AND catalog_id=c FOR UPDATE;
   IF NOT FOUND OR balance<qty THEN RAISE EXCEPTION 'Insufficient stock' USING ERRCODE='23514'; END IF;
   SELECT amount INTO price FROM private.approved_prices WHERE store_id=p->>'store' AND catalog_id=c FOR SHARE;
   IF NOT FOUND THEN RAISE EXCEPTION 'Approved price unavailable' USING ERRCODE='23514'; END IF;
   UPDATE public.accessory_balances SET quantity=quantity-qty WHERE store_id=p->>'store' AND catalog_id=c;
   INSERT INTO public.accessory_stock_ledger(store_id,catalog_id,quantity_delta,reason,reference,created_by) VALUES(p->>'store',c,-qty,'SALE',sale,auth.uid());
  ELSE RAISE EXCEPTION 'Invalid subtype' USING ERRCODE='22023'; END IF;
  total:=total+price*qty;
 END LOOP;
 tendered:=private.money(p->>'tenderedAmount');
 IF p->>'tender' IS NULL OR p->>'tender' NOT IN ('Cash','Bank') THEN RAISE EXCEPTION 'Tender required' USING ERRCODE='22023'; END IF;
 IF tendered<total OR (p->>'tender'='Bank' AND (tendered<>total OR COALESCE(length(trim(p->>'bankReference')),0)=0)) THEN RAISE EXCEPTION 'Payment mismatch' USING ERRCODE='22023'; END IF;
 INSERT INTO public.sales(id,store_id,shift_id,seller_id,customer_id,tender,total,bank_reference) VALUES(sale,p->>'store',(p->>'shiftId')::uuid,auth.uid(),customer,p->>'tender',total,NULLIF(p->>'bankReference',''));
 FOR line IN SELECT value FROM jsonb_array_elements(p->'lines') LOOP
  c:=(line->>'itemId')::uuid;
  IF line->>'kind'='phone' THEN SELECT sale_price INTO price FROM public.phone_units WHERE id=c;
  ELSE SELECT amount INTO price FROM private.approved_prices WHERE store_id=p->>'store' AND catalog_id=c; END IF;
  INSERT INTO public.sale_lines(sale_id,store_id,phone_unit_id,catalog_id,quantity,unit_price) VALUES(sale,p->>'store',CASE WHEN line->>'kind'='phone' THEN c END,CASE WHEN line->>'kind'='accessory' THEN c END,(line->>'quantity')::integer,price);
 END LOOP;
 INSERT INTO public.sale_payments(sale_id,store_id,method,amount,tendered,change,reference) VALUES(sale,p->>'store',p->>'tender',total,tendered,tendered-total,NULLIF(p->>'bankReference',''));
 IF p->>'tender'='Cash' THEN INSERT INTO public.cash_movements(store_id,shift_id,direction,amount,reason,reference,created_by) VALUES(p->>'store',(p->>'shiftId')::uuid,'IN',total,'SALE',sale::text,auth.uid()); END IF;
 PERFORM private.journal(p->>'store','pos.checkout',sale,total,CASE WHEN p->>'tender'='Cash' THEN 'CASH_DRAWER' ELSE 'BANK' END,'SALE_RECONCILIATION');
 RETURN private.finish(request,'pos.checkout',sale,jsonb_build_object('saleId',sale,'total',total::text,'change',(tendered-total)::text));
END $$;
CREATE FUNCTION public.command_debt_repayment(request jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE p jsonb:=request->'payload'; replay jsonb; d public.debts; amount numeric; balance numeric; subject uuid:=gen_random_uuid();
BEGIN
 replay:=private.command_begin(request,'debt.repayment',true); IF replay IS NOT NULL THEN RETURN replay; END IF;
 PERFORM private.reject_extra(p,ARRAY['store','debtId','shiftId','amount','method','reference','authorizationReference']);
 amount:=private.money(p->>'amount');
 IF p->>'method'='Cash' THEN PERFORM private.lock_shift((p->>'shiftId')::uuid,p->>'store');
 ELSIF p->>'method' IS DISTINCT FROM 'Bank' OR NULLIF(p->>'shiftId','') IS NOT NULL THEN RAISE EXCEPTION 'Settlement method invalid' USING ERRCODE='22023'; END IF;
 SELECT * INTO d FROM public.debts WHERE id=(p->>'debtId')::uuid AND store_id=p->>'store' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Debt scope denied' USING ERRCODE='42501'; END IF;
 SELECT d.amount-COALESCE(sum(r.amount),0) INTO balance FROM public.repayments r WHERE debt_id=d.id;
 IF amount>balance THEN RAISE EXCEPTION 'Repayment exceeds balance' USING ERRCODE='23514'; END IF;
 IF COALESCE(length(trim(p->>'reference')),0)=0 OR COALESCE(length(trim(p->>'authorizationReference')),0)=0 THEN RAISE EXCEPTION 'Evidence required' USING ERRCODE='22023'; END IF;
 INSERT INTO public.repayments(id,debt_id,store_id,shift_id,amount,method,reference,authorization_reference,created_by) VALUES(subject,d.id,d.store_id,NULLIF(p->>'shiftId','')::uuid,amount,p->>'method',p->>'reference',p->>'authorizationReference',auth.uid());
 IF p->>'method'='Cash' THEN INSERT INTO public.cash_movements(store_id,shift_id,direction,amount,reason,reference,created_by) VALUES(d.store_id,(p->>'shiftId')::uuid,'IN',amount,'REPAYMENT',subject::text,auth.uid()); END IF;
 PERFORM private.journal(d.store_id,'debt.repayment',subject,amount,CASE WHEN p->>'method'='Cash' THEN 'CASH_DRAWER' ELSE 'BANK' END,'RECEIVABLE');
 RETURN private.finish(request,'debt.repayment',subject,jsonb_build_object('repaymentId',subject,'outstanding',(balance-amount)::text));
END $$;
-- All helper and command functions explicitly owned and ACL-hardened. No SQL errors are swallowed.
ALTER FUNCTION private.money(text,boolean) OWNER TO ph_engine;
REVOKE ALL ON FUNCTION private.money(text,boolean) FROM PUBLIC,anon,authenticated,service_role;
ALTER FUNCTION private.require_access(text,boolean) OWNER TO ph_engine;
REVOKE ALL ON FUNCTION private.require_access(text,boolean) FROM PUBLIC,anon,authenticated,service_role;
ALTER FUNCTION private.reject_extra(jsonb,text[]) OWNER TO ph_engine;
REVOKE ALL ON FUNCTION private.reject_extra(jsonb,text[]) FROM PUBLIC,anon,authenticated,service_role;
ALTER FUNCTION private.command_begin(jsonb,text,boolean) OWNER TO ph_engine;
REVOKE ALL ON FUNCTION private.command_begin(jsonb,text,boolean) FROM PUBLIC,anon,authenticated,service_role;
ALTER FUNCTION private.finish(jsonb,text,uuid,jsonb) OWNER TO ph_engine;
REVOKE ALL ON FUNCTION private.finish(jsonb,text,uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
ALTER FUNCTION private.journal(text,text,uuid,numeric,text,text) OWNER TO ph_engine;
REVOKE ALL ON FUNCTION private.journal(text,text,uuid,numeric,text,text) FROM PUBLIC,anon,authenticated,service_role;
ALTER FUNCTION private.lock_shift(uuid,text) OWNER TO ph_engine;
REVOKE ALL ON FUNCTION private.lock_shift(uuid,text) FROM PUBLIC,anon,authenticated,service_role;
ALTER FUNCTION public.command_phone_intake(jsonb) OWNER TO ph_engine;
REVOKE ALL ON FUNCTION public.command_phone_intake(jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.command_phone_intake(jsonb) TO authenticated;
ALTER FUNCTION public.command_accessory_receiving(jsonb) OWNER TO ph_engine;
REVOKE ALL ON FUNCTION public.command_accessory_receiving(jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.command_accessory_receiving(jsonb) TO authenticated;
ALTER FUNCTION public.command_cash_shift_open(jsonb) OWNER TO ph_engine;
REVOKE ALL ON FUNCTION public.command_cash_shift_open(jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.command_cash_shift_open(jsonb) TO authenticated;
ALTER FUNCTION public.command_cash_movement(jsonb) OWNER TO ph_engine;
REVOKE ALL ON FUNCTION public.command_cash_movement(jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.command_cash_movement(jsonb) TO authenticated;
ALTER FUNCTION public.command_cash_shift_close(jsonb) OWNER TO ph_engine;
REVOKE ALL ON FUNCTION public.command_cash_shift_close(jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.command_cash_shift_close(jsonb) TO authenticated;
ALTER FUNCTION public.command_pos_checkout(jsonb) OWNER TO ph_engine;
REVOKE ALL ON FUNCTION public.command_pos_checkout(jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.command_pos_checkout(jsonb) TO authenticated;
ALTER FUNCTION public.command_debt_repayment(jsonb) OWNER TO ph_engine;
REVOKE ALL ON FUNCTION public.command_debt_repayment(jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.command_debt_repayment(jsonb) TO authenticated;
COMMIT;
