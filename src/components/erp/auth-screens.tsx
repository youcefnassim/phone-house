// Production sign-in screens (Phase 2.2b). Design system: Vazirmatn via --font-ui, three button levels
// (primary = default, secondary = outline, tertiary = ghost/link), 44px targets, 52px main action,
// logical properties for RTL, light/dark through the existing tokens. Door Yellow only for alert dots.
import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
  type ReactNode,
} from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { languages } from "@/i18n";
import { authText } from "@/locales/auth";
import {
  AuthRequestError,
  deviceStore,
  isOwner,
  type AuthSession,
  type AuthState,
  type AuthUser,
  type OwnerAlert,
  type SellerChoice,
} from "@/data/auth-session";
import { useErp } from "./context";
import { BrandLogo } from "./brand-logo";

export function useAuthState(session: AuthSession): AuthState {
  return useSyncExternalStore(session.subscribe, session.getState, session.getState);
}

function Preferences() {
  const ui = useErp();
  return (
    <div className="flex items-center gap-2">
      <select
        aria-label={ui.t("shell.language")}
        className="min-h-11 rounded-control border border-input bg-card px-2"
        value={ui.lang}
        onChange={(e) => {
          const l = languages.find((x) => x.code === e.target.value);
          if (l) ui.setLang(l.code);
        }}
      >
        {languages.map((l) => (
          <option key={l.code} value={l.code}>
            {l.label}
          </option>
        ))}
      </select>
      <Button
        variant="ghost"
        size="icon"
        aria-label={ui.t("shell.darkTheme")}
        onClick={ui.toggleTheme}
      >
        {ui.dark ? <Sun /> : <Moon />}
      </Button>
    </div>
  );
}

function Panel({ title, intro, children }: { title: string; intro?: string; children: ReactNode }) {
  return (
    <main className="auth-page min-h-screen bg-background text-foreground flex flex-col">
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3">
        <div className="brand auth-brand min-w-0 shrink">
          <BrandLogo />
        </div>
        <Preferences />
      </header>
      <div className="flex flex-1 items-start justify-center px-4 pb-10 pt-6 sm:pt-16">
        <section className="w-full max-w-md rounded-panel border border-border bg-card p-6">
          <h1 className="text-2xl font-semibold leading-tight">{title}</h1>
          {intro && <p className="mt-2 text-muted-foreground">{intro}</p>}
          <div className="mt-6">{children}</div>
        </section>
      </div>
    </main>
  );
}
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid gap-1.5 font-medium">
      <span>{label}</span>
      {children}
    </label>
  );
}
function ErrorText({ children }: { children: ReactNode }) {
  return children ? (
    <p role="alert" className="auth-error text-destructive border-s-2 border-destructive ps-3">
      {children}
    </p>
  ) : null;
}

export function LoginPage({
  session,
  error,
}: {
  session: AuthSession;
  error?: string | undefined;
}) {
  const { lang } = useErp();
  const t = authText(lang);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    void session.login(email, password).finally(() => {
      setBusy(false);
      setPassword("");
    });
  };
  const message =
    error === "INVALID_CREDENTIALS"
      ? t.invalid
      : error === "NOT_CONFIGURED"
        ? t.notConfigured
        : error
          ? t.network
          : "";
  return (
    <Panel title={t.title} intro={t.subtitle}>
      <form className="grid gap-4" onSubmit={submit}>
        <Field label={t.email}>
          <Input
            type="email"
            autoComplete="username"
            dir="ltr"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Field label={t.password}>
          <Input
            type="password"
            autoComplete="current-password"
            dir="ltr"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <ErrorText>{message}</ErrorText>
        <Button size="lg" type="submit" disabled={busy || !email || !password}>
          {busy ? t.signingIn : t.signIn}
        </Button>
      </form>
    </Panel>
  );
}

