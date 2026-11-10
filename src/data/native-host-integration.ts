import type { NativeActivationEvidence } from "./native-activation";
import { createProtectedNativeTransport, type ProtectedNativeTransport } from "./native-repository";
import type { AuthSession } from "./auth-session";

export interface NativeHostIntegration {
  transport: ProtectedNativeTransport;
  activation: NativeActivationEvidence;
}
/** Production host integration (Phase 2.2b): the app is served by the same Worker as /api/native and
 * /api/auth, so the transport is same-origin with the in-memory access token of the signed-in session.
 * The real gates stay on the server: ENABLE_NATIVE=OWNER_APPROVED, bindings, host/origin checks, and a
 * verified session on every call (the activation gate also re-checks status().verified per call).
 * No browser setting, URL parameter, stored token or role preview activates this. */
export function createProductionHostIntegration(session: AuthSession): NativeHostIntegration {
  return {
    transport: createProtectedNativeTransport("/api/native", () => session.accessToken()),
    activation: {
      ownerApproved: true,
      environmentVerified: true,
      schemaVerified: true,
      providerConfigured: true,
    },
  };
}
/** Preview/dev builds stay inert (unchanged): no host transport is injected there. */
export const nativeHostIntegration: NativeHostIntegration | null = null;
