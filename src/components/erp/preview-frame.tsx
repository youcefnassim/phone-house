import type { ReactNode } from "react";
import { ErpProvider } from "./context";
import { Shell } from "./shell";
import { NativeTransportProvider } from "./native-transport";
import { nativeHostIntegration } from "@/data/native-host-integration";
export default function PreviewFrame({ children, auth }: { children: ReactNode; auth: boolean }) {
  return (
    <ErpProvider>
      <NativeTransportProvider
        transport={nativeHostIntegration?.transport}
        activation={nativeHostIntegration?.activation}
      >
        {auth ? children : <Shell>{children}</Shell>}
      </NativeTransportProvider>
    </ErpProvider>
  );
}
