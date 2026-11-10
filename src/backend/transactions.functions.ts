import { createServerFn, createMiddleware } from "@tanstack/react-start";
import { getRequestHeader, setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { transactionPayloads } from "@/domain/transaction-contracts";
import type { UserBoundPostgresPort } from "./command-gateway.server";
import type { BackendConnectionStatus } from "@/domain/backend-environment";

// Request-scoped user-bound transport. No service key, module-scope environment
// reads, default connection or synthetic fallback. Configuration is not acceptance.
export const backendConnectionStatus = createServerFn({ method: "GET" }).handler(
  (): BackendConnectionStatus => {
    setResponseHeader("Cache-Control", "no-store");
    // Hosting correction: no provider may be activated, including a previously
    // configured Supabase environment. Preserve old adapter source as reference.
    return {
      state: "NOT_CONNECTED",
      persistenceVerified: false,
      authenticationVerified: false,
      realModeAvailable: false,
    };
  },
);
const requireVerifiedOperator = createMiddleware({ type: "function" }).server(async ({ next }) => {
  setResponseHeader("Cache-Control", "no-store");
  setResponseHeader("Vary", "Authorization");
  const authorization = getRequestHeader("Authorization");
  if (!authorization?.startsWith("Bearer ") || authorization.length <= 7)
    throw new Response("Unauthorized", { status: 401 });
  const { GatewayError } = await import("./command-gateway.server");
  const transport: UserBoundPostgresPort = {
    getVerifiedUser: async () => null,
    rpc: async () => {
      throw new GatewayError("BACKEND_UNAVAILABLE");
    },
  };
  // Real activation is prohibited; an injected future native service replaces
  // this reference gateway only after resource and identity approval.
  if (!(await transport.getVerifiedUser())) throw new GatewayError("BACKEND_UNAVAILABLE");
  return next({ context: { transport } });
});
const operations = Object.keys(transactionPayloads) as [
  keyof typeof transactionPayloads,
  ...(keyof typeof transactionPayloads)[],
];
export const executeTransaction = createServerFn({ method: "POST" })
  .middleware([requireVerifiedOperator])
  .inputValidator(z.object({ operation: z.enum(operations), request: z.unknown() }).strict())
  .handler(async ({ data, context }) => {
    const { prepareAuthenticatedGateway } = await import("./command-gateway.server");
    return prepareAuthenticatedGateway(context.transport).execute({
      operation: data.operation,
      request: data.request,
    });
  });
export const readOperational = createServerFn({ method: "POST" })
  .middleware([requireVerifiedOperator])
  .inputValidator(z.object({ scope: z.enum(["ALL", "M01", "M02"]) }).strict())
  .handler(async ({ data, context }) => {
    const { prepareAuthenticatedGateway } = await import("./command-gateway.server");
    return prepareAuthenticatedGateway(context.transport).readOperational(data);
  });
export const readOwnerFinance = createServerFn({ method: "POST" })
  .middleware([requireVerifiedOperator])
  .inputValidator(z.object({ purchaseId: z.string().uuid() }).strict())
  .handler(async ({ data, context }) => {
    const { prepareAuthenticatedGateway } = await import("./command-gateway.server");
    return prepareAuthenticatedGateway(context.transport).readOwnerFinance(data);
  });
export const readInventory = createServerFn({ method: "POST" })
  .middleware([requireVerifiedOperator])
  .inputValidator(z.object({ scope: z.enum(["ALL", "M01", "M02"]) }).strict())
  .handler(async ({ data, context }) => {
    const { prepareAuthenticatedGateway } = await import("./command-gateway.server");
    return prepareAuthenticatedGateway(context.transport).readInventory(data);
  });
