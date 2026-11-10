import { invoiceYear, newPublicReference } from "@/domain/warranty-documents";
import { nativeCheckoutEnvelope } from "@/domain/native-checkout";
import { normalizedBuyer, warrantyDates } from "@/domain/sales-review";
import { canonicalJson, planCheckout } from "./checkout";
import type { SqlStatement, VerifiedIdentity } from "./port";

/** One ordered D1 batch. Buyer creation happens inside it, never as a prior call. */
export function planRetailCheckout(
  input: unknown,
  identity: VerifiedIdentity,
  hash: string,
  tx: string,
  now: number,
): SqlStatement[] {
  const e = nativeCheckoutEnvelope.parse(input),
    p = e.payload,
    key = e.idempotencyKey;
  const candidate = p.customerId ?? crypto.randomUUID();
  const legacy = {
    ...e,
    contractVersion: "2026-11-review08",
    payload: {
      store: p.store,
      shiftId: p.shiftId,
      customerId: p.buyer ? candidate : undefined,
      lines: p.lines,
      tender: p.tender,
      tenderedAmount: p.tenderedAmount,
      bankReference: p.bankReference,
      cashAmount: p.cashAmount,
      bankAmount: p.bankAmount,
      bankMethod: p.bankMethod,
      discountAmount: p.discountAmount,
      creditAmount: p.creditAmount,
      dueDate: p.dueDate,
    },
  };
  const pending = `EXISTS(SELECT 1 FROM commands WHERE key=? AND state='STARTED')`;
  const statement = (sql: string, ...params: SqlStatement["params"]): SqlStatement => ({
    sql,
    params,
  });
  let customerStatements: SqlStatement[] | undefined;
  if (p.buyer) {
    const b = p.buyer,
      name = `${b.surname} ${b.givenName}`,
      nameKey = normalizedBuyer(name),
      contactKey = normalizedBuyer(b.contact);
    if (p.customerId) {
      // Existing legacy names are checked, but missing details remain unknown.
      customerStatements = [
        statement(
          `INSERT INTO command_guards SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM customers c LEFT JOIN customer_details d ON d.customer_id=c.id WHERE c.id=? AND c.store_id=? AND ((d.name_key=? AND(d.contact_key=? OR ?='')) OR(d.customer_id IS NULL AND c.name=?))) THEN 1 ELSE 0 END WHERE ${pending}`,
          key,
          p.customerId,
          p.store,
          nameKey,
          contactKey,
          contactKey,
          name,
          key,
        ),
      ];
    } else {
      // Owner decision: never auto-merge. A typed buyer is always a new customer
      // recorded exactly as entered, even when name or contact match another one.
      customerStatements = [
        statement(
          `INSERT INTO customers(id,store_id,name,reference) SELECT ?,?,?,? WHERE ${pending}`,
          candidate,
          p.store,
          name,
          `LOCAL-${candidate}`,
          key,
        ),
        statement(
          `INSERT INTO customer_details(customer_id,store_id,surname,given_name,contact,name_key,contact_key) SELECT ?,?,?,?,?,?,? WHERE ${pending}`,
          candidate,
          p.store,
          b.surname,
          b.givenName,
          b.contact,
          nameKey,
          contactKey,
          key,
        ),
      ];
    }
  }
  const drafts = p.warranties.map((w) => ({
    ...w,
    ...(w.requested ? { provider: w.provider ?? "SHOP" } : {}),
    ...(w.requested && w.months ? warrantyDates(new Date(now), w.months) : {}),
  }));
  const year = invoiceYear(new Date(now));
  const publicRef = newPublicReference();
  const beforeCompletion = [
    statement(
      `INSERT INTO invoice_sequences(store_id,year,last) SELECT ?,?,1 WHERE ${pending} ON CONFLICT(store_id,year) DO UPDATE SET last=last+1`,
      p.store,
      year,
      key,
    ),
    statement(
      `UPDATE sales SET invoice_number=(SELECT printf('FA-%s-%d-%06d',store_id,year,last) FROM invoice_sequences WHERE store_id=? AND year=?),public_ref=? WHERE command_key=? AND ${pending}`,
      p.store,
      year,
      publicRef,
      key,
      key,
    ),
    statement(
      `INSERT INTO warranty_requests(sale_id,phone_id,requested,months,start_date,end_date,state,provider) SELECT ?,json_extract(value,'$.itemId'),json_extract(value,'$.requested'),json_extract(value,'$.months'),json_extract(value,'$.start'),json_extract(value,'$.end'),'DRAFT_PENDING',json_extract(value,'$.provider') FROM json_each(?) WHERE ${pending}`,
      tx,
      JSON.stringify(drafts),
      key,
    ),
    statement(
      `INSERT INTO receipt_snapshots SELECT s.id,?,json_object('specimen',1,'saleId',s.id,'invoiceNumber',s.invoice_number,'publicRef',s.public_ref,'store',s.store_id,'operator',s.seller_id,'shift',s.shift_id,'customerId',s.customer_id,'buyer',CASE WHEN s.customer_id IS NULL THEN NULL ELSE json_object('name',c.name,'surname',d.surname,'givenName',d.given_name,'contact',d.contact) END,'payment',CASE WHEN sp.cash_minor>0 AND sp.bank_minor>0 THEN 'Split' ELSE s.tender END,'creditMinor',COALESCE((SELECT amount_minor FROM sale_credits WHERE sale_id=s.id),0),'dueDate',(SELECT due_date FROM sale_credits WHERE sale_id=s.id),'cashMinor',sp.cash_minor,'bankMinor',sp.bank_minor,'bankMethod',sp.bank_method,'discountMinor',sp.discount_minor,'totalMinor',s.total_minor,'tenderedMinor',s.tendered_minor,'changeMinor',s.change_minor,'bankReference',s.bank_reference,'soldAt',?,'lines',json((SELECT json_group_array(json_object('itemId',l.item_id,'kind',l.kind,'quantity',l.quantity,'unitMinor',l.unit_minor,'name',cat.name,'reference',cat.sku,'barcode',ph.barcode,'serial',ph.serial,'imei1',(SELECT identifier FROM phone_identifiers WHERE phone_id=ph.id AND slot=1),'imei2',(SELECT identifier FROM phone_identifiers WHERE phone_id=ph.id AND slot=2))) FROM sale_lines l LEFT JOIN phones ph ON ph.id=l.item_id AND l.kind='phone' JOIN catalog cat ON cat.id=CASE WHEN l.kind='phone' THEN ph.catalog_id ELSE l.item_id END WHERE l.sale_id=s.id)),'warranties',json(?)) FROM sales s JOIN sale_settlements sp ON sp.sale_id=s.id LEFT JOIN customers c ON c.id=s.customer_id LEFT JOIN customer_details d ON d.customer_id=c.id WHERE s.command_key=? AND ${pending}`,
      now,
      now,
      JSON.stringify(drafts),
      key,
      key,
    ),
  ];
  return planCheckout(legacy, identity, hash, tx, now, {
    ...(customerStatements ? { customerStatements } : {}),
    beforeCompletion,
    responseKey: true,
    // Append-only audit retains the link, not erasable buyer personal data.
    auditPayload: canonicalJson({
      ...e,
      payload: {
        ...Object.fromEntries(Object.entries(p).filter(([field]) => field !== "buyer")),
        customerId: p.buyer ? candidate : null,
      },
    }),
  });
}
