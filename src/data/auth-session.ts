// Browser side of the ERP's own login (/api/auth/*). The access token lives in memory only; the
// session survives reloads through the HttpOnly refresh cookie set by the Worker. Device id is a random
// per-browser id used only for the owner's new-device alerts (not a credential).
export interface AuthUser {
  id: string;
  displayName: string;
  mustChange: boolean;
  roles: { store: string; role: string }[];
}
export interface SellerChoice {
  id: string;
  displayName: string;
  pinSet: boolean;
  locked: boolean;
  mustChange: boolean;
}
export interface OwnerAlert {
  id: string;
  kind: string;
  userId: string;
  displayName: string | null;
  deviceId: string;
  ip: string | null;
  at: number;
}
export type AuthState =
  | { phase: "loading" }
  | { phase: "signedOut"; error?: string }
  | { phase: "mustChange"; user: AuthUser }
  | { phase: "setPin"; user: AuthUser }
  | { phase: "ready"; user: AuthUser; activeSeller: AuthUser | null };

export class AuthRequestError extends Error {
  constructor(
    readonly code: string,
    readonly detail?: string,
  ) {
    super(code);
  }
}
const DEVICE_KEY = "ph.device-id";
export function deviceId() {
  try {
    const existing = localStorage.getItem(DEVICE_KEY);
    if (existing && /^[A-Za-z0-9-]{8,80}$/.test(existing)) return existing;
    const id = crypto.randomUUID();
    localStorage.setItem(DEVICE_KEY, id);
    return id;
  } catch {
    return crypto.randomUUID();
  }
}
/** Staff (SELLER/MANAGER) set their PIN right after replacing the temporary password. */
export const needsPin = (user: AuthUser) =>
  user.roles.some((r) => r.role === "SELLER" || r.role === "MANAGER");
export const isOwner = (user: AuthUser) =>
  user.roles.some((r) => r.role === "SUPER_ADMIN" && r.store === "GLOBAL");
/** Store whose sellers can be switched in on this device. */
export const deviceStore = (user: AuthUser): "M01" | "M02" =>
  user.roles.some((r) => r.store === "M02") && !user.roles.some((r) => r.store === "M01")
    ? "M02"
    : "M01";

interface TokenReply {
  accessToken: string;
  expiresAt: number;
  user: AuthUser;
  activeSeller?: AuthUser | null;
}
export function createAuthSession(request: typeof fetch = (...a) => fetch(...a)) {
  let state: AuthState = { phase: "loading" };
  let token: { value: string; expiresAt: number } | null = null;
  let refreshing: Promise<boolean> | null = null;
  const listeners = new Set<() => void>();
  const set = (next: AuthState) => {
    state = next;
    listeners.forEach((l) => l());
  };
  async function call<T>(path: string, body: unknown = {}, auth = false): Promise<T> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (auth && token) headers["Authorization"] = `Bearer ${token.value}`;
    const r = await request(`/api/auth/${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      credentials: "same-origin",
      cache: "no-store",
    });
    let payload: Record<string, unknown> = {};
    try {
      payload = (await r.json()) as Record<string, unknown>;
    } catch {
      /* opaque */
    }
    if (!r.ok)
      throw new AuthRequestError(
        typeof payload["error"] === "string" ? payload["error"] : "NETWORK",
        typeof payload["detail"] === "string" ? payload["detail"] : undefined,
      );
    return payload as T;
  }
  const accept = (reply: TokenReply) => {
    token = { value: reply.accessToken, expiresAt: reply.expiresAt };
    if (reply.user.mustChange) set({ phase: "mustChange", user: reply.user });
    else set({ phase: "ready", user: reply.user, activeSeller: reply.activeSeller ?? null });
  };
  async function refresh(): Promise<boolean> {
    refreshing ??= call<TokenReply>("refresh")
      .then((r) => {
        accept(r);
        return true;
      })
      .catch(() => {
        token = null;
        set({ phase: "signedOut" });
        return false;
      })
      .finally(() => {
        refreshing = null;
      });
    return refreshing;
  }
  const readyUser = () => (state.phase === "ready" ? state : null);

  return {
    getState: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    /** Called once on app start: resumes the session from the cookie, if any. */
    start: () => refresh(),
    /** Token for /api/native calls; renews 60 s before expiry. Null when signed out. */
    async accessToken(): Promise<string | null> {
      if (token && token.expiresAt - Date.now() > 60_000) return token.value;
      if (state.phase === "signedOut") return null;
      return (await refresh()) && token ? token.value : null;
    },
    async login(email: string, password: string) {
      try {
        accept(await call<TokenReply>("login", { email, password, deviceId: deviceId() }));
      } catch (e) {
        set({ phase: "signedOut", error: e instanceof AuthRequestError ? e.code : "NETWORK" });
      }
    },
    async changePassword(currentPassword: string, newPassword: string) {
      const r = await call<{ user: AuthUser }>("password", { currentPassword, newPassword }, true);
      if (needsPin(r.user)) set({ phase: "setPin", user: r.user });
      else set({ phase: "ready", user: r.user, activeSeller: null });
    },
    async setOwnPin(pin: string) {
      if (state.phase !== "setPin") return;
      const user = state.user;
      await call("pin/set", { userId: user.id, pin }, true);
      set({ phase: "ready", user, activeSeller: null });
    },
    sellers: (store: "M01" | "M02") => call<SellerChoice[]>("sellers", { store }, true),
    async switchSeller(store: "M01" | "M02", sellerId: string, pin: string) {
      const ready = readyUser();
      if (!ready) throw new AuthRequestError("UNAUTHORIZED");
      // The device session's own token must be used: drop any active seller token first.
      if (ready.activeSeller) await this.clearSeller();
      const r = await call<{ accessToken: string; expiresAt: number; activeSeller: AuthUser }>(
        "pin/switch",
        { store, sellerId, pin },
        true,
      );
      token = { value: r.accessToken, expiresAt: r.expiresAt };
      set({ phase: "ready", user: ready.user, activeSeller: r.activeSeller });
    },
    async clearSeller() {
      const ready = readyUser();
      if (!ready) return;
      const r = await call<{ accessToken: string; expiresAt: number }>("pin/clear", {}, true);
      token = { value: r.accessToken, expiresAt: r.expiresAt };
      set({ phase: "ready", user: ready.user, activeSeller: null });
    },
    alerts: () => call<OwnerAlert[]>("alerts", {}, true),
    ackAlert: (id: string) => call("alerts/ack", { id }, true),
    async logout() {
      try {
        await call("logout");
      } finally {
        token = null;
        set({ phase: "signedOut" });
      }
    },
  };
}
export type AuthSession = ReturnType<typeof createAuthSession>;
