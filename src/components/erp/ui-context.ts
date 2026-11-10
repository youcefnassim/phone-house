import { createContext, useContext } from "react";
import type { Scope } from "@/domain/erp";
import type { Language, MessageKey } from "@/i18n";

export interface UiContext {
  scope: Scope;
  setScope: (scope: Scope) => void;
  dark: boolean;
  toggleTheme: () => void;
  lang: Language;
  setLang: (lang: Language) => void;
  t: (key: MessageKey, params?: Record<string, string>) => string;
}

// Keep identity separate from the refreshed provider component. Preserve it
// even if this module itself is updated while a mounted tree still uses it.
const createUiContext = () => createContext<UiContext | undefined>(undefined);
export const ErpContext: ReturnType<typeof createUiContext> =
  import.meta.hot?.data?.erpContext ?? createUiContext();
if (import.meta.hot?.data) import.meta.hot.data.erpContext = ErpContext;

export function useErp() {
  const value = useContext(ErpContext);
  if (!value) throw new Error("ERP context missing");
  return value;
}
export function useT() {
  const { t } = useErp();
  return (key: string, params?: Record<string, string>) => t(key as MessageKey, params);
}
