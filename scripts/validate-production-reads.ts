import { productionOperationalSchema } from "../src/domain/production-reads";
import { inventoryReadSchema } from "../src/domain/inventory-contracts";
import { ownerFinanceSchema } from "../src/domain/backend";

// Offline validator used by the explicitly approved SQL harness, not an app endpoint.
// Input must be synthetic SQL readback; never prints rows, validation details or money.
try {
  const value = JSON.parse(await Bun.stdin.text());
  productionOperationalSchema.parse(value.operational);
  inventoryReadSchema.parse(value.inventory);
  ownerFinanceSchema.nullable().parse(value.finance);
  console.log(JSON.stringify({ status: "VALIDATED", evidenceClass: "SQL read DTO validation" }));
} catch {
  console.log(JSON.stringify({ status: "REJECTED", reason: "RESPONSE_CONTRACT_INVALID" }));
  process.exitCode = 1;
}