export function ChangePasswordPage({ session, user }: { session: AuthSession; user: AuthUser }) {
  const { lang } = useErp();
  const t = authText(lang);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (next !== again) return setError(t.mismatch);
    setBusy(true);
    setError("");
    session
      .changePassword(current, next)
      .catch((err: unknown) => {
        const code = err instanceof AuthRequestError ? (err.detail ?? err.code) : "";
        setError(
          code in t
            ? String(t[code as keyof typeof t])
            : code === "INVALID_CREDENTIALS"
              ? t.invalid
              : t.failed,
        );
      })
      .finally(() => setBusy(false));
  };
  return (
    <Panel title={t.changeTitle} intro={`\u2068${user.displayName}\u2069 — ${t.changeIntro}`}>
      <form className="grid gap-4" onSubmit={submit}>
        <Field label={t.currentPassword}>
          <Input
            type="password"
            autoComplete="current-password"
            dir="ltr"
            required
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
          />
        </Field>
        <Field label={t.newPassword}>
          <Input
            type="password"
            autoComplete="new-password"
            dir="ltr"
            required
            minLength={12}
            value={next}
            onChange={(e) => setNext(e.target.value)}
          />
        </Field>
        <Field label={t.confirmPassword}>
          <Input
            type="password"
            autoComplete="new-password"
            dir="ltr"
            required
            value={again}
            onChange={(e) => setAgain(e.target.value)}
          />
        </Field>
        <p className="text-sm text-muted-foreground">{t.passwordRule}</p>
        <ErrorText>{error}</ErrorText>
        <Button size="lg" type="submit" disabled={busy || !current || !next || !again}>
          {t.save}
        </Button>
      </form>
    </Panel>
  );
}

/** Numeric PIN pad; physical keyboard digits also work. Digits are never displayed. */
export function PinPad({
  value,
  onChange,
  onSubmit,
  label,
  busy,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  label: string;
  busy?: boolean;
}) {
  const { lang } = useErp();
  const t = authText(lang);
  const press = (d: string) => value.length < 8 && onChange(value + d);
  return (
    <div className="grid gap-3" dir="ltr">
      <Input
        aria-label={label}
        type="password"
        inputMode="numeric"
        autoComplete="off"
        className="text-center text-2xl tracking-[0.5em] min-h-13"
        value={value}
        maxLength={8}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 8))}
        onKeyDown={(e) => {
          if (e.key === "Enter" && value.length >= 4) onSubmit();
        }}
      />
      <div className="pin-pad grid grid-cols-3 gap-2">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
          <Button
            key={d}
            type="button"
            variant="outline"
            className="min-h-13 text-xl tabular-nums"
            onClick={() => press(d)}
          >
            {d}
          </Button>
        ))}
        <Button
          type="button"
          variant="ghost"
          className="min-h-13"
          onClick={() => onChange(value.slice(0, -1))}
        >
          {t.erase}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="min-h-13 text-xl tabular-nums"
          onClick={() => press("0")}
        >
          0
        </Button>
        <Button
          type="button"
          className="min-h-13"
          disabled={busy || value.length < 4}
          onClick={onSubmit}
        >
          {t.confirm}
        </Button>
      </div>
    </div>
  );
}

export function SetPinPage({ session, user }: { session: AuthSession; user: AuthUser }) {
  const { lang } = useErp();
  const t = authText(lang);
  const [pin, setPin] = useState("");
  const [first, setFirst] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = () => {
    if (first === null) {
      setFirst(pin);
      setPin("");
      setError("");
      return;
    }
    if (first !== pin) {
      setFirst(null);
      setPin("");
      return setError(t.pinMismatch);
    }
    setBusy(true);
    session
      .setOwnPin(pin)
      .catch(() => {
        setFirst(null);
        setPin("");
        setError(t.PIN_POLICY);
      })
      .finally(() => setBusy(false));
  };
  return (
    <Panel title={t.pinTitle} intro={`\u2068${user.displayName}\u2069 — ${t.pinIntro}`}>
      <p className="mb-3 font-medium">{first === null ? t.pin : t.confirmPin}</p>
      <PinPad
        value={pin}
        onChange={setPin}
        onSubmit={submit}
        label={first === null ? t.pin : t.confirmPin}
        busy={busy}
      />
      <div className="mt-3">
        <ErrorText>{error}</ErrorText>
      </div>
    </Panel>
  );
}

