import { z } from "zod";
import type { Role, Scope, Money, StoreId } from "../erp";
import { moneySchema } from "../operations";
import {
  storeSchema,
  positiveMoney,
  quantitySchema,
  dateSchema,
  required,
  optional,
} from "../business";

// DEMO ONLY — deprecated Review05 compatibility contracts — typed request/response shapes for the
// future trusted server boundary. These are CONTRACTS ONLY: no implementation
// executes real mutations, and nothing here authorizes postings.

export const contractVersion = "2026-11-review05" as const;

export const idempotencyKeySchema = z
  .string()
  .regex(
    /^[A-Za-z0-9][A-Za-z0-9-]{15,79}$/,
    "Idempotency key: 16–80 alphanumeric or hyphen characters",
  );
export type IdempotencyKey = z.infer<typeof idempotencyKeySchema>;

export interface ActorContext {
  userId: string;
  role: Role;
  storeScope: Scope;
}

export interface OperationRequest<T> {
  contractVersion: typeof contractVersion;
  idempotencyKey: IdempotencyKey;
  clientRequestId: string;
  actor: ActorContext;
  payload: T;
}

export interface ValidationIssue {
  path: string;
  message: string;
}

export type OperationResult<T> =
  | { ok: true; transactionId: string; idempotencyKey: IdempotencyKey; replayed: boolean; data: T }
  | { ok: false; kind: "VALIDATION"; issues: ValidationIssue[]; retrySafe: false }
  | { ok: false; kind: "AUTHORIZATION"; reason: string; retrySafe: false }
  | { ok: false; kind: "CONFLICT"; reason: string; retrySafe: boolean };

export const isRetryable = (result: OperationResult<unknown>): boolean =>
  !result.ok && result.kind === "CONFLICT" && result.retrySafe;

// --- Payload schemas per operational group ---

export const phoneIntakeRequest = z.object({
  store: storeSchema,
  model: required,
  imei1: z.string().regex(/^\d{15}$/, "15-digit IMEI1 required"),
  imei2: optional,
  serial: optional,
  barcode: required,
  condition: z.enum(["NEW", "USED"]),
  packaging: z.enum(["SEALED", "OPEN_BOX", "NO_BOX"]),
  salePrice: positiveMoney,
  documentReference: required,
});
export type PhoneIntakeRequest = z.infer<typeof phoneIntakeRequest>;

export const accessoryReceivingRequest = z.object({
  store: storeSchema,
  sku: required,
  barcode: required,
  quantity: quantitySchema,
  unitPrice: positiveMoney,
  documentReference: required,
  existingSku: optional,
});
export type AccessoryReceivingRequest = z.infer<typeof accessoryReceivingRequest>;

export const posCheckoutRequest = z.object({
  store: storeSchema,
  shiftId: required,
  sellerId: required,
  customerId: optional,
  lines: z
    .array(
      z.object({
        itemId: required,
        kind: z.enum(["phone", "accessory"]),
        quantity: quantitySchema,
        unitPrice: moneySchema,
      }),
    )
    .min(1),
  tender: z.enum(["Cash", "Bank"]),
  tenderedAmount: positiveMoney,
  bankReference: optional,
});
export type PosCheckoutRequest = z.infer<typeof posCheckoutRequest>;

export const cashShiftOpenRequest = z.object({
  store: storeSchema,
  drawerId: required,
  openingFloat: positiveMoney,
  operatorId: required,
});
export const cashMovementRequest = z.object({
  shiftId: required,
  direction: z.enum(["IN", "OUT"]),
  amount: positiveMoney,
  reason: required,
  documentReference: required,
});
export const cashBlindCloseRequest = z.object({
  shiftId: required,
  countedAmount: positiveMoney,
  notes: optional,
});

export const debtCreateRequest = z.object({
  customerId: required,
  store: storeSchema,
  saleReference: required,
  amount: positiveMoney,
  dueDate: dateSchema,
  authorizationReference: required,
});
export const repaymentRequest = z.object({
  debtId: required,
  amount: positiveMoney,
  date: dateSchema,
  method: z.enum(["Cash", "Bank"]),
  reference: required,
  authorizationReference: required,
});

export const supplierReceivingRequest = z.object({
  purchaseId: required,
  quantity: quantitySchema,
  imei1: optional,
  imei2: optional,
  serial: optional,
  barcode: required,
  documentReference: required,
});
export const supplierSettlementRequest = z.object({
  supplierId: required,
  obligationId: required,
  amount: positiveMoney,
  method: z.enum(["Cash", "Bank"]),
  reference: required,
  authorizationReference: required,
});

export const transferApproveRequest = z.object({
  transferId: required,
  approval: z.enum(["SUPER_ADMIN", "M02_MANAGER"]),
  decision: z.enum(["APPROVE", "REJECT"]),
  reason: optional,
});
export const transferDispatchRequest = z.object({
  transferId: required,
  dispatchedBy: required,
  documentReference: required,
});
export const transferReceiptScanRequest = z.object({
  transferId: required,
  scans: z.array(z.object({ code: required })).min(1),
  receivedBy: required,
  discrepancyNotes: optional,
});

