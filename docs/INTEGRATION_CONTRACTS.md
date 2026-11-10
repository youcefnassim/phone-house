# Production Integration Contracts — Review 05

Status: **contracts only**. Source of truth: `src/domain/contracts.ts`
(version `2026-11-review05`). No implementation executes real mutations.

## Envelope

Every operation uses one envelope:

```ts
interface OperationRequest<T> {
  contractVersion: "2026-11-review05";
  idempotencyKey: string; // ^[A-Za-z0-9][A-Za-z0-9-]{15,79}$
  clientRequestId: string;
  actor: { userId: string; role: Role; storeScope: Scope };
  payload: T;
}

type OperationResult<T> =
  | { ok: true; transactionId: string; idempotencyKey: string; replayed: boolean; data: T }
  | { ok: false; kind: "VALIDATION"; issues: { path: string; message: string }[]; retrySafe: false }
  | { ok: false; kind: "AUTHORIZATION"; reason: string; retrySafe: false }
  | { ok: false; kind: "CONFLICT"; reason: string; retrySafe: boolean };
```

- **VALIDATION** — payload failed the domain schema; fix input, never retry as-is.
- **AUTHORIZATION** — authenticated identity lacks role or store scope.
- **CONFLICT** — state changed (duplicate identity, stage mismatch, drawer
  already open). `retrySafe: true` means the client may refresh and retry;
  `false` means the operation can never succeed as submitted.
- **Idempotent replay** — resubmitting the same `idempotencyKey` returns the
  original `transactionId` with `replayed: true` and applies no effect twice.

## Operations

| Operation             | Payload schema                                                                      | Key invariants                                                                             | Authorization                              |
| --------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------ |
| `phone.intake`        | `phoneIntakeRequest`                                                                | IMEI1/barcode globally unique; one unit per intake                                         | MANAGER+, store-scoped                     |
| `accessory.receiving` | `accessoryReceivingRequest`                                                         | SKU identity immutable; atomic balance delta                                               | MANAGER+, store-scoped                     |
| `pos.checkout`        | `posCheckoutRequest`                                                                | Atomic sale + stock + cash; phone sells once; idempotent replay                            | SELLER+, own store, open shift             |
| `cash.shift`          | `cashShiftOpenRequest` / `cashMovementRequest` / `cashBlindCloseRequest`            | One open shift per drawer; blind close hides expected total; exact discrepancy             | SELLER+ own drawer; MANAGER verifies close |
| `debt.lifecycle`      | `debtCreateRequest` / `repaymentRequest`                                            | Repayment ≤ outstanding; minor-unit arithmetic                                             | MANAGER+, store-scoped                     |
| `supplier.settlement` | `supplierReceivingRequest` / `supplierSettlementRequest`                            | Receipt ≤ ordered; unique identities; costs SUPER_ADMIN only                               | MANAGER+ receiving; SUPER_ADMIN settlement |
| `transfer.lifecycle`  | `transferApproveRequest` / `transferDispatchRequest` / `transferReceiptScanRequest` | Dual approval (SUPER_ADMIN + M02 MANAGER); full validated scan; discrepancies recorded     | Split by approval; store staff scan        |
| `facility.remittance` | `facilityRemittanceRequest`                                                         | M01 only; schedule sums to price; evidence is not a drawer movement                        | SUPER_ADMIN with bank evidence             |
| `warranty.case`       | `warrantyCaseRequest` / `refundRequest`                                             | Linked to original sale + unit; cumulative refunds ≤ sale amount; eligibility UNCONFIGURED | MANAGER+; refund execution blocked         |

## Frontend boundary

Components consume `ErpRepository` (`src/domain/repository.ts`). The demo
implementation (`src/data/demo-repository.ts`) validates with the same domain
schemas and stores session drafts only. A production implementation will call
authenticated server functions that enforce these contracts transactionally;
components should not change.
