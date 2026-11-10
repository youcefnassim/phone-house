import type { NativeTransportStatus, ProtectedNativeTransport } from "./native-repository";
import { disconnectedNativeTransport } from "./native-repository";

/** Trusted host integration supplies evidence, never browser preferences or role preview.
 * This is a prerequisite gate, not certification of the hosted environment. */
export interface NativeActivationEvidence {
  ownerApproved: boolean;
  environmentVerified: boolean;
  schemaVerified: boolean;
  providerConfigured: boolean;
}
export function gateNativeTransport(
  transport: ProtectedNativeTransport,
  evidence: NativeActivationEvidence,
): ProtectedNativeTransport {
  if (
    evidence.ownerApproved !== true ||
    evidence.environmentVerified !== true ||
    evidence.schemaVerified !== true ||
    evidence.providerConfigured !== true
  )
    return disconnectedNativeTransport;
  return new Proxy(transport, {
    get(target, property) {
      if (property === "status")
        return async (): Promise<NativeTransportStatus> => {
          const status = await target.status();
          return status.connected && status.verified && !status.synthetic
            ? status
            : { connected: false, verified: false };
        };
      const method = Reflect.get(target, property);
      if (typeof method !== "function") return method;
      return async (...args: unknown[]) => {
        const status = await target.status();
        if (!status.connected || !status.verified || status.synthetic)
          return disconnectedNativeTransport.read("settings", "M01");
        return Reflect.apply(method, target, args);
      };
    },
  });
}
