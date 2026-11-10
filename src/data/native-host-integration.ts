import type { NativeActivationEvidence } from "./native-activation";
import type { ProtectedNativeTransport } from "./native-repository";

export interface NativeHostIntegration {
  transport: ProtectedNativeTransport;
  activation: NativeActivationEvidence;
}
/** Inert source integration. An approved host supplies transport and verified evidence.
 * No browser setting, URL parameter, local token or operator preview activates this. */
export const nativeHostIntegration: NativeHostIntegration | null = null;
