import { useCallback, useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ErpProvider } from "./production-context";
import { NativeShell } from "./native-shell";
import { NativeTransportProvider } from "./native-transport";
import { createProductionHostIntegration } from "@/data/native-host-integration";
import { createAuthSession, isOwner, type AuthUser } from "@/data/auth-session";
import { AuthGate } from "./auth-screens";

/** Production frame: own sign-in (AuthGate) first, then the native ERP over the same-origin API. */
export default function NativeFrame({
  children: _children,
  auth: _auth,
}: {
  children: ReactNode;
  auth: boolean;
}) {
  const [session] = useState(() => createAuthSession());
  const [host] = useState(() => createProductionHostIntegration(session));
  const navigate = useNavigate();
  // After signing in, staff land on the point of sale (the overview "/" is the owner's home).
  // A direct visit to a restricted URL still renders the access-denied state.
  const landing = useCallback(
    (user: AuthUser) => {
      if (!isOwner(user) && window.location.pathname === "/") void navigate({ to: "/pos" });
    },
    [navigate],
  );
  return (
    <ErpProvider>
      <AuthGate session={session} onSignedIn={landing}>
        {(bar) => (
          <NativeTransportProvider transport={host.transport} activation={host.activation}>
            <NativeShell topBar={bar} />
          </NativeTransportProvider>
        )}
      </AuthGate>
    </ErpProvider>
  );
}