function SwitchSellerDialog({
  session,
  store,
  onClose,
}: {
  session: AuthSession;
  store: "M01" | "M02";
  onClose: () => void;
}) {
  const { lang } = useErp();
  const t = authText(lang);
  const [sellers, setSellers] = useState<SellerChoice[] | null>(null);
  const [chosen, setChosen] = useState<SellerChoice | null>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void session
      .sellers(store)
      .then(setSellers)
      .catch(() => setError(t.failed));
  }, [session, store, t.failed]);
  const submit = () => {
    if (!chosen) return;
    setBusy(true);
    setError("");
    session
      .switchSeller(store, chosen.id, pin)
      .then(onClose)
      .catch((e: unknown) => {
        const code = e instanceof AuthRequestError ? e.code : "";
        setError(code in t ? String(t[code as keyof typeof t]) : t.failed);
        setPin("");
      })
      .finally(() => setBusy(false));
  };
  return (
    <div
      className="auth-dialog-backdrop fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 sm:pt-20"
      role="dialog"
      aria-modal="true"
      aria-label={t.switchSeller}
    >
      <section className="w-full max-w-md rounded-panel border border-border bg-card p-6">
        <h2 className="text-xl font-semibold">
          {chosen ? (
            <>
              <bdi>{chosen.displayName}</bdi> — {t.enterPin}
            </>
          ) : (
            t.chooseSeller
          )}
        </h2>
        {!chosen ? (
          <ul className="mt-4 grid">
            {sellers?.map((s) => {
              const blocked = s.locked || s.mustChange || !s.pinSet;
              return (
                <li key={s.id} className="border-b border-[var(--hairline)] last:border-b-0">
                  <button
                    type="button"
                    className="flex min-h-13 w-full items-center justify-between gap-3 px-2 text-start text-lg font-medium disabled:opacity-60"
                    disabled={blocked}
                    onClick={() => setChosen(s)}
                  >
                    <bdi>{s.displayName}</bdi>
                    {blocked && (
                      <span className="flex items-center gap-2 text-sm font-normal text-muted-foreground">
                        <span className="ph-attention-dot" aria-hidden="true" />
                        {s.locked ? t.pinLocked : s.mustChange ? t.pendingPassword : t.noPin}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="mt-4">
            <PinPad
              value={pin}
              onChange={setPin}
              onSubmit={submit}
              label={t.enterPin}
              busy={busy}
            />
          </div>
        )}
        <div className="mt-3">
          <ErrorText>{error}</ErrorText>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          {chosen && (
            <Button variant="ghost" onClick={() => (setChosen(null), setPin(""), setError(""))}>
              {t.chooseSeller}
            </Button>
          )}
          <Button variant="outline" onClick={onClose}>
            {t.cancel}
          </Button>
        </div>
      </section>
    </div>
  );
}

function OwnerAlerts({ session }: { session: AuthSession }) {
  const { lang } = useErp();
  const t = authText(lang);
  const [alerts, setAlerts] = useState<OwnerAlert[]>([]);
  const [open, setOpen] = useState(false);
  const load = () =>
    void session
      .alerts()
      .then(setAlerts)
      .catch(() => setAlerts([]));
  useEffect(load, [session]);
  const time = new Intl.DateTimeFormat(lang, {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Africa/Algiers",
  });
  return (
    <div className="relative">
      <Button variant="outline" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        {alerts.length > 0 && <span className="ph-attention-dot" aria-hidden="true" />}
        {t.alerts}
        <span className="tabular-nums">({alerts.length})</span>
      </Button>
      {open && (
        <section className="auth-alerts absolute end-0 z-40 mt-2 w-[min(28rem,calc(100vw-2rem))] rounded-panel border border-border bg-card p-4">
          {alerts.length === 0 ? (
            <p className="text-muted-foreground">{t.noAlerts}</p>
          ) : (
            <ul>
              {alerts.map((a) => (
                <li
                  key={a.id}
                  className="flex items-center justify-between gap-3 border-b border-[var(--hairline)] py-2 last:border-b-0"
                >
                  <span className="grid">
                    <bdi className="font-medium">{a.displayName ?? a.userId}</bdi>
                    <span className="text-sm text-muted-foreground">
                      {t.newDevice} — <bdi dir="ltr">{a.deviceId.slice(0, 8)}</bdi> —{" "}
                      <bdi>{time.format(a.at)}</bdi>
                    </span>
                  </span>
                  <Button variant="ghost" onClick={() => void session.ackAlert(a.id).then(load)}>
                    {t.acknowledge}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

/** Always-visible bar above the ERP: active seller name large, switch, alerts (owner), sign out. */
export function SellerBar({
  session,
  user,
  activeSeller,
}: {
  session: AuthSession;
  user: AuthUser;
  activeSeller: AuthUser | null;
}) {
  const { lang } = useErp();
  const t = authText(lang);
  const [switching, setSwitching] = useState(false);
  const store = deviceStore(user);
  return (
    <div className="seller-bar flex flex-wrap items-center justify-between gap-3 border-b border-border bg-card px-4 py-3">
      <div className="grid min-w-0">
        <span className="text-sm text-muted-foreground">
          {activeSeller ? t.activeSeller : t.device} · {store}
        </span>
        <strong
          className="seller-name truncate text-3xl font-semibold leading-tight"
          data-testid="active-seller"
        >
          <bdi>{activeSeller ? activeSeller.displayName : user.displayName}</bdi>
        </strong>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="lg" onClick={() => setSwitching(true)}>
          {t.switchSeller}
        </Button>
        {activeSeller && (
          <Button variant="outline" onClick={() => void session.clearSeller()}>
            {t.stopSeller}
          </Button>
        )}
        {isOwner(user) && !activeSeller && <OwnerAlerts session={session} />}
        <Button variant="ghost" onClick={() => void session.logout()}>
          {t.signOut}
        </Button>
      </div>
      {switching && (
        <SwitchSellerDialog session={session} store={store} onClose={() => setSwitching(false)} />
      )}
    </div>
  );
}

/** Renders the sign-in flow until the session is ready, then the ERP with the seller bar. */
export function AuthGate({
  session,
  children,
  onSignedIn,
}: {
  session: AuthSession;
  children: (bar: ReactNode) => ReactNode;
  /** Called once after an interactive sign-in (login or first-login setup), not on a resumed session. */
  onSignedIn?: (user: AuthUser) => void;
}) {
  const state = useAuthState(session);
  const { lang } = useErp();
  const previous = useRef(state.phase);
  useEffect(() => {
    const before = previous.current;
    previous.current = state.phase;
    if (state.phase === "ready" && before !== "ready" && before !== "loading")
      onSignedIn?.(state.user);
  }, [state, onSignedIn]);
  useEffect(() => {
    void session.start();
  }, [session]);
  if (state.phase === "loading")
    return (
      <main
        className="min-h-screen bg-background text-foreground grid place-items-center"
        aria-busy="true"
      >
        <p className="text-muted-foreground">{authText(lang).loading}</p>
      </main>
    );
  if (state.phase === "signedOut") return <LoginPage session={session} error={state.error} />;
  if (state.phase === "mustChange")
    return <ChangePasswordPage session={session} user={state.user} />;
  if (state.phase === "setPin") return <SetPinPage session={session} user={state.user} />;
  // Remount the ERP when the acting person changes so every read uses the new identity.
  return (
    <div key={state.activeSeller?.id ?? state.user.id} className="contents">
      {children(
        <SellerBar session={session} user={state.user} activeSeller={state.activeSeller} />,
      )}
    </div>
  );
}
