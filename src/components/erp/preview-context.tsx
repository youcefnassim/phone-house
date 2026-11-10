import { useState, useEffect, type ReactNode } from "react";
import type { Scope } from "@/domain/erp";
import { hydrateTestWorkspace, useTestWorkspace, reviewActor } from "@/data/test-workspace";
import { type Language, type MessageKey, languageDir, translate } from "@/i18n";
import { ErpContext as Context } from "./ui-context";
export { useErp, useT } from "./ui-context";
const storedLang = (): Language => {
  const value = localStorage.getItem("ph-lang");
  return value === "ar-DZ" || value === "fr-DZ" || value === "en" ? value : "fr-DZ";
};
export function ErpProvider({ children }: { children: ReactNode }) {
  const [requestedScope, setScope] = useState<Scope>("ALL");
  const ws = useTestWorkspace();
  const actor = reviewActor(ws);
  const scope: Scope = actor?.role === "SUPER_ADMIN" ? requestedScope : (actor?.stores[0] ?? "M01");
  const [dark, setDark] = useState(false);
  const [lang, setLangState] = useState<Language>("fr-DZ");
  useEffect(() => {
    setDark(localStorage.getItem("ph-theme") === "dark");
    setLangState(storedLang());
    void hydrateTestWorkspace();
  }, []);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);
  useEffect(() => {
    const dir = languageDir(lang);
    document.documentElement.lang = lang;
    document.documentElement.dir = dir;
    document.documentElement.classList.toggle("rtl", dir === "rtl");
  }, [lang]);
  const setLang = (value: Language) => {
    localStorage.setItem("ph-lang", value);
    setLangState(value);
  };
  const t = (key: MessageKey, params?: Record<string, string>) => translate(lang, key, params);
  return (
    <Context.Provider
      value={{
        scope,
        setScope,
        dark,
        toggleTheme: () =>
          setDark((value) => {
            localStorage.setItem("ph-theme", value ? "light" : "dark");
            return !value;
          }),
        lang,
        setLang,
        t,
      }}
    >
      {children}
    </Context.Provider>
  );
}
