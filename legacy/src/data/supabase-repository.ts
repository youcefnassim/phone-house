import type { DraftReceipt } from "@/domain/repository";
import type { Scope, Role } from "@/domain/erp";
import type { DemoReadState } from "@/domain/business";
import {
  operationalSnapshotSchema,
  ownerFinanceSchema,
  commandEnvelope,
  commandPayloads,
  commandResultSchema,
  type BackendCommand,
  type CommandInput,
} from "@/domain/backend";
import { inventoryReadSchema } from "@/domain/inventory-contracts";
import { parsePostedCommand } from "@/domain/command-results";

// Intentionally not instantiated by the application. Transport must be the
// authenticated TanStack server-function facade, not a privileged browser client.
export interface AuthenticatedRepositoryTransport {
  readOperational(input: { scope: Scope }): Promise<unknown>;
  readInventory(input: { scope: Scope }): Promise<unknown>;
  execute(input: { operation: BackendCommand; request: unknown }): Promise<unknown>;
  readOwnerFinance(input: { purchaseId: string }): Promise<unknown>;
}
export class SupabaseRepository {
  readonly mode = "production" as const;
  constructor(private readonly transport: AuthenticatedRepositoryTransport) {}
  // Native production DTO. No synthetic fallback or draft labels, and no activation.
  async readOperational(scope: Scope) {
    return operationalSnapshotSchema.parse(await this.transport.readOperational({ scope }));
  }
  async readInventory(scope: Scope) {
    return inventoryReadSchema.parse(await this.transport.readInventory({ scope }));
  }
  async read(scope: Scope, _untrustedRolePreview: Role, state?: DemoReadState) {
    if (state && state !== "Live demo")
      throw new Error("Synthetic data states are unavailable in production");
    return this.readOperational(scope);
  }
  async listCustomers(scope: Scope) {
    return (await this.readOperational(scope)).customers;
  }
  async listDebts(scope: Scope) {
    return (await this.readOperational(scope)).debts;
  }
  async listSuppliers(scope: Scope) {
    return (await this.readOperational(scope)).suppliers;
  }
  async execute<K extends BackendCommand>(operation: K, request: CommandInput<K>) {
    const envelope = commandEnvelope.parse(request);
    const payload = commandPayloads[operation].parse(envelope.payload);
    const result = commandResultSchema.parse(
      await this.transport.execute({ operation, request: { ...envelope, payload } }),
    );
    return result.ok ? parsePostedCommand(operation, result) : result;
  }
  async readOwnerFinance(purchaseId: string) {
    return ownerFinanceSchema
      .nullable()
      .parse(await this.transport.readOwnerFinance({ purchaseId }));
  }
  // Never silently reinterpret a synthetic draft call as a real posting.
  async saveCustomerDraft(): Promise<DraftReceipt> {
    throw new Error("Synthetic draft method disabled in production");
  }
  async saveDebtDraft(): Promise<DraftReceipt> {
    throw new Error("Synthetic draft method disabled in production");
  }
  async saveRepaymentDraft(): Promise<DraftReceipt> {
    throw new Error("Synthetic draft method disabled in production");
  }
  async saveSupplierDraft(): Promise<DraftReceipt> {
    throw new Error("Synthetic draft method disabled in production");
  }
}
