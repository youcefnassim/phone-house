import type { QueryClient } from "@tanstack/react-query";
import { SupabaseRepository, type AuthenticatedRepositoryTransport } from "./supabase-repository";
// No default instance. Caller must supply an authenticated server-function facade.
export function createProductionRepository(
  transport: AuthenticatedRepositoryTransport,
  cache: QueryClient,
) {
  return new SupabaseRepository({
    readOperational: (input) => transport.readOperational(input),
    readInventory: (input) => transport.readInventory(input),
    readOwnerFinance: (input) => transport.readOwnerFinance(input),
    async execute(input) {
      const result = await transport.execute(input);
      if (result && typeof result === "object" && "ok" in result && result.ok === true)
        await cache.invalidateQueries({ queryKey: ["erp"] });
      return result;
    },
  });
}
