-- CANDIDATE ONLY. NOT A LOVABLE-MANAGED MIGRATION. NOT EXECUTED OR APPROVED.
-- Requires reconciled base schema, verified ph_engine ownership and explicit
-- approval. Preserves historical 0001–0012 byte evidence; supersedes their
-- permissive JSON ->> validation when included in a reviewed hosted baseline.
BEGIN;
CREATE OR REPLACE FUNCTION private.reject_extra(p jsonb, allowed text[])
RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF jsonb_typeof(p) IS DISTINCT FROM 'object' OR EXISTS (
  SELECT 1 FROM jsonb_object_keys(p) k WHERE NOT(k=ANY(allowed))
 ) THEN RAISE EXCEPTION 'Unexpected input' USING ERRCODE='22023'; END IF;
END $$;
CREATE FUNCTION private.validate_rpc_input(request jsonb, operation text)
RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE p jsonb; required text[]; optional text[]; key text; line jsonb;
BEGIN
 PERFORM private.reject_extra(request,ARRAY['contractVersion','idempotencyKey','clientRequestId','payload']);
 FOREACH key IN ARRAY ARRAY['contractVersion','idempotencyKey','clientRequestId'] LOOP
  IF jsonb_typeof(request->key) IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'Envelope type invalid' USING ERRCODE='22023'; END IF;
 END LOOP;
 p:=request->'payload';
 CASE operation
 WHEN 'customer.create' THEN required:=ARRAY['store','name','contact','reference'];optional:=ARRAY['address','notes'];
 WHEN 'supplier.create' THEN required:=ARRAY['store','name','contact','documentReference'];optional:=ARRAY['notes'];
 WHEN 'sav.case.create' THEN required:=ARRAY['store','saleId','saleLineId','customerId','imei','issue','requestedAction','documentReference'];optional:=ARRAY['notes'];
 WHEN 'sav.event.record' THEN required:=ARRAY['store','caseId','note','documentReference'];optional:=ARRAY[]::text[];
 WHEN 'phone.intake' THEN required:=ARRAY['store','modelId','variantId','purchaseId','supplierId','imei1','barcode','condition','packaging','documentReference','color','storage','conditionRemarks','batteryHealth'];optional:=ARRAY['imei2','serial'];
 WHEN 'accessory.receiving' THEN required:=ARRAY['store','skuId','purchaseId','supplierId','quantity','documentReference'];optional:=ARRAY[]::text[];
 WHEN 'cash.shift.open' THEN required:=ARRAY['store','drawerId','openingFloat'];optional:=ARRAY[]::text[];
 WHEN 'cash.shift.close' THEN required:=ARRAY['store','shiftId','countedAmount'];optional:=ARRAY['notes'];
 WHEN 'cash.movement' THEN required:=ARRAY['store','shiftId','direction','amount','reason','documentReference'];optional:=ARRAY[]::text[];
 WHEN 'pos.checkout' THEN required:=ARRAY['store','shiftId','lines','tender','tenderedAmount'];optional:=ARRAY['customerId','bankReference'];
 WHEN 'debt.repayment' THEN required:=ARRAY['store','debtId','amount','method','reference','authorizationReference'];optional:=ARRAY['shiftId'];
 WHEN 'transfer.approve' THEN required:=ARRAY['store','transferId','approval'];optional:=ARRAY[]::text[];
 ELSE RAISE EXCEPTION 'Unsupported command' USING ERRCODE='22023';
 END CASE;
 PERFORM private.reject_extra(p,required||optional);
 FOREACH key IN ARRAY required LOOP
  IF NOT(p ? key) THEN RAISE EXCEPTION 'Required field missing' USING ERRCODE='22023'; END IF;
 END LOOP;
 FOR key IN SELECT jsonb_object_keys(p) LOOP
  IF key IN ('lines','batteryHealth') THEN CONTINUE; END IF;
  IF jsonb_typeof(p->key) IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'Text field type invalid' USING ERRCODE='22023'; END IF;
 END LOOP;
 IF operation='phone.intake' AND (
  jsonb_typeof(p->'batteryHealth') NOT IN ('number','null') OR
  (jsonb_typeof(p->'batteryHealth')='number' AND (p->>'batteryHealth')::numeric NOT BETWEEN 0 AND 100)
 ) THEN RAISE EXCEPTION 'Battery health invalid' USING ERRCODE='22023'; END IF;
 IF operation='pos.checkout' THEN
  IF jsonb_typeof(p->'lines') IS DISTINCT FROM 'array' OR jsonb_array_length(p->'lines')=0 THEN RAISE EXCEPTION 'Basket required' USING ERRCODE='22023'; END IF;
  FOR line IN SELECT value FROM jsonb_array_elements(p->'lines') LOOP
   PERFORM private.reject_extra(line,ARRAY['itemId','kind','quantity']);
   FOREACH key IN ARRAY ARRAY['itemId','kind','quantity'] LOOP
    IF jsonb_typeof(line->key) IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'Line type invalid' USING ERRCODE='22023'; END IF;
   END LOOP;
   IF line->>'kind' NOT IN ('phone','accessory') OR line->>'quantity' !~ '^[1-9][0-9]*$' THEN RAISE EXCEPTION 'Line quantity or kind invalid' USING ERRCODE='22023'; END IF;
   PERFORM (line->>'itemId')::uuid;
  END LOOP;
 END IF;
END $$;
-- A wrapper preserves the original authorization, locking, hash binding and
-- replay code rather than replacing it with browser assumptions.
ALTER FUNCTION private.command_begin(jsonb,text,boolean) RENAME TO command_begin_before_strict_types;
CREATE FUNCTION private.command_begin(request jsonb,op text,manager boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 PERFORM private.validate_rpc_input(request,op);
 RETURN private.command_begin_before_strict_types(request,op,manager);
END $$;
ALTER FUNCTION private.validate_rpc_input(jsonb,text) OWNER TO ph_engine;
ALTER FUNCTION private.command_begin(jsonb,text,boolean) OWNER TO ph_engine;
REVOKE ALL ON FUNCTION private.validate_rpc_input(jsonb,text), private.command_begin(jsonb,text,boolean), private.command_begin_before_strict_types(jsonb,text,boolean), private.reject_extra(jsonb,text[]) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.validate_rpc_input(jsonb,text), private.command_begin(jsonb,text,boolean), private.command_begin_before_strict_types(jsonb,text,boolean), private.reject_extra(jsonb,text[]) TO ph_engine;
COMMIT;