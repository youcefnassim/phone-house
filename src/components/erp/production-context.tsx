import { useEffect, useState, type ReactNode } from "react";
import { languageDir, translate, type Language } from "@/i18n";
import type { Scope } from "@/domain/erp";
import { ErpContext } from "./ui-context";
export { useErp, useT } from "./ui-context";

/** Presentation preferences only. No identity, fixtures or business storage. */
export function ErpProvider({ children }: { children: ReactNode }) {
  const [scope, setScope] = useState<Scope>("M01");
  const [lang, setLanguage] = useState<Language>("fr-DZ");
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const saved = localStorage.getItem("ph-lang");
    if (saved === "en" || saved === "fr-DZ" || saved === "ar-DZ") setLanguage(saved);
    setDark(localStorage.getItem("ph-theme") === "dark");
  }, []);
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = languageDir(lang);
    document.documentElement.classList.toggle("rtl", languageDir(lang) === "rtl");
    document.documentElement.classList.toggle("dark", dark);
  }, [lang, dark]);
  return (
    <ErpContext.Provider
      value={{
        scope,
        setScope,
        lang,
        dark,
        setLang: (value) => {
          localStorage.setItem("ph-lang", value);
          setLanguage(value);
        },
        toggleTheme: () =>
          setDark((value) => {
            localStorage.setItem("ph-theme", value ? "light" : "dark");
            return !value;
          }),
        t: (key, args) => translate(lang, key, args),
      }}
    >
      {children}
    </ErpContext.Provider>
  );
}
