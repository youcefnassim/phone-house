// Phase 2.2b: browser session client + sign-in screens against a fake /api/auth.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createAuthSession, type AuthUser } from "@/data/auth-session";
import { AuthGate } from "@/components/erp/auth-screens";
import { ErpProvider } from "@/components/erp/production-context";

const owner: AuthUser = {
  id: "owner",
  displayName: "Owner",
  mustChange: false,
  roles: [{ store: "GLOBAL", role: "SUPER_ADMIN" }],
};
const lina: AuthUser = {
  id: "lina",
  displayName: "Lina M.",
  mustChange: true,
  roles: [{ store: "M01", role: "SELLER" }],
};
const token = (exp = Date.now() + 15 * 60_000) => ({ accessToken: "tok." + exp, expiresAt: exp });
type Handler = (body: Record<string, unknown>, headers: Headers) => [number, unknown];
function fakeApi(routes: Record<string, Handler>) {
  const calls: { path: string; body: Record<string, unknown>; auth: string | null }[] = [];
  const request = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const path = String(url).replace("/api/auth/", "");
    const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
    const headers = new Headers(init?.headers);
    calls.push({ path, body, auth: headers.get("Authorization") });
    const [status, payload] = (routes[path] ?? (() => [404, { error: "NOT_FOUND" }]))(
      body,
      headers,
    );
    return new Response(JSON.stringify(payload), { status });
  }) as unknown as typeof fetch;
  return { request, calls };
}
beforeEach(() => localStorage.setItem("ph-lang", "fr-DZ"));
afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("session client", () => {
  it("no cookie -> signed out; login -> ready; token renewed 60 s before expiry; logout", async () => {
    let refreshOk = false;
    const api = fakeApi({
      refresh: () =>
        refreshOk
          ? [200, { ...token(), user: owner, activeSeller: null }]
          : [401, { error: "UNAUTHORIZED" }],
      login: (b) =>
        b["password"] === "Correct-Password-1"
          ? [200, { ...token(Date.now() + 30_000), user: owner }]
          : [401, { error: "INVALID_CREDENTIALS" }],
      logout: () => [200, { ok: true }],
    });
    const s = createAuthSession(api.request);
    await s.start();
    expect(s.getState().phase).toBe("signedOut");
    await s.login("owner@x.dz", "wrong");
    expect(s.getState()).toEqual({ phase: "signedOut", error: "INVALID_CREDENTIALS" });
    await s.login("owner@x.dz", "Correct-Password-1");
    expect(s.getState().phase).toBe("ready");
    expect(api.calls.find((c) => c.path === "login")?.body["deviceId"]).toMatch(
      /^[A-Za-z0-9-]{8,80}$/,
    );
    // Token expires in 30 s (< 60 s): accessToken() refreshes through the cookie.
    refreshOk = true;
    const t = await s.accessToken();
    expect(api.calls.at(-1)?.path).toBe("refresh");
    expect(t).toMatch(/^tok\./);
    await s.logout();
    expect(s.getState().phase).toBe("signedOut");
    expect(await s.accessToken()).toBeNull();
  });
  it("never stores the access token in browser storage", async () => {
    const api = fakeApi({ login: () => [200, { ...token(), user: owner }] });
    const s = createAuthSession(api.request);
    await s.login("owner@x.dz", "Correct-Password-1");
    expect(JSON.stringify({ ...localStorage, ...sessionStorage })).not.toContain("tok.");
  });
});

