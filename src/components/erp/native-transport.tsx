import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { gateNativeTransport, type NativeActivationEvidence } from "@/data/native-activation";
import {
  disconnectedNativeTransport,
  type ProtectedNativeTransport,
} from "@/data/native-repository";
// Injection point for the production transport. Default is disconnected: no
// URL, token or identity is fabricated. A verified host transport is injected
// only after owner approval. The SYNTHETIC transport is dev-only and labeled.
const Ctx = createContext<ProtectedNativeTransport>(disconnectedNativeTransport);
const Requested = createContext(false);
export function NativeTransportProvider({
  transport,
  activation,
  children,
}: {
  transport?: ProtectedNativeTransport | undefined;
  activation?: NativeActivationEvidence | undefined;
  children: ReactNode;
}) {
  const [devSynthetic, setDevSynthetic] = useState<ProtectedNativeTransport | null>(null);
  const selected = useMemo(() => {
    if (!transport) return devSynthetic ?? disconnectedNativeTransport;
    if (activation) return gateNativeTransport(transport, activation);
    // Ungated injection is only a development test seam, never hosted activation.
    return import.meta.env.DEV && import.meta.env["VITE_APP_MODE"] !== "production"
      ? transport
      : disconnectedNativeTransport;
  }, [transport, activation, devSynthetic]);
  useEffect(() => {
    if (transport || !import.meta.env.DEV || import.meta.env["VITE_APP_MODE"] === "production")
      return;
    const role = localStorage.getItem("ph.synthetic-transport");
    if (role === "SUPER_ADMIN" || role === "MANAGER" || role === "SELLER")
      void import("@/data/synthetic-native-transport").then((m) =>
        setDevSynthetic(m.createSyntheticTransport({ role })),
      );
  }, [transport]);
  return (
    <Requested.Provider value={transport !== undefined}>
      <Ctx.Provider value={selected}>{children}</Ctx.Provider>
    </Requested.Provider>
  );
}
export const useNativeTransport = () => useContext(Ctx);
export const useNativeRequested = () => useContext(Requested);
