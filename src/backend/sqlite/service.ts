import { normalizePublicReference, publicReferenceFormat } from "@/domain/warranty-documents";
import { daysSinceSale, salesByDay, zakatTotals } from "@/domain/batch4b";
import { algiersDate } from "@/domain/sales-review";
import { ownerDashboardResult } from "@/domain/owner-dashboard";
import { decimalValue } from "@/domain/erp";
import { membershipSql, rolesForOperation, readOperation } from "@/domain/permissions";
import { z } from "zod";
import { transactionEnvelope, transactionPayloads } from "@/domain/transaction-contracts";
import { canonicalJson, planCheckout } from "./checkout";
import type {
  AtomicSqlPort,
  IdentityVerifier,
  PrivateDocumentPort,
  VerifiedIdentity,
} from "./port";
import { planNativeCommand } from "./commands";
import { nativeEnvelope, nativePayloads } from "@/domain/native-commands";
import { nativeCheckoutEnvelope } from "@/domain/native-checkout";
import { planRetailCheckout } from "./retail-checkout";
import { planStandaloneReceiving } from "./standalone-receiving";
import { diagnoseWrite, NativeWriteError, validatedPlan } from "./write-diagnostics";
import { nativeReceiving } from "@/domain/native-receiving";
import { intakeAttributeKeys, nativeDailyQuery, nativeDailyResources } from "@/domain/native-daily";
import { resolveSettings, staffReadableSettings } from "@/domain/intake";
import { createSupplierProvenanceService } from "./supplier-provenance";
import { nativePosSearchQuery, nativePosSearchResult } from "@/domain/native-pos-search";
import {
  nativeCashLedgerQuery,
  nativeCashLedgerResult,
  nativeCustomerHistoryQuery,
  nativeCustomerHistoryResult,
  nativeCustomerSearchQuery,
  nativeCustomerSearchResult,
  nativeSalesHistoryQuery,
  nativeSalesHistoryResult,
} from "@/domain/native-history";
import { normalizedBuyer } from "@/domain/sales-review";
import {
  nativeDebtsQuery,
  nativeDebtsResult,
  nativeExpensesQuery,
  nativeExpensesResult,
  nativeFacilityQuery,
  nativeFacilityResult,
  nativeSavQuery,
  nativeSavResult,
  nativeTransferDetailQuery,
  nativeTransferDetailResult,
} from "@/domain/native-operations";

// Identity provider is unconfigured. A real verifier must validate signature,
// issuer, audience, expiry/revocation; caller/body role flags are never accepted.
export const nativeModules = [
  "inventory",
  "catalog",
  "purchases",
  "suppliers",
  "customers",
  "sales",
  "cash",
  "transfers",
  "debts",
  "facility",
  "sav",
  "expenses",
  "reports",
  "documents",
  "audit",
  "users",
  "settings",
] as const;
export type NativeModule = (typeof nativeModules)[number];
const scopeSchema = z.enum(["M01", "M02"]);
const reads: Record<NativeModule, string> = {
  inventory: `SELECT ph.id,ph.store_id,ph.catalog_id,ph.barcode,ph.state,ph.attributes_json,ph.serial,c.name,c.sku,p.amount_minor,(SELECT identifier FROM phone_identifiers WHERE phone_id=ph.id AND slot=1) imei1,(SELECT identifier FROM phone_identifiers WHERE phone_id=ph.id AND slot=2) imei2 FROM phones ph JOIN catalog c ON c.id=ph.catalog_id LEFT JOIN prices p ON p.item_id=ph.catalog_id AND p.store_id=ph.store_id WHERE ph.store_id=?`,
  catalog: `SELECT c.id,c.kind,c.sku,c.name,c.attributes_json,p.amount_minor,b.quantity,COALESCE(json_extract(c.attributes_json,'$.barcode'),c.sku) barcode FROM catalog c LEFT JOIN prices p ON p.item_id=c.id AND p.store_id=? LEFT JOIN accessory_balances b ON b.item_id=c.id AND b.store_id=? WHERE p.item_id IS NOT NULL OR b.item_id IS NOT NULL`,
  purchases: `SELECT id,store_id,supplier_id,item_id,quantity,state FROM purchases WHERE store_id=?`,
  suppliers: `SELECT s.id,s.store_id,s.name,s.reference,c.phone FROM suppliers s LEFT JOIN supplier_contacts c ON c.supplier_id=s.id WHERE s.store_id=?`,
  customers: `SELECT id,store_id,name,reference FROM customers WHERE store_id=?`,
  sales: `SELECT id,store_id,shift_id,seller_id,customer_id,total_minor,tender,change_minor FROM sales WHERE store_id=?`,
  cash: `SELECT id,store_id,drawer_id,seller_id,state,opening_minor,counted_minor FROM shifts WHERE store_id=?`,
  transfers: `SELECT id,source_store,destination_store,stage FROM transfers WHERE source_store=? OR destination_store=?`,
  debts: `SELECT d.id,d.customer_id,d.sale_id,d.amount_minor,d.state,d.balance_minor,d.due_date FROM (SELECT sale_id id,customer_id,sale_id,amount_minor,state,balance_minor,due_date FROM credit_balances UNION ALL SELECT id,customer_id,sale_id,amount_minor,state,amount_minor,NULL FROM debts) d JOIN customers c ON c.id=d.customer_id WHERE c.store_id=?`,
  facility: `SELECT id,store_id,customer_id,employer,cash_price_minor,contract_price_minor,state FROM facilities WHERE store_id=?`,
  sav: `SELECT c.id,c.sale_id,s.public_ref,c.phone_id,c.customer_id,c.state,c.issue,(SELECT provider FROM warranty_requests w WHERE w.sale_id=s.id AND w.phone_id=c.phone_id AND w.requested=1) warranty_provider FROM service_cases c JOIN sales s ON s.id=c.sale_id WHERE s.store_id=?`,
  expenses: `SELECT id,store_id,amount_minor,evidence_key,state FROM expenses WHERE store_id=?`,
  reports: `SELECT store_id,count(*) sale_count,sum(total_minor) gross_minor FROM sales WHERE store_id=? GROUP BY store_id`,
  documents: `SELECT id,store_id,mime,state FROM documents WHERE store_id=?`,
  audit: `SELECT id,command_key,actor_id,store_id,operation,at FROM audit_events WHERE store_id=?`,
  users: `SELECT a.id,a.active,m.store_id,m.role FROM accounts a JOIN memberships m ON m.user_id=a.id WHERE m.store_id=?`,
  settings: `SELECT id,label FROM stores WHERE id=?`,
};
const searchColumn: Record<NativeModule, string> = {
  inventory: "barcode",
  catalog: "sku",
  purchases: "id",
  suppliers: "name",
  customers: "name",
  sales: "id",
  cash: "id",
  transfers: "id",
  debts: "id",
  facility: "id",
  sav: "id",
  expenses: "id",
  reports: "store_id",
  documents: "id",
  audit: "operation",
  users: "id",
  settings: "id",
};
export const pageSchema = z
  .object({
    limit: z.number().int().min(1).max(200).default(200),
    offset: z.number().int().min(0).max(1000000).default(0),
    search: z.string().trim().max(80).optional(),
  })
  .strict();
