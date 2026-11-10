import type { ReactNode } from "react";
import { ErpProvider } from "./production-context";
import { NativeShell } from "./native-shell";
import { NativeTransportProvider } from "./native-transport";
import { nativeHostIntegration } from "@/data/native-host-integration";
import { Auth } from "./production-entry";
export default function NativeFrame({
  children: _children,
  auth,
}: {
  children: ReactNode;
  auth: boolean;
}) {
  return (
    <ErpProvider>
      <NativeTransportProvider
        transport={nativeHostIntegration?.transport}
        activation={nativeHostIntegration?.activation}
      >
        {auth ? <Auth /> : <NativeShell />}
      </NativeTransportProvider>
    </ErpProvider>
  );
}