export const facilityRemittanceRequest = z.object({
  facilityId: required,
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  amount: positiveMoney,
  bankReference: required,
  confirmedBy: required,
});

export const warrantyCaseRequest = z.object({
  customerId: required,
  store: storeSchema,
  saleReference: required,
  imei: required,
  issue: required,
  requestedAction: z.enum(["Inspection", "Repair", "Return", "Exchange", "Refund review"]),
  documentReference: required,
});
export const refundRequest = z.object({
  caseId: required,
  amount: positiveMoney,
  reference: required,
  authorizationReference: required,
  reason: required,
});

// --- Contract catalogue: invariants the future server must enforce ---

export interface OperationContract {
  name: string;
  request: string;
  invariants: string[];
  conflictPolicy: string;
  authorization: string;
}

export const operationContracts: OperationContract[] = [
  {
    name: "phone.intake",
    request: "PhoneIntakeRequest",
    invariants: [
      "IMEI1 globally unique",
      "Barcode globally unique",
      "One serialized unit per intake",
    ],
    conflictPolicy: "Reject duplicate identity as CONFLICT, not retryable",
    authorization: "MANAGER or SUPER_ADMIN, store-scoped",
  },
  {
    name: "accessory.receiving",
    request: "AccessoryReceivingRequest",
    invariants: [
      "SKU identity immutable after first receipt",
      "Quantity increases SKU balance atomically",
    ],
    conflictPolicy: "SKU/barcode collision is CONFLICT, not retryable",
    authorization: "MANAGER or SUPER_ADMIN, store-scoped",
  },
  {
    name: "pos.checkout",
    request: "PosCheckoutRequest",
    invariants: [
      "Atomic: sale + stock decrement + cash movement in one transaction",
      "Serialized phone sells at most once",
      "Idempotent replay returns original transactionId",
    ],
    conflictPolicy: "Stock or shift conflict is CONFLICT, retrySafe after refresh",
    authorization: "SELLER+ within own store and open shift",
  },
  {
    name: "cash.shift",
    request: "CashShiftOpenRequest / CashMovementRequest / CashBlindCloseRequest",
    invariants: [
      "One open shift per physical drawer",
      "Blind close never reveals expected total before count",
      "Discrepancy recorded exactly, never auto-corrected",
    ],
    conflictPolicy: "Second open on same drawer is CONFLICT, not retryable",
    authorization: "SELLER+ own drawer; close verified by MANAGER",
  },
  {
    name: "debt.lifecycle",
    request: "DebtCreateRequest / RepaymentRequest",
    invariants: [
      "Repayment never exceeds outstanding balance",
      "Exact decimal arithmetic in minor units",
    ],
    conflictPolicy: "Overpayment is VALIDATION failure",
    authorization: "MANAGER or SUPER_ADMIN, store-scoped",
  },
  {
    name: "supplier.settlement",
    request: "SupplierReceivingRequest / SupplierSettlementRequest",
    invariants: [
      "Receipt never exceeds ordered quantity",
      "Serialized identities unique across all receipts",
      "Costs visible only to SUPER_ADMIN",
    ],
    conflictPolicy: "Duplicate identity is CONFLICT, not retryable",
    authorization: "MANAGER+ receiving; SUPER_ADMIN for cost/settlement",
  },
  {
    name: "transfer.lifecycle",
    request: "TransferApproveRequest / TransferDispatchRequest / TransferReceiptScanRequest",
    invariants: [
      "Both SUPER_ADMIN and M02 MANAGER approvals required",
      "Receipt requires full validated scan; partial receipt disabled pending OD decision",
      "Unexpected or excess scans recorded as discrepancies",
    ],
    conflictPolicy: "Stage mismatch is CONFLICT, retrySafe after refresh",
    authorization: "Split: SUPER_ADMIN approval, M02 MANAGER approval, store staff scan",
  },
  {
    name: "facility.remittance",
    request: "FacilityRemittanceRequest",
    invariants: [
      "M01 only",
      "Schedule must sum exactly to contract price",
      "Bank confirmation is evidence, never a drawer movement",
    ],
    conflictPolicy: "Duplicate month confirmation is CONFLICT, not retryable",
    authorization: "SUPER_ADMIN with bank evidence",
  },
  {
    name: "warranty.case",
    request: "WarrantyCaseRequest / RefundRequest",
    invariants: [
      "Case links to original sale and serialized unit",
      "Cumulative refunds never exceed original sale amount",
      "Eligibility policies UNCONFIGURED — no execution",
    ],
    conflictPolicy: "Refund above cap is VALIDATION failure",
    authorization: "MANAGER+; refund execution blocked pending policy",
  },
];

export type { Money, StoreId };