function magicMatches(mime: string, raw: Uint8Array) {
  return mime === "application/pdf"
    ? new TextDecoder().decode(raw.slice(0, 5)) === "%PDF-"
    : mime === "image/jpeg"
      ? raw[0] === 255 && raw[1] === 216 && raw[2] === 255
      : mime === "image/png"
        ? raw[0] === 137 && raw[1] === 80 && raw[2] === 78 && raw[3] === 71
        : false;
}
export type NativeService = ReturnType<typeof createNativeService>;
export function createNativeService(
  db: AtomicSqlPort,
  verifier: IdentityVerifier,
  documents: PrivateDocumentPort,
  clock: () => number = Date.now,
) {
  const authenticate = async (credential: string): Promise<VerifiedIdentity> => {
    const identity = await verifier.verify(credential);
    if (!identity || !identity.sessionId || identity.expiresAt <= clock())
      throw new Error("UNAUTHORIZED");
    return identity;
  };
  const authorize = async (
    identity: VerifiedIdentity,
    store: string,
    operation = "operational.read",
  ) => {
    const rows = await db.read({
      sql: `SELECT m.role FROM accounts a JOIN memberships m ON m.user_id=a.id JOIN sessions s ON s.user_id=a.id WHERE a.id=? AND a.active=1 AND s.id=? AND s.revoked=0 AND s.expires_at>? AND ${membershipSql(operation, "m")}`,
      params: [identity.userId, identity.sessionId ?? null, clock(), store],
    });
    if (!rows.length) throw new Error("FORBIDDEN");
    return rows;
  };
  // Final in-query authorization gate: a session revoked between the precheck
  // and the projection returns zero rows instead of data. Params: userId,
  // sessionId, now, store.
  const scopedGate = `EXISTS(SELECT 1 FROM accounts a JOIN sessions s ON s.user_id=a.id JOIN memberships m ON m.user_id=a.id WHERE a.id=? AND a.active=1 AND s.id=? AND s.revoked=0 AND s.expires_at>? AND ${membershipSql("operational.read", "m")})`;
  const writeIdentity = async (credential: string) => {
    const identity = await verifier.verify(credential);
    if (!identity || !identity.sessionId) throw new NativeWriteError("UNAUTHORIZED");
    if (identity.expiresAt <= clock()) throw new NativeWriteError("SESSION_REVOKED");
    return identity;
  };
  const authorizeWrite = async (
    identity: VerifiedIdentity,
    store: string,
    operation = "operational.read",
  ) => {
    const session = await db.read({
      sql: "SELECT s.revoked,s.expires_at,a.active FROM sessions s JOIN accounts a ON a.id=s.user_id WHERE s.id=? AND s.user_id=?",
      params: [identity.sessionId ?? null, identity.userId],
    });
    if (
      !session[0] ||
      session[0]["revoked"] !== 0 ||
      session[0]["active"] !== 1 ||
      Number(session[0]["expires_at"]) <= clock()
    )
      throw new NativeWriteError("SESSION_REVOKED");
    await authorize(identity, store, operation);
  };
  // Attach cost-free sale lines to sale summary rows.
  const withLines = async (sales: Record<string, unknown>[]) => {
    if (!sales.length) return [];
    const ids = sales.map((s) => String(s["id"]));
    const lines = await db.read({
      sql: `SELECT l.sale_id saleId,l.kind,cat.name,l.quantity,l.unit_minor unitMinor,(SELECT identifier FROM phone_identifiers WHERE phone_id=ph.id AND slot=1) imei1,ph.serial FROM sale_lines l LEFT JOIN phones ph ON ph.id=l.item_id AND l.kind='phone' JOIN catalog cat ON cat.id=CASE WHEN l.kind='phone' THEN ph.catalog_id ELSE l.item_id END WHERE l.sale_id IN(${ids.map(() => "?").join(",")}) ORDER BY l.sale_id,l.kind,l.item_id`,
      params: ids,
    });
    return sales.map((sale) => ({
      ...sale,
      lines: lines
        .filter((line) => line["saleId"] === sale["id"])
        .map(({ saleId, ...line }) => line),
    }));
  };
  return {
    async ownerDashboard(credential: string) {
      const identity = await authenticate(credential);
      await authorize(identity, "M01", "owner.read");
      const day = algiersDate(new Date(clock()));
      const from = Date.parse(`${day}T00:00:00+01:00`);
      const sales = await db.read({
        sql: `SELECT s.store_id store,count(*) count,sum(s.total_minor) amountMinor FROM sales s JOIN receipt_snapshots r ON r.sale_id=s.id WHERE r.sold_at>=? AND r.sold_at<? AND NOT EXISTS(SELECT 1 FROM sale_voids v WHERE v.sale_id=s.id) GROUP BY s.store_id`,
        params: [from, from + 86400000],
      });
      const drawers = await db.read({
        sql: `SELECT sh.store_id store,sh.drawer_id id,sh.opening_minor+COALESCE((SELECT sum(amount_minor) FROM effective_cash_movements m WHERE m.shift_id=sh.id),0) amountMinor FROM shifts sh WHERE sh.state='OPEN' ORDER BY sh.store_id,sh.id`,
        params: [],
      });
      const lowStock = await db.read({
        sql: `SELECT b.store_id store,c.id,c.name,b.quantity,json_extract(c.attributes_json,'$.lowStockThreshold') threshold FROM accessory_balances b JOIN catalog c ON c.id=b.item_id WHERE json_type(c.attributes_json,'$.lowStockThreshold')='integer' AND b.quantity<=json_extract(c.attributes_json,'$.lowStockThreshold') ORDER BY b.store_id,c.id`,
        params: [],
      });
      const lateCredits = await db.read({
        sql: `SELECT s.store_id store,c.sale_id id,c.due_date due,c.balance_minor balanceMinor FROM credit_balances c JOIN sales s ON s.id=c.sale_id WHERE c.balance_minor>0 AND c.due_date<? ORDER BY c.due_date,c.sale_id`,
        params: [day],
      });
      const waitingSql = `SELECT sh.store_id store,c.shift_id id,'cash' kind,NULL countId FROM shift_closures c JOIN shifts sh ON sh.id=c.shift_id WHERE c.review_state='PENDING' AND NOT EXISTS(SELECT 1 FROM shift_reviews r WHERE r.shift_id=c.shift_id)
        UNION ALL SELECT t.source_store,t.id,'approval',NULL FROM transfers t WHERE t.stage IN('DRAFT','APPROVALS') AND NOT EXISTS(SELECT 1 FROM transfer_approvals a WHERE a.transfer_id=t.id AND a.approval='SUPER_ADMIN') AND NOT EXISTS(SELECT 1 FROM transfer_cancellations x WHERE x.transfer_id=t.id)
        UNION ALL SELECT t.source_store,t.id,'dispatch',NULL FROM transfers t WHERE t.stage='APPROVALS' AND (SELECT count(*) FROM transfer_approvals a WHERE a.transfer_id=t.id)=2 AND NOT EXISTS(SELECT 1 FROM transfer_dispatches d WHERE d.transfer_id=t.id)
        UNION ALL SELECT a.store_id,a.id,'adjustment',a.count_id FROM stock_adjustments a WHERE NOT EXISTS(SELECT 1 FROM stock_adjustment_reviews r WHERE r.adjustment_id=a.id)
        UNION ALL SELECT t.source_store,d.transfer_id||':'||d.item_id,'discrepancy',NULL FROM transfer_discrepancies d JOIN transfers t ON t.id=d.transfer_id WHERE NOT EXISTS(SELECT 1 FROM transfer_resolutions r WHERE r.transfer_id=d.transfer_id AND r.item_id=d.item_id) AND NOT EXISTS(SELECT 1 FROM transfer_cancellations x WHERE x.transfer_id=d.transfer_id)
        UNION ALL SELECT s.store_id store,c.id,'sav' kind,NULL countId FROM service_cases c JOIN sales s ON s.id=c.sale_id WHERE NOT EXISTS(SELECT 1 FROM sav_outcomes o WHERE o.case_id=c.id) AND NOT EXISTS(SELECT 1 FROM sav_exchanges e WHERE e.case_id=c.id)`;
      // D1 limits compound SELECT terms; each queue is a separate bounded query.
      const waiting = (
        await Promise.all(
          waitingSql.split("UNION ALL").map((sql) => {
            const normalized = sql
              .replace("SELECT t.source_store,t.id,", "SELECT t.source_store store,t.id id,")
              .replace("'approval',NULL", "'approval' kind,NULL countId")
              .replace("'dispatch',NULL", "'dispatch' kind,NULL countId")
              .replace(
                "SELECT a.store_id,a.id,'adjustment',a.count_id",
                "SELECT a.store_id store,a.id id,'adjustment' kind,a.count_id countId",
              )
              .replace(
                "SELECT t.source_store,d.transfer_id||':'||d.item_id,'discrepancy',NULL",
                "SELECT t.source_store store,d.transfer_id||':'||d.item_id id,'discrepancy' kind,NULL countId",
              );
            return db.read({ sql: normalized, params: [] });
          }),
        )
      ).flat();
      // Recheck after all reads: demotion/revocation cannot return partial owner data.
      await authorize(identity, "M01", "owner.read");
      return ownerDashboardResult.parse({
        source: "SERVER",
        day,
        sales,
        drawers,
        lowStock,
        lateCredits,
        waiting,
      });
    },
    async dailyResources(credential: string, input: unknown) {
      const q = nativeDailyQuery.parse(input);
      const identity = await authenticate(credential);
      await authorize(identity, q.store);
      const auth = [identity.userId, identity.sessionId ?? null, clock(), q.store];
      const catalog = await db.read({
        sql: `SELECT c.id,c.kind,c.sku,c.name,COALESCE(json_extract(c.attributes_json,'$.barcode'),c.sku) barcode,json_extract(c.attributes_json,'$.variant') variant,p.amount_minor amountMinor,json_extract(c.attributes_json,'$.ean') ean,json_extract(c.attributes_json,'$.brand') brand,json_extract(c.attributes_json,'$.model') model,json_extract(c.attributes_json,'$.condition') condition,json_extract(c.attributes_json,'$.category') category,json_extract(c.attributes_json,'$.lowStockThreshold') lowStockThreshold,json_extract(c.attributes_json,'$.photoPending') photoPending FROM catalog c LEFT JOIN prices p ON p.item_id=c.id AND p.store_id=? WHERE ${scopedGate} ORDER BY c.name,c.id LIMIT 1000`,
        params: [q.store, ...auth],
      });
      const drawers = await db.read({
        sql: `SELECT id FROM drawers WHERE store_id=? AND ${scopedGate} ORDER BY id`,
        params: [q.store, ...auth],
      });
      // Recheck after multi-query projection: revoked access is never an empty success.
      await authorize(identity, q.store);
      // Optional intake attributes are omitted when absent (cost is never selected).
      const compact = catalog.map((row) =>
        Object.fromEntries(
          Object.entries(row)
            .filter(([k, v]) => !(intakeAttributeKeys.includes(k) && v === null))
            .map(([k, v]) => [k, intakeAttributeKeys.includes(k) ? String(v) : v]),
        ),
      );
      return nativeDailyResources.parse({
        source: "SERVER",
        store: q.store,
        catalog: compact,
        drawers,
      });
    },
    /** Owner settings: SUPER_ADMIN reads every stored key; staff only allow-listed non-sensitive keys. */
    async settings(credential: string, input: unknown) {
      const q = nativeDailyQuery.parse(input);
      const identity = await authenticate(credential);
      const memberships = await authorize(identity, q.store);
      const owner = memberships.some((r) => r["role"] === "SUPER_ADMIN");
      const rows = await db.read({ sql: "SELECT key,value_json FROM app_settings", params: [] });
      const stored: Record<string, unknown> = {};
      for (const r of rows) {
        const k = String(r["key"]);
        if (!owner && !(staffReadableSettings as readonly string[]).includes(k)) continue;
        stored[k] = JSON.parse(String(r["value_json"])) as unknown;
      }
      const resolved = resolveSettings(stored);
      return {
        store: q.store,
        settings: owner
          ? resolved
          : Object.fromEntries(
              Object.entries(resolved).filter(([k]) =>
                (staffReadableSettings as readonly string[]).includes(k),
              ),
            ),
      };
    },
    async posSearch(credential: string, input: unknown) {
      const q = nativePosSearchQuery.parse(input);
      const identity = await authenticate(credential);
      await authorize(identity, q.store);
      const search = `%${q.search.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
      const gate = `EXISTS(SELECT 1 FROM accounts a JOIN sessions s ON s.user_id=a.id JOIN memberships m ON m.user_id=a.id WHERE a.id=? AND a.active=1 AND s.id=? AND s.revoked=0 AND s.expires_at>? AND ${membershipSql("operational.read", "m")})`;
      const rows = await db.read({
        sql: `SELECT * FROM (
    SELECT ph.id,'phone' kind,ph.store_id store,c.name,ph.barcode,1 quantity,p.amount_minor amountMinor,(SELECT identifier FROM phone_identifiers WHERE phone_id=ph.id AND slot=1) imei1,(SELECT identifier FROM phone_identifiers WHERE phone_id=ph.id AND slot=2) imei2,ph.serial,NULL variant,c.sku,json_extract(c.attributes_json,'$.brand') brand,COALESCE(json_extract(c.attributes_json,'$.model'),c.name) model,COALESCE(json_extract(ph.attributes_json,'$.condition'),json_extract(c.attributes_json,'$.condition')) condition FROM phones ph JOIN catalog c ON c.id=ph.catalog_id LEFT JOIN prices p ON p.item_id=ph.catalog_id AND p.store_id=ph.store_id WHERE ph.store_id=? AND ph.state='AVAILABLE'
    UNION ALL
    SELECT c.id,'accessory',b.store_id,c.name,COALESCE(json_extract(c.attributes_json,'$.barcode'),c.sku),b.quantity,p.amount_minor,NULL,NULL,NULL,json_extract(c.attributes_json,'$.variant'),c.sku,NULL,NULL,NULL FROM accessory_balances b JOIN catalog c ON c.id=b.item_id AND c.kind='accessory' LEFT JOIN prices p ON p.item_id=c.id AND p.store_id=b.store_id WHERE b.store_id=? AND b.quantity>0
   ) scoped WHERE (name LIKE ? ESCAPE '\\' OR barcode LIKE ? ESCAPE '\\' OR imei1 LIKE ? ESCAPE '\\' OR imei2 LIKE ? ESCAPE '\\' OR serial LIKE ? ESCAPE '\\' OR sku LIKE ? ESCAPE '\\') AND ${gate} ORDER BY kind,id LIMIT ?`,
        params: [
          q.store,
          q.store,
          ...Array.from({ length: 6 }, () => search),
          identity.userId,
          identity.sessionId ?? null,
          clock(),
          q.store,
          q.limit,
        ],
      });
      return nativePosSearchResult.parse({
        source: "SERVER",
        store: q.store,
        items: rows.map(({ sku, ...row }) => row),
      });
    },
    async customerSearch(credential: string, input: unknown) {
      const q = nativeCustomerSearchQuery.parse(input);
      const identity = await authenticate(credential);
      await authorize(identity, q.store);
      const search = `%${q.search.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
      const key = normalizedBuyer(q.search);
      const rows = await db.read({
        sql: `SELECT * FROM (
    SELECT c.id,c.name,c.reference,d.surname,d.given_name givenName,d.contact,c.store_id FROM customers c LEFT JOIN customer_details d ON d.customer_id=c.id WHERE c.store_id=?
   ) scoped WHERE (?='' OR name LIKE ? ESCAPE '\\' OR reference LIKE ? ESCAPE '\\' OR (SELECT name_key FROM customer_details WHERE customer_id=scoped.id)=? OR (SELECT contact_key FROM customer_details WHERE customer_id=scoped.id)=?) AND ${scopedGate} ORDER BY name,id LIMIT ?`,
        params: [
          q.store,
          q.search,
          search,
          search,
          key,
          key,
          identity.userId,
          identity.sessionId ?? null,
          clock(),
          q.store,
          q.limit,
        ],
      });
      return nativeCustomerSearchResult.parse({
        source: "SERVER",
        store: q.store,
        customers: rows.map(({ store_id, ...row }) => row),
      });
    },
    async customerHistory(credential: string, input: unknown) {
      const q = nativeCustomerHistoryQuery.parse(input);
      const identity = await authenticate(credential);
      await authorize(identity, q.store);
      const found = await db.read({
        sql: `SELECT c.id,c.name,c.reference,d.surname,d.given_name givenName,d.contact FROM customers c LEFT JOIN customer_details d ON d.customer_id=c.id WHERE c.id=? AND c.store_id=? AND ${scopedGate}`,
        params: [
          q.customerId,
          q.store,
          identity.userId,
          identity.sessionId ?? null,
          clock(),
          q.store,
        ],
      });
      if (!found[0]) throw new Error("NOT_FOUND");
      const sales = await db.read({
        sql: `SELECT s.id,r.sold_at soldAt,s.seller_id sellerId,s.customer_id customerId,c.name customerName,s.total_minor totalMinor,CASE WHEN EXISTS(SELECT 1 FROM sale_settlements p WHERE p.sale_id=s.id AND p.cash_minor>0 AND p.bank_minor>0) THEN 'Split' ELSE s.tender END tender,EXISTS(SELECT 1 FROM sale_voids v WHERE v.sale_id=s.id) voided FROM sales s JOIN receipt_snapshots r ON r.sale_id=s.id LEFT JOIN customers c ON c.id=s.customer_id WHERE s.customer_id=? AND s.store_id=? AND ${scopedGate} ORDER BY r.sold_at DESC,s.id LIMIT ?`,
        params: [
          q.customerId,
          q.store,
          identity.userId,
          identity.sessionId ?? null,
          clock(),
          q.store,
          q.limit,
        ],
      });
      return nativeCustomerHistoryResult.parse({
        source: "SERVER",
        store: q.store,
        customer: found[0],
        sales: await withLines(sales),
      });
    },
    async salesHistory(credential: string, input: unknown) {
      const q = nativeSalesHistoryQuery.parse(input);
      const identity = await authenticate(credential);
      await authorize(identity, q.store);
      const fromMs = q.from ? Date.parse(`${q.from}T00:00:00+01:00`) : null;
      const toMs = q.to ? Date.parse(`${q.to}T00:00:00+01:00`) + 86400000 : null;
      const rows = await db.read({
        sql: `SELECT s.id,r.sold_at soldAt,s.seller_id sellerId,s.customer_id customerId,c.name customerName,s.total_minor totalMinor,CASE WHEN EXISTS(SELECT 1 FROM sale_settlements p WHERE p.sale_id=s.id AND p.cash_minor>0 AND p.bank_minor>0) THEN 'Split' ELSE s.tender END tender,EXISTS(SELECT 1 FROM sale_voids v WHERE v.sale_id=s.id) voided FROM sales s JOIN receipt_snapshots r ON r.sale_id=s.id LEFT JOIN customers c ON c.id=s.customer_id WHERE s.store_id=? AND (? IS NULL OR r.sold_at>=?) AND (? IS NULL OR r.sold_at<?) AND (? IS NULL OR s.customer_id=?) AND (? IS NULL OR s.seller_id=?) AND (? IS NULL OR CASE WHEN EXISTS(SELECT 1 FROM sale_settlements p WHERE p.sale_id=s.id AND p.cash_minor>0 AND p.bank_minor>0) THEN 'Split' ELSE s.tender END=?) AND (? IS NULL OR EXISTS(SELECT 1 FROM sale_lines l JOIN phone_identifiers pi ON pi.phone_id=l.item_id WHERE l.sale_id=s.id AND l.kind='phone' AND pi.identifier=?)) AND ${scopedGate} ORDER BY r.sold_at DESC,s.id LIMIT ? OFFSET ?`,
        params: [
          q.store,
          fromMs,
          fromMs,
          toMs,
          toMs,
          q.customerId ?? null,
          q.customerId ?? null,
          q.sellerId ?? null,
          q.sellerId ?? null,
          q.tender ?? null,
          q.tender ?? null,
          q.imei ?? null,
          q.imei ?? null,
          identity.userId,
          identity.sessionId ?? null,
          clock(),
          q.store,
          q.limit + 1,
          q.offset,
        ],
      });
      const page = rows.slice(0, q.limit);
      return nativeSalesHistoryResult.parse({
        source: "SERVER",
        store: q.store,
        sales: await withLines(page),
        hasMore: rows.length > q.limit,
      });
    },
    async cashLedger(credential: string, input: unknown) {
      const q = nativeCashLedgerQuery.parse(input);
      const identity = await authenticate(credential);
      await authorize(identity, q.store);
      const authParams = [identity.userId, identity.sessionId ?? null, clock(), q.store];
      const shifts = await db.read({
        sql: `SELECT s.id,s.seller_id sellerId,s.state,s.opening_minor openingMinor,s.counted_minor countedMinor,sc.closed_at closedAt,sc.expected_minor expectedMinor,sc.review_state reviewState,sr.outcome reviewOutcome FROM shifts s LEFT JOIN shift_closures sc ON sc.shift_id=s.id LEFT JOIN shift_reviews sr ON sr.shift_id=s.id WHERE s.store_id=? AND ${scopedGate} ORDER BY s.id LIMIT ? OFFSET ?`,
        params: [q.store, ...authParams, q.limit, q.offset],
      });
      // True blind count (owner decision 2026-11-09): only SUPER_ADMIN sees OPEN-shift movements.
      const owner = (
        await db.read({
          sql: "SELECT 1 FROM memberships WHERE user_id=? AND role='SUPER_ADMIN' AND store_id='GLOBAL'",
          params: [identity.userId],
        })
      ).length;
      const movements = await db.read({
        sql: `SELECT m.id,m.shift_id shiftId,m.seller_id sellerId,m.amount_minor amountMinor,m.reason FROM effective_cash_movements m JOIN shifts s ON s.id=m.shift_id WHERE s.store_id=? AND ${owner ? "1=1" : "s.state<>'OPEN' AND m.reason NOT IN('Paiement fournisseur','USED_PURCHASE')"} AND ${scopedGate} ORDER BY m.id LIMIT 500`,
        params: [q.store, ...authParams],
      });
      return nativeCashLedgerResult.parse({
        source: "SERVER",
        store: q.store,
        shifts,
        movements,
      });
    },
    // Transfer detail: lines, dual approvals, dispatch/receipt evidence. Either
    // endpoint store may read; cost-free; final gate denies revoked sessions.
    async transferDetail(credential: string, input: unknown) {
      const q = nativeTransferDetailQuery.parse(input);
      const identity = await authenticate(credential);
      await authorize(identity, q.store);
      const authParams = [identity.userId, identity.sessionId ?? null, clock(), q.store];
      const found = await db.read({
        sql: `SELECT id,source_store sourceStore,destination_store destinationStore,stage FROM transfers WHERE id=? AND (source_store=? OR destination_store=?) AND ${scopedGate}`,
        params: [q.transferId, q.store, q.store, ...authParams],
      });
      if (!found[0]) throw new Error("NOT_FOUND");
      const lines = await db.read({
        sql: `SELECT item_id itemId,kind,quantity,code FROM transfer_lines WHERE transfer_id=? ORDER BY item_id`,
        params: [q.transferId],
      });
      const approvals = await db.read({
        sql: `SELECT approval,actor_id actorId FROM transfer_approvals WHERE transfer_id=? ORDER BY approval`,
        params: [q.transferId],
      });
      const dispatch = await db.read({
        sql: `SELECT actor_id actorId,evidence,carrier FROM transfer_dispatches WHERE transfer_id=?`,
        params: [q.transferId],
      });
      const receipt = await db.read({
        sql: `SELECT actor_id actorId,evidence FROM transfer_receipts WHERE transfer_id=?`,
        params: [q.transferId],
      });
      const discrepancies = await db.read({
        sql: "SELECT d.item_id itemId,d.quantity,d.kind,r.outcome FROM transfer_discrepancies d LEFT JOIN transfer_resolutions r USING(transfer_id,item_id) WHERE d.transfer_id=?",
        params: [q.transferId],
      });
      const cancellation = await db.read({
        sql: "SELECT actor_id actorId,reason FROM transfer_cancellations WHERE transfer_id=?",
        params: [q.transferId],
      });
      await authorize(identity, q.store);
      return nativeTransferDetailResult.parse({
        source: "SERVER",
        store: q.store,
        transfer: found[0],
        lines,
        approvals,
        discrepancies,
        dispatch: dispatch[0] ?? null,
        receipt: receipt[0] ?? null,
        cancellation: cancellation[0] ?? null,
      });
    },
    // SAV cases with append-only events, scoped to the sale's store.
    async savCases(credential: string, input: unknown) {
      const q = nativeSavQuery.parse(input);
      const identity = await authenticate(credential);
      await authorize(identity, q.store);
      const search = q.search ? `%${q.search.replace(/[%_\\]/g, (c) => `\\${c}`)}%` : null;
      const cases = await db.read({
        sql: `SELECT c.id,c.sale_id saleId,c.phone_id phoneId,c.customer_id customerId,cu.name customerName,c.state,c.issue,r.sold_at soldAt,(SELECT json_group_array(json_object('status',status,'note',note,'paidRepairNeeded',paid_repair_needed)) FROM sav_tracking WHERE case_id=c.id) trackingJson,(SELECT outcome FROM sav_outcomes WHERE case_id=c.id) outcome,s.public_ref publicRef,(SELECT provider FROM warranty_requests WHERE sale_id=c.sale_id AND phone_id=c.phone_id) warrantyProvider,(SELECT identifier FROM phone_identifiers WHERE phone_id=c.phone_id AND slot=1) imei1 FROM service_cases c JOIN sales s ON s.id=c.sale_id LEFT JOIN customers cu ON cu.id=c.customer_id LEFT JOIN receipt_snapshots r ON r.sale_id=s.id WHERE s.store_id=? AND (? IS NULL OR COALESCE(s.public_ref,c.id) LIKE ? ESCAPE '\\' OR cu.name LIKE ? ESCAPE '\\' OR EXISTS(SELECT 1 FROM phone_identifiers pi WHERE pi.phone_id=c.phone_id AND pi.identifier LIKE ? ESCAPE '\\')) AND ${scopedGate} ORDER BY c.id LIMIT ? OFFSET ?`,
        params: [
          q.store,
          search,
          search,
          search,
          search,
          identity.userId,
          identity.sessionId ?? null,
          clock(),
          q.store,
          q.limit,
          q.offset,
        ],
      });
      const ids = cases.map((c) => String(c["id"]));
      const events = ids.length
        ? await db.read({
            sql: `SELECT id,case_id caseId,actor_id actorId,note FROM service_events WHERE case_id IN(${ids.map(() => "?").join(",")}) ORDER BY id`,
            params: ids,
          })
        : [];
      return nativeSavResult.parse({
        source: "SERVER",
        store: q.store,
        cases: cases.map((c) => ({
          ...Object.fromEntries(Object.entries(c).filter(([k]) => k !== "trackingJson")),
          tracking: JSON.parse(String(c["trackingJson"] ?? "[]")) as unknown,
          daysSinceSale: c["soldAt"] === null ? null : daysSinceSale(Number(c["soldAt"]), clock()),
          events: events.filter((e) => e["caseId"] === c["id"]).map(({ caseId, ...e }) => e),
        })),
      });
    },
    // Debts with repayment drafts; recorded vs draft amounts stay separate.
    async debtList(credential: string, input: unknown) {
      const q = nativeDebtsQuery.parse(input);
      const identity = await authenticate(credential);
      await authorize(identity, q.store);
      const debts = await db.read({
        sql: `SELECT d.id,d.customer_id customerId,cu.name customerName,d.sale_id saleId,d.amount_minor amountMinor,d.state,d.balance_minor balanceMinor,d.due_date dueDate FROM (SELECT sale_id id,customer_id,sale_id,amount_minor,state,balance_minor,due_date FROM credit_balances UNION ALL SELECT id,customer_id,sale_id,amount_minor,state,amount_minor,NULL FROM debts) d JOIN customers cu ON cu.id=d.customer_id WHERE cu.store_id=? AND ${scopedGate} ORDER BY d.id LIMIT ? OFFSET ?`,
        params: [
          q.store,
          identity.userId,
          identity.sessionId ?? null,
          clock(),
          q.store,
          q.limit,
          q.offset,
        ],
      });
      const ids = debts.map((d) => String(d["id"]));
      const repayments = ids.length
        ? await db.read({
            sql: `SELECT id,sale_id debtId,amount_minor amountMinor,command_key reference,CASE WHEN EXISTS(SELECT 1 FROM credit_repayment_reversals x WHERE x.repayment_id=r.id) THEN 'REVERSED' ELSE 'RECORDED' END state FROM credit_repayments r WHERE sale_id IN(${ids.map(() => "?").join(",")}) UNION ALL SELECT id,debt_id,amount_minor,reference,state FROM repayments WHERE debt_id IN(${ids.map(() => "?").join(",")}) ORDER BY id`,
            params: [...ids, ...ids],
          })
        : [];
      return nativeDebtsResult.parse({
        source: "SERVER",
        store: q.store,
        debts: debts.map((d) => ({
          ...d,
          repayments: repayments
            .filter((r) => r["debtId"] === d["id"])
            .map(({ debtId, ...r }) => r),
        })),
      });
    },
    // M01-only salary-deduction facility: installments + UNVERIFIED bank evidence.
    async facilityList(credential: string, input: unknown) {
      const q = nativeFacilityQuery.parse(input);
      const identity = await authenticate(credential);
      await authorize(identity, "M01");
      const facilities = await db.read({
        sql: `SELECT f.id,f.customer_id customerId,cu.name customerName,f.employer,f.cash_price_minor cashPriceMinor,f.contract_price_minor contractPriceMinor,f.state FROM facilities f LEFT JOIN customers cu ON cu.id=f.customer_id WHERE f.store_id='M01' AND ${scopedGate} ORDER BY f.id LIMIT ? OFFSET ?`,
        params: [identity.userId, identity.sessionId ?? null, clock(), "M01", q.limit, q.offset],
      });
      const ids = facilities.map((f) => String(f["id"]));
      const installments = ids.length
        ? await db.read({
            sql: `SELECT facility_id facilityId,month,amount_minor amountMinor FROM installments WHERE facility_id IN(${ids.map(() => "?").join(",")}) ORDER BY month`,
            params: ids,
          })
        : [];
      const evidence = ids.length
        ? await db.read({
            sql: `SELECT id,facility_id facilityId,kind,amount_minor amountMinor,state FROM facility_evidence WHERE facility_id IN(${ids.map(() => "?").join(",")}) ORDER BY id`,
            params: ids,
          })
        : [];
      return nativeFacilityResult.parse({
        source: "SERVER",
        store: "M01",
        facilities: facilities.map((f) => ({
          ...f,
          installments: installments
            .filter((i) => i["facilityId"] === f["id"])
            .map(({ facilityId, ...i }) => i),
          evidence: evidence
            .filter((e) => e["facilityId"] === f["id"])
            .map(({ facilityId, ...e }) => e),
        })),
      });
    },
    // Expense drafts: owner/manager only, never sellers (matches generic read).
    async expenseList(credential: string, input: unknown) {
      const q = nativeExpensesQuery.parse(input);
      const identity = await authenticate(credential);
      await authorize(identity, q.store, "expenses.read");
      const rows = await db.read({
        sql: `SELECT id,amount_minor amountMinor,evidence_key evidenceKey,state FROM expenses WHERE store_id=? AND ${scopedGate.replace(membershipSql("operational.read", "m"), membershipSql("expenses.read", "m"))} ORDER BY id LIMIT ? OFFSET ?`,
        params: [
          q.store,
          identity.userId,
          identity.sessionId ?? null,
          clock(),
          q.store,
          q.limit,
          q.offset,
        ],
      });
      return nativeExpensesResult.parse({ source: "SERVER", store: q.store, expenses: rows });
    },
    async supplierLookup(credential: string, scope: unknown) {
      const store = scopeSchema.parse(scope);
      const identity = await authenticate(credential);
      await authorize(identity, store);
      return db.read({
        sql: `SELECT id,name FROM suppliers WHERE store_id=? AND EXISTS(SELECT 1 FROM accounts a JOIN memberships m ON m.user_id=a.id JOIN sessions s ON s.user_id=a.id WHERE a.id=? AND a.active=1 AND s.id=? AND s.revoked=0 AND s.expires_at>? AND${membershipSql("operational.read", "m")}) ORDER BY name,id LIMIT 200`,
        params: [store, identity.userId, identity.sessionId ?? null, clock(), store],
      });
    },
    async receive(credential: string, input: unknown) {
      if (db.capabilities?.atomicBatch !== true) throw new Error("ATOMICITY_UNAVAILABLE");
      const identity = await writeIdentity(credential);
      const v = validatedPlan(() => nativeReceiving.parse(input));
      await authorizeWrite(identity, v.store);
      const bytes = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(canonicalJson(v)),
      );
      const hash = Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join(
        "",
      );
      const plan = validatedPlan(() =>
        planStandaloneReceiving(v, identity, hash, crypto.randomUUID(), clock()),
      );
      try {
        const results = await db.batch(plan);
        const response = results.at(-1)?.rows[0]?.["response_json"];
        if (typeof response !== "string") throw new Error("OUTCOME_UNKNOWN");
        return JSON.parse(response) as unknown;
      } catch (cause) {
        return diagnoseWrite(
          db,
          identity,
          v.key,
          hash,
          "stock.standalone",
          v,
          clock(),
          false,
          cause,
        );
      }
    },
    async receipt(credential: string, id: unknown, scope: unknown) {
      const store = scopeSchema.parse(scope);
      const raw = z.string().min(1).max(80).parse(id);
      // A scanned/typed public reference (any case, check character may be "*") is normalized.
      const saleId = publicReferenceFormat.test(normalizePublicReference(raw))
        ? normalizePublicReference(raw)
        : raw;
      const identity = await authenticate(credential);
      await authorize(identity, store);
      const rows = await db.read({
        sql: `SELECT r.snapshot_json FROM receipt_snapshots r JOIN sales sale ON sale.id=r.sale_id WHERE (sale.id=? OR sale.public_ref=?) AND sale.store_id=? AND EXISTS(SELECT 1 FROM accounts a JOIN memberships m ON m.user_id=a.id JOIN sessions s ON s.user_id=a.id WHERE a.id=? AND a.active=1 AND s.id=? AND s.revoked=0 AND s.expires_at>? AND${membershipSql("operational.read", "m")})`,
        params: [
          saleId,
          saleId,
          store,
          identity.userId,
          identity.sessionId ?? null,
          clock(),
          store,
        ],
      });
      if (!rows[0]) throw new Error("NOT_FOUND");
      return JSON.parse(String(rows[0]["snapshot_json"])) as unknown;
    },
    supplierHistory: (credential: string, input: unknown) =>
      createSupplierProvenanceService(db, verifier, clock).history(credential, input),
    supplierSources: (credential: string, scope: unknown) =>
      createSupplierProvenanceService(db, verifier, clock).read(
        credential,
        scopeSchema.parse(scope),
      ),
    correctSupplier: (credential: string, input: unknown) =>
      createSupplierProvenanceService(db, verifier, clock).correct(credential, input),
    correctStandaloneSupplier: (credential: string, input: unknown) =>
      createSupplierProvenanceService(db, verifier, clock).correctStandalone(credential, input),
    async stockCount(credential: string, storeInput: unknown, countId: string) {
      const store = scopeSchema.parse(storeInput),
        identity = await authenticate(credential);
      await authorize(identity, store);
      const sessions = await db.read({
        sql: `SELECT id,month,state FROM stock_counts WHERE id=? AND store_id=? AND ${scopedGate}`,
        params: [countId, store, identity.userId, identity.sessionId ?? null, clock(), store],
      });
      if (!sessions[0]) throw new Error("NOT_FOUND");
      const owner = (await authorize(identity, store)).some((m) => m["role"] === "SUPER_ADMIN");
      const submitted = sessions[0]["state"] === "SUBMITTED";
      const rows = await db.read({
        sql: submitted
          ? `SELECT e.item_id,e.kind,e.quantity expected,COALESCE(c.quantity,0) counted,COALESCE(c.quantity,0)-e.quantity difference,(SELECT identifier FROM phone_identifiers WHERE phone_id=e.item_id AND slot=1) imei FROM count_expected e LEFT JOIN count_entries c USING(count_id,item_id,kind) WHERE e.count_id=? AND (e.kind='accessory' OR ?=1)`
          : `SELECT item_id,kind,quantity counted FROM count_entries WHERE count_id=?`,
        params: submitted ? [countId, owner ? 1 : 0] : [countId],
      });
      await authorize(identity, store);
      const adjustments = await db.read({
        sql: `SELECT a.id,a.item_id,a.delta,a.reason,COALESCE(r.outcome,'PENDING') outcome FROM stock_adjustments a LEFT JOIN stock_adjustment_reviews r ON r.adjustment_id=a.id WHERE a.store_id=? AND ${scopedGate}`,
        params: [store, identity.userId, identity.sessionId ?? null, clock(), store],
      });
      await authorize(identity, store);
      return { session: sessions[0], rows, adjustments };
    },
    async individualPurchases(credential: string, storeInput: unknown) {
      const store = scopeSchema.parse(storeInput),
        identity = await authenticate(credential);
      const memberships = await authorize(identity, store, "identity.read");
      const owner = memberships.some((m) => m["role"] === "SUPER_ADMIN");
      const rows = await db.read({
        sql: `SELECT phone_id,store_id,surname,given_name,phone,photo_pending${owner ? ",amount_minor" : ""} FROM individual_purchases WHERE store_id=?`,
        params: [store],
      });
      await authorize(identity, store, "identity.read");
      return rows;
    },
    async salesReport(credential: string, input: unknown) {
      const q = z
        .object({
          store: scopeSchema,
          from: z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/)
            .optional(),
          to: z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/)
            .optional(),
        })
        .strict()
        .parse(input);
      const identity = await authenticate(credential);
      await authorize(identity, q.store);
      const rows = await db.read({
        sql: `SELECT s.store_id store,r.sold_at at,s.total_minor total,EXISTS(SELECT 1 FROM sale_voids v WHERE v.sale_id=s.id) voided FROM sales s JOIN receipt_snapshots r ON r.sale_id=s.id WHERE s.store_id=? AND ${scopedGate}`,
        params: [q.store, identity.userId, identity.sessionId ?? null, clock(), q.store],
      });
      await authorize(identity, q.store);
      return salesByDay(
        rows.map((r) => ({
          store: q.store,
          at: Number(r["at"]),
          total: decimalValue(BigInt(String(r["total"]))),
          voided: r["voided"] === 1,
        })),
        q.store,
        q.from ?? "",
        q.to ?? "",
      );
    },
    async zakatSheet(credential: string, storeInput: unknown) {
      const store = scopeSchema.parse(storeInput),
        identity = await authenticate(credential);
      await authorize(identity, store, "owner.read");
      const phones = await db.read({
        sql: `SELECT p.id,COALESCE((SELECT amount_minor FROM individual_purchases WHERE phone_id=p.id),(SELECT amount_minor FROM supplier_costs WHERE phone_id=p.id),(SELECT f.cost_minor FROM receipt_sources r JOIN receiving rec ON rec.id=r.receiving_id JOIN confidential_purchase_finance f ON f.purchase_id=rec.purchase_id WHERE r.phone_id=p.id)) cost FROM phones p WHERE p.state='AVAILABLE'`,
        params: [],
      });
      // Never infer lot consumption or divide costs without an approved costing policy.
      const lots = await db.read({
        sql: `SELECT b.item_id,b.quantity,(SELECT sum(c.amount_minor) FROM supplier_costs c JOIN standalone_receipts r ON r.id=c.source_id WHERE r.item_id=b.item_id AND r.store_id=b.store_id AND c.phone_id IS NULL AND r.quantity=b.quantity AND NOT EXISTS(SELECT 1 FROM stock_movements m WHERE m.item_id=b.item_id AND m.store_id=b.store_id AND m.delta<0)) cost FROM accessory_balances b WHERE b.quantity>0`,
        params: [],
      });
      const cash = await db.read({
        sql: `SELECT COALESCE(sum(opening_minor),0)+(SELECT COALESCE(sum(amount_minor),0) FROM effective_cash_movements) total FROM shifts`,
        params: [],
      });
      const credit = await db.read({
        sql: `SELECT COALESCE(sum(balance_minor),0) total FROM credit_balances`,
        params: [],
      });
      const payable = await db.read({
        sql: `SELECT COALESCE(sum(balance_minor),0) total FROM supplier_payables`,
        params: [],
      });
      await authorize(identity, store, "owner.read");
      const inventory = [...phones, ...lots];
      const known = inventory.filter((r) => r["cost"] !== null);
      return {
        ...zakatTotals(
          known.reduce((n, r) => n + BigInt(String(r["cost"])), 0n),
          BigInt(String(cash[0]?.["total"] ?? 0)),
          BigInt(String(credit[0]?.["total"] ?? 0)),
          BigInt(String(payable[0]?.["total"] ?? 0)),
        ),
        known: known.length,
        total: inventory.length,
        missing: inventory.length - known.length,
      };
    },
    async supplierPayables(credential: string, storeInput: unknown) {
      const store = scopeSchema.parse(storeInput),
        identity = await authenticate(credential);
      await authorize(identity, store, "owner.read");
      const rows = await db.read({
        sql: `SELECT p.*,s.name FROM supplier_payables p JOIN suppliers s ON s.id=p.supplier_id WHERE EXISTS(SELECT 1 FROM accounts a JOIN sessions ss ON ss.user_id=a.id JOIN memberships m ON m.user_id=a.id WHERE a.id=? AND a.active=1 AND ss.id=? AND ss.revoked=0 AND ss.expires_at>? AND m.role='SUPER_ADMIN' AND m.store_id='GLOBAL')`,
        params: [identity.userId, identity.sessionId ?? null, clock()],
      });
      return rows;
    },
    async read(credential: string, module: NativeModule, scope: unknown, pageInput: unknown = {}) {
      const store = scopeSchema.parse(scope);
      const page = pageSchema.parse(pageInput);
      const identity = await authenticate(credential);
      if (!nativeModules.includes(module)) throw new Error("UNKNOWN_MODULE");
      const memberships = await authorize(identity, store, readOperation(module));
      const ownerAudit = module === "audit" && memberships.some((r) => r["role"] === "SUPER_ADMIN");
      const allowedRoles = rolesForOperation(ownerAudit ? "owner.read" : readOperation(module));
      const gate = `EXISTS(SELECT 1 FROM accounts a JOIN memberships m ON m.user_id=a.id JOIN sessions s ON s.user_id=a.id WHERE a.id=? AND a.active=1 AND s.id=? AND s.revoked=0 AND s.expires_at>? AND m.role IN(${allowedRoles.map(() => "?").join(",")}) AND ${membershipSql(readOperation(module), "m")})`;
      const search = page.search ? `%${page.search.replace(/[%_\\]/g, (c) => `\\${c}`)}%` : null;
      const columns =
        module === "inventory"
          ? ["barcode", "imei1", "imei2", "serial", "name", "sku"]
          : module === "catalog"
            ? ["barcode", "sku", "name"]
            : module === "sav"
              ? ["id", "public_ref", "sale_id"]
              : [searchColumn[module]];
      const predicate = columns
        .map((column) => `CAST(scoped.${column} AS TEXT) LIKE ? ESCAPE '\\'`)
        .join(" OR ");
      // Staff never receive JSON details, including through generic export/UI
      // consumers. The final owner-only gate also protects demotion races.
      const projection = ownerAudit
        ? `SELECT id,command_key,actor_id,store_id,operation,at,payload_json,before_json FROM audit_events WHERE store_id=?`
        : reads[module];
      return db.read({
        sql: `SELECT * FROM (${projection}) scoped WHERE (? IS NULL OR ${predicate}) AND ${gate} ORDER BY 1 LIMIT ? OFFSET ?`,
        params: [
          ...(["transfers", "catalog"].includes(module) ? [store, store] : [store]),
          search,
          ...columns.map(() => search),
          identity.userId,
          identity.sessionId ?? null,
          clock(),
          ...allowedRoles,
          store,
          page.limit,
          page.offset,
        ],
      });
    },
    // Staged private document finalize: re-read stored bytes, recompute size,
    // SHA-256 and magic bytes, then atomically move PENDING -> AVAILABLE or
    // QUARANTINED with append-only verification evidence. Owner-only.
    async finalizeDocument(credential: string, id: string, storeInput: unknown) {
      if (db.capabilities?.atomicBatch !== true) throw new Error("ATOMICITY_UNAVAILABLE");
      const store = scopeSchema.parse(storeInput);
      const identity = await authenticate(credential);
      await authorize(identity, store, "owner.read");
      if (!/^[A-Za-z0-9-]{1,80}$/.test(id)) throw new Error("INVALID_DOCUMENT");
      const rows = await db.read({
        sql: `SELECT d.object_key,d.mime,i.size_bytes,i.sha256 FROM documents d JOIN document_integrity i ON i.document_id=d.id WHERE d.id=? AND d.store_id=? AND d.state='PENDING'`,
        params: [id, store],
      });
      const row = rows[0];
      if (!row || row["object_key"] !== `${store}/${id}`) throw new Error("NOT_FOUND");
      const object = await documents.get(String(row["object_key"]));
      const bytes = object ? new Uint8Array(object.bytes) : new Uint8Array();
      const sha = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), (b) =>
        b.toString(16).padStart(2, "0"),
      ).join("");
      const ok =
        !!object &&
        object.contentType === row["mime"] &&
        bytes.byteLength === row["size_bytes"] &&
        sha === row["sha256"] &&
        magicMatches(String(row["mime"]), bytes);
      const outcome = ok ? "AVAILABLE" : "QUARANTINED";
      const result = await db.batch([
        {
          sql: `INSERT INTO document_verifications SELECT ?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM documents WHERE id=? AND store_id=? AND state='PENDING')`,
          params: [
            crypto.randomUUID(),
            id,
            identity.userId,
            outcome,
            bytes.byteLength,
            sha,
            clock(),
            id,
            store,
          ],
        },
        {
          sql: `UPDATE documents SET state=? WHERE id=? AND store_id=? AND state='PENDING'`,
          params: [outcome, id, store],
        },
      ]);
      if (result[1]?.changes !== 1) throw new Error("STALE_DOCUMENT_STATE");
      return { id, state: outcome };
    },
    // Offline replay acceptance contract. Never posts a sale: a received replay is
    // classified and stored as POLICY_BLOCKED evidence until OD-18 is approved.
    async replayOffline(
      credential: string,
      deviceId: unknown,
      storeInput: unknown,
      input: unknown,
    ) {
      if (db.capabilities?.atomicBatch !== true) throw new Error("ATOMICITY_UNAVAILABLE");
      const identity = await authenticate(credential);
      const device = z
        .string()
        .regex(/^[A-Za-z0-9-]{1,80}$/)
        .parse(deviceId);
      const envelope = transactionEnvelope.parse(input);
      const store = scopeSchema.parse(storeInput);
      await authorize(identity, store);
      const devices = await db.read({
        sql: `SELECT revoked,expires_at,user_id,store_id FROM devices WHERE id=?`,
        params: [device],
      });
      const d = devices[0];
      if (!d || d["user_id"] !== identity.userId || d["store_id"] !== store)
        return { classification: "DEVICE_UNKNOWN", final: false } as const;
      if (d["revoked"] === 1) return { classification: "DEVICE_REVOKED", final: false } as const;
      if (Number(d["expires_at"]) <= clock())
        return { classification: "DEVICE_EXPIRED", final: false } as const;
      const digest = Array.from(
        new Uint8Array(
          await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonicalJson(envelope))),
        ),
        (b) => b.toString(16).padStart(2, "0"),
      ).join("");
      const key = envelope.idempotencyKey;
      if ((await db.read({ sql: `SELECT 1 FROM commands WHERE key=?`, params: [key] })).length)
        return { classification: "ALREADY_ONLINE", final: false } as const;
      await db.batch([
        {
          sql: `INSERT OR IGNORE INTO offline_replays VALUES(?,?,?,?,?,'POLICY_BLOCKED',?)`,
          params: [key, device, identity.userId, store, digest, clock()],
        },
      ]);
      const stored = (
        await db.read({
          sql: `SELECT actor_id,payload_hash,device_id FROM offline_replays WHERE key=?`,
          params: [key],
        })
      )[0];
      if (!stored) throw new Error(`OUTCOME_UNKNOWN:${key}`);
      if (
        stored["actor_id"] !== identity.userId ||
        stored["payload_hash"] !== digest ||
        stored["device_id"] !== device
      )
        return { classification: "CONFLICT", final: false } as const;
      return { classification: "POLICY_BLOCKED", final: false, key } as const;
    },
    async execute(credential: string, input: unknown) {
      if (db.capabilities?.atomicBatch !== true) throw new Error("ATOMICITY_UNAVAILABLE");
      const identity = await writeIdentity(credential);
      const envelope = validatedPlan(() => nativeEnvelope.parse(input));
      const payload = validatedPlan(() =>
        nativePayloads[envelope.operation].parse(envelope.payload),
      );
      // Explain definitive authorization denial before executing. The atomic
      // planner still independently rechecks membership/session for races.
      if (envelope.operation !== "transfer.approve")
        await authorizeWrite(identity, payload.store, envelope.operation);
      const hash = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(canonicalJson(envelope)),
      );
      const digest = Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, "0")).join(
        "",
      );
      const plan = validatedPlan(() =>
        planNativeCommand(envelope, identity, digest, crypto.randomUUID(), clock()),
      );
      try {
        const result = await db.batch(plan);
        const response = result.at(-1)?.rows[0]?.["response_json"];
        if (typeof response !== "string") throw new Error("OUTCOME_UNKNOWN");
        return JSON.parse(response) as unknown;
      } catch (cause) {
        return diagnoseWrite(
          db,
          identity,
          envelope.key,
          digest,
          envelope.operation,
          payload,
          clock(),
          false,
          cause,
        );
      }
    },
    // Verified session probe: signature/expiry via verifier, then active account,
    // unrevoked session and current memberships from SQL (never from the caller).
    async session(credential: string) {
      const identity = await authenticate(credential);
      const rows = await db.read({
        sql: `SELECT m.store_id,m.role FROM accounts a JOIN sessions s ON s.user_id=a.id JOIN memberships m ON m.user_id=a.id WHERE a.id=? AND a.active=1 AND s.id=? AND s.revoked=0 AND s.expires_at>? AND ${membershipSql("operational.read", "m").replace("store_id=?", "store_id IN('M01','M02')")}`,
        params: [identity.userId, identity.sessionId ?? null, clock()],
      });
      if (!rows.length) throw new Error("UNAUTHORIZED");
      return {
        memberships: rows.map((r) => ({ store: String(r["store_id"]), role: String(r["role"]) })),
      };
    },
    async outcome(credential: string, key: string) {
      const identity = await authenticate(credential);
      return db.read({
        sql: `SELECT c.response_json FROM commands c JOIN accounts a ON a.id=c.actor_id JOIN sessions s ON s.user_id=a.id WHERE c.key=? AND c.actor_id=? AND c.state='DONE' AND a.active=1 AND s.id=? AND s.revoked=0 AND s.expires_at>?`,
        params: [key, identity.userId, identity.sessionId ?? null, clock()],
      });
    },
    async checkout(credential: string, input: unknown) {
      if (db.capabilities?.atomicBatch !== true) throw new Error("ATOMICITY_UNAVAILABLE");
      const identity = await writeIdentity(credential);
      const envelope = validatedPlan(() => nativeCheckoutEnvelope.parse(input));
      const payload = envelope.payload;
      await authorizeWrite(identity, payload.store);
      const hash = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(canonicalJson({ ...envelope, payload })),
      );
      const digest = Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, "0")).join(
        "",
      );
      const plan = validatedPlan(() =>
        planRetailCheckout(
          { ...envelope, payload },
          identity,
          digest,
          crypto.randomUUID(),
          clock(),
        ),
      );
      // No splitting, retrying with a new key or client-side price authority.
      // SQL batch independently revalidates membership, stock, shift and prices.
      try {
        const result = await db.batch(plan);
        const response = result.at(-1)?.rows[0];
        if (!response) throw new Error("OUTCOME_UNKNOWN");
        return response;
      } catch (cause) {
        return diagnoseWrite(
          db,
          identity,
          envelope.idempotencyKey,
          digest,
          "pos.checkout",
          payload,
          clock(),
          true,
          cause,
        );
      }
    },
    async ownerFinance(credential: string, storeInput: unknown) {
      const store = scopeSchema.parse(storeInput);
      const identity = await authenticate(credential);
      await authorize(identity, store, "owner.read");
      return db.read({
        sql: `SELECT f.purchase_id,f.cost_minor,f.obligation_minor FROM confidential_purchase_finance f JOIN purchases p ON p.id=f.purchase_id WHERE p.store_id=? AND EXISTS(SELECT 1 FROM accounts a JOIN memberships m ON m.user_id=a.id JOIN sessions s ON s.user_id=a.id WHERE a.id=? AND a.active=1 AND ${membershipSql("owner.read", "m").replace("store_id=?", "store_id IS NULL")} AND s.id=? AND s.revoked=0 AND s.expires_at>?)`,
        params: [store, identity.userId, identity.sessionId ?? null, clock()],
      });
    },
    async document(credential: string, id: string, storeInput: unknown) {
      const store = scopeSchema.parse(storeInput);
      const identity = await authenticate(credential);
      await authorize(identity, store, "owner.read");
      // All asset content owner-only pending per-document finance classification.
      const rows = await db.read({
        sql: `SELECT object_key FROM documents WHERE id=? AND store_id=? AND state='AVAILABLE' AND EXISTS(SELECT 1 FROM accounts a JOIN memberships m ON m.user_id=a.id JOIN sessions s ON s.user_id=a.id WHERE a.id=? AND a.active=1 AND ${membershipSql("owner.read", "m").replace("store_id=?", "store_id IS NULL")} AND s.id=? AND s.revoked=0 AND s.expires_at>?)`,
        params: [id, store, identity.userId, identity.sessionId ?? null, clock()],
      });
      const key = rows[0]?.["object_key"];
      if (typeof key !== "string") throw new Error("NOT_FOUND");
      return documents.get(key);
    },
    async uploadDocument(
      credential: string,
      id: string,
      storeInput: unknown,
      bytes: ArrayBuffer,
      mime: string,
    ) {
      const store = scopeSchema.parse(storeInput);
      const identity = await authenticate(credential);
      await authorize(identity, store, "owner.read");
      if (
        !/^[A-Za-z0-9-]{1,80}$/.test(id) ||
        !["application/pdf", "image/jpeg", "image/png"].includes(mime) ||
        bytes.byteLength < 1 ||
        bytes.byteLength > 10485760
      )
        throw new Error("INVALID_DOCUMENT");
      const raw = new Uint8Array(bytes);
      const valid =
        mime === "application/pdf"
          ? new TextDecoder().decode(raw.slice(0, 5)) === "%PDF-"
          : mime === "image/jpeg"
            ? raw[0] === 255 && raw[1] === 216 && raw[2] === 255
            : raw[0] === 137 && raw[1] === 80 && raw[2] === 78 && raw[3] === 71;
      if (!valid) throw new Error("INVALID_DOCUMENT_CONTENT");
      const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), (b) =>
        b.toString(16).padStart(2, "0"),
      ).join("");
      const rows = await db.read({
        sql: `SELECT d.object_key FROM documents d JOIN document_integrity i ON i.document_id=d.id WHERE d.id=? AND d.store_id=? AND d.owner_id=? AND d.state='PENDING' AND d.mime=? AND i.size_bytes=? AND i.sha256=? AND EXISTS(SELECT 1 FROM sessions WHERE id=? AND user_id=? AND revoked=0 AND expires_at>?)`,
        params: [
          id,
          store,
          identity.userId,
          mime,
          bytes.byteLength,
          hash,
          identity.sessionId ?? null,
          identity.userId,
          clock(),
        ],
      });
      const objectKey = rows[0]?.["object_key"];
      if (objectKey !== `${store}/${id}`) throw new Error("FORBIDDEN");
      // External object write cannot join SQL transaction. Leave PENDING; never
      // expose bytes before a separately verified finalize operation exists.
      await documents.put(objectKey, bytes, mime);
      return { id, state: "PENDING", posted: false };
    },
    async policyBlocked(credential: string, scope: unknown, operation: string) {
      const store = scopeSchema.parse(scope);
      await authorize(await authenticate(credential), store);
      return { operation, state: "POLICY_UNCONFIGURED", posted: false } as const;
    },
  };
}
