import { z } from "zod";
import { GatewayError } from "./command-gateway.server";
export interface OwnerProvisioningPort {
  getVerifiedOwner(): Promise<{ id: string } | null>;
  inviteInactiveIdentity(email: string, displayName: string): Promise<{ userId: string }>;
  auditProvision(actorId: string, userId: string): Promise<void>;
  revokeOperatorSessions(userId: string): Promise<void>;
}
const invite = z
  .object({ email: z.string().email(), displayName: z.string().trim().min(1) })
  .strict();
// No constructed port, route, credentials, account creation or default signup policy.
// Invitations cannot activate a profile or grant a role. SQL role assignment is a separate owner action.
export function prepareOwnerProvisioning(port: OwnerProvisioningPort) {
  return {
    async invite(input: unknown) {
      const owner = await port.getVerifiedOwner();
      if (!owner) throw new GatewayError("AUTHORIZATION");
      const data = invite.parse(input);
      const result = await port.inviteInactiveIdentity(data.email, data.displayName);
      await port.auditProvision(owner.id, result.userId);
      return { userId: result.userId, active: false as const, rolesGranted: false as const };
    },
    async handoff(input: unknown) {
      const parsed = z
        .object({
          previousOperatorId: z.string().uuid(),
          newVerifiedOperatorId: z.string().uuid(),
          store: z.literal("M01"),
        })
        .strict()
        .parse(input);
      const owner = await port.getVerifiedOwner();
      if (!owner) throw new GatewayError("AUTHORIZATION");
      // New operator MUST authenticate separately; caller IDs do not establish a session.
      await port.revokeOperatorSessions(parsed.previousOperatorId);
      return { requiresIndependentSignIn: true as const, authenticatedHandoff: false as const };
    },
  };
}