describe("screens", () => {
  const mount = (request: typeof fetch) => {
    const session = createAuthSession(request);
    render(
      <ErpProvider>
        <AuthGate session={session}>{(bar) => <div>{bar}ERP-CONTENT</div>}</AuthGate>
      </ErpProvider>,
    );
    return session;
  };
  it("seller first login on the shop PC: login -> change password -> set PIN (twice) -> ERP with her name", async () => {
    let user = lina;
    const api = fakeApi({
      refresh: () => [401, { error: "UNAUTHORIZED" }],
      login: () => [200, { ...token(), user }],
      password: (b) => {
        if (b["newPassword"] === "Lina-Contains-Name-1")
          return [400, { error: "PASSWORD_POLICY", detail: "TOO_COMMON" }];
        user = { ...lina, mustChange: false };
        return [200, { ok: true, user }];
      },
      "pin/set": (b) =>
        b["pin"] === "4825" ? [200, { ok: true }] : [400, { error: "PIN_POLICY" }],
    });
    mount(api.request);
    fireEvent.change(await screen.findByLabelText("E-mail"), { target: { value: "lina@x.dz" } });
    fireEvent.change(screen.getByLabelText("Mot de passe"), {
      target: { value: "Provisoire-Magasin-02" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Se connecter" }));
    await screen.findByRole("heading", { name: "Choisissez votre mot de passe" });
    const fill = (label: string, value: string) =>
      fireEvent.change(screen.getByLabelText(label), { target: { value } });
    fill("Mot de passe temporaire", "Provisoire-Magasin-02");
    fill("Nouveau mot de passe", "Lina-Contains-Name-1");
    fill("Confirmer le nouveau mot de passe", "Something-Else-12");
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("différents");
    fill("Confirmer le nouveau mot de passe", "Lina-Contains-Name-1");
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("contient votre nom");
    fill("Nouveau mot de passe", "Vendeuse-Magasin-Secret-26");
    fill("Confirmer le nouveau mot de passe", "Vendeuse-Magasin-Secret-26");
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
    await screen.findByRole("heading", { name: "Choisissez votre code PIN" });
    for (const d of "4825") fireEvent.click(screen.getByRole("button", { name: d }));
    fireEvent.click(screen.getByRole("button", { name: "Valider" }));
    await screen.findByText("Confirmer le code PIN");
    for (const d of "4825") fireEvent.click(screen.getByRole("button", { name: d }));
    fireEvent.click(screen.getByRole("button", { name: "Valider" }));
    await screen.findByText("ERP-CONTENT");
    expect(screen.getByTestId("active-seller")).toHaveTextContent("Lina M.");
    expect(screen.getByRole("button", { name: "Changer de vendeur" })).toBeTruthy();
    expect(api.calls.filter((c) => c.path === "pin/set")).toHaveLength(1);
  });

  it("Changer de vendeur: pending/locked sellers cannot be chosen; PIN pad switches the large name", async () => {
    const karim: AuthUser = {
      id: "karim",
      displayName: "Karim B.",
      mustChange: false,
      roles: [{ store: "M01", role: "SELLER" }],
    };
    const api = fakeApi({
      refresh: () => [200, { ...token(), user: owner, activeSeller: null }],
      alerts: () => [200, []],
      sellers: () => [
        200,
        [
          { id: "karim", displayName: "Karim B.", pinSet: true, locked: false, mustChange: false },
          { id: "samir", displayName: "Samir", pinSet: true, locked: false, mustChange: true },
          { id: "nadia", displayName: "Nadia", pinSet: true, locked: true, mustChange: false },
        ],
      ],
      "pin/switch": (b) =>
        b["pin"] === "4071"
          ? [200, { ...token(), activeSeller: karim }]
          : [401, { error: "INVALID_PIN" }],
    });
    mount(api.request);
    expect(await screen.findByTestId("active-seller")).toHaveTextContent("Owner");
    fireEvent.click(screen.getByRole("button", { name: "Changer de vendeur" }));
    await screen.findByText("Choisissez votre nom");
    expect(screen.getByRole("button", { name: /Samir/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Samir/ })).toHaveTextContent(
      "Doit d'abord changer son mot de passe",
    );
    expect(screen.getByRole("button", { name: /Nadia/ })).toHaveTextContent("PIN bloqué");
    fireEvent.click(screen.getByRole("button", { name: /Karim/ }));
    for (const d of "9999") fireEvent.click(screen.getByRole("button", { name: d }));
    fireEvent.click(screen.getByRole("button", { name: "Valider" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Code PIN incorrect.");
    for (const d of "4071") fireEvent.click(screen.getByRole("button", { name: d }));
    fireEvent.click(screen.getByRole("button", { name: "Valider" }));
    await waitFor(() => expect(screen.getByTestId("active-seller")).toHaveTextContent("Karim B."));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(api.calls.filter((c) => c.path === "pin/switch").map((c) => c.body["sellerId"])).toEqual(
      ["karim", "karim"],
    );
  });

  it("Arabic: the page is right-to-left and the switch button is localized", async () => {
    localStorage.setItem("ph-lang", "ar-DZ");
    const api = fakeApi({
      refresh: () => [200, { ...token(), user: owner, activeSeller: null }],
      alerts: () => [200, []],
    });
    mount(api.request);
    await screen.findByRole("button", { name: "تغيير البائع" });
    expect(document.documentElement.dir).toBe("rtl");
  });
});

describe("landing after sign-in", () => {
  it("onSignedIn fires after an interactive login, not when a session is resumed from the cookie", async () => {
    const seen: string[] = [];
    const resumed = fakeApi({
      refresh: () => [200, { ...token(), user: owner, activeSeller: null }],
      alerts: () => [200, []],
    });
    const s1 = createAuthSession(resumed.request);
    render(
      <ErpProvider>
        <AuthGate session={s1} onSignedIn={(u) => seen.push(`resumed:${u.id}`)}>
          {() => <div>ERP</div>}
        </AuthGate>
      </ErpProvider>,
    );
    await screen.findByText("ERP");
    expect(seen).toEqual([]);
    cleanup();
    const fresh = fakeApi({
      refresh: () => [401, { error: "UNAUTHORIZED" }],
      login: () => [200, { ...token(), user: { ...lina, mustChange: false } }],
    });
    const s2 = createAuthSession(fresh.request);
    render(
      <ErpProvider>
        <AuthGate session={s2} onSignedIn={(u) => seen.push(`login:${u.id}`)}>
          {() => <div>ERP</div>}
        </AuthGate>
      </ErpProvider>,
    );
    fireEvent.change(await screen.findByLabelText("E-mail"), { target: { value: "lina@x.dz" } });
    fireEvent.change(screen.getByLabelText("Mot de passe"), {
      target: { value: "Vendeuse-Magasin-Secret-26" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Se connecter" }));
    await screen.findByText("ERP");
    expect(seen).toEqual(["login:lina"]);
  });
});
