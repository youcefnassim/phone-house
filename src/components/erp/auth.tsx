import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { LockKeyhole, ArrowRight, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useErp } from "./context";
import { BrandLogo } from "./brand-logo";

const copy = {
  en: {
    eyebrow: "INTERNAL WORKSPACE · TRACK B",
    title: "Welcome back",
    sub: "Sign in to your authorized store workspace.",
    email: "Email address",
    password: "Password",
    pwPh: "Enter your password",
    submit: "Sign in",
    emailErr: "Enter a valid email address.",
    pwErr: "Password must contain at least 8 characters.",
    notConnected: "Sign-in is not connected yet. No credentials were sent or stored.",
    preview: "Frontend preview only. Do not enter production credentials.",
    open: "Open test workspace",
    footer: "TEST ENVIRONMENT · No operational authentication",
  },
  "fr-DZ": {
    eyebrow: "ESPACE INTERNE · TRACK B",
    title: "Bon retour",
    sub: "Connectez-vous à l’espace de votre magasin autorisé.",
    email: "Adresse e-mail",
    password: "Mot de passe",
    pwPh: "Saisissez votre mot de passe",
    submit: "Se connecter",
    emailErr: "Saisissez une adresse e-mail valide.",
    pwErr: "Le mot de passe doit contenir au moins 8 caractères.",
    notConnected:
      "La connexion n’est pas encore branchée. Aucun identifiant n’a été envoyé ni enregistré.",
    preview: "Aperçu interface uniquement. N’entrez pas d’identifiants réels.",
    open: "Ouvrir l’espace de test",
    footer: "ENVIRONNEMENT DE TEST · Aucune authentification opérationnelle",
  },
  "ar-DZ": {
    eyebrow: "مساحة داخلية · TRACK B",
    title: "مرحبًا بعودتك",
    sub: "سجّل الدخول إلى مساحة متجرك المصرّح بها.",
    email: "البريد الإلكتروني",
    password: "كلمة المرور",
    pwPh: "أدخل كلمة المرور",
    submit: "تسجيل الدخول",
    emailErr: "أدخل بريدًا إلكترونيًا صالحًا.",
    pwErr: "يجب أن تحتوي كلمة المرور على 8 أحرف على الأقل.",
    notConnected: "تسجيل الدخول غير موصول بعد. لم تُرسل أو تُحفظ أي بيانات اعتماد.",
    preview: "معاينة الواجهة فقط. لا تُدخل بيانات اعتماد حقيقية.",
    open: "فتح مساحة الاختبار",
    footer: "بيئة اختبار · لا توجد مصادقة تشغيلية",
  },
} as const;

export function Auth() {
  const { lang } = useErp();
  const c = copy[lang] ?? copy["fr-DZ"];
  const [message, setMessage] = useState("");
  const [errors, setErrors] = useState<{
    email?: string | undefined;
    password?: string | undefined;
  }>({});
  return (
    <div className="auth-page">
      <div className="auth-brand">
        <BrandLogo />
      </div>
      <div className="auth-content">
        <div className="eyebrow">{c.eyebrow}</div>
        <h1>
          {c.title}
          <span className="heading-dot">.</span>
        </h1>
        <p>{c.sub}</p>
        <form
          className="draft-form"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const email = String(f.get("email") ?? "").trim();
            const pw = String(f.get("password") ?? "");
            const next = {
              email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? undefined : c.emailErr,
              password: pw.length >= 8 ? undefined : c.pwErr,
            };
            setErrors(next);
            setMessage(next.email || next.password ? "" : c.notConnected);
          }}
        >
          <label>
            {c.email}
            <input
              name="email"
              type="email"
              dir="ltr"
              placeholder="name@example.com"
              autoComplete="username"
              aria-invalid={!!errors.email}
              aria-describedby={errors.email ? "auth-email-err" : undefined}
            />
          </label>
          {errors.email && (
            <span id="auth-email-err" className="field-error" role="alert">
              {errors.email}
            </span>
          )}
          <label>
            {c.password}
            <input
              name="password"
              type="password"
              dir="ltr"
              placeholder={c.pwPh}
              autoComplete="current-password"
              aria-invalid={!!errors.password}
              aria-describedby={errors.password ? "auth-pw-err" : undefined}
            />
          </label>
          {errors.password && (
            <span id="auth-pw-err" className="field-error" role="alert">
              {errors.password}
            </span>
          )}
          <Button type="submit">
            <LockKeyhole />
            {c.submit}
          </Button>
        </form>
        {message && (
          <div className="safety-notice" role="status">
            {message}
          </div>
        )}
        <div className="auth-preview">
          <ShieldCheck />
          <span>{c.preview}</span>
        </div>
        <Button variant="outline" asChild>
          <Link to="/">
            {c.open}
            <ArrowRight />
          </Link>
        </Button>
      </div>
      <span className="auth-footer">{c.footer}</span>
    </div>
  );
}
