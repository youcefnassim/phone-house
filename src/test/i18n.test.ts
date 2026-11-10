import { describe, it, expect } from "vitest";
import {
  dictionaries,
  languages,
  languageDir,
  translate,
  type Language,
  type MessageKey,
} from "@/i18n";

describe("three-language dictionary", () => {
  const codes: Language[] = ["en", "fr-DZ", "ar-DZ"];
  it("declares exactly ar-DZ, fr-DZ and en", () => {
    expect(languages.map((l) => l.code).sort()).toEqual(["ar-DZ", "en", "fr-DZ"]);
  });
  it("marks only ar-DZ as RTL", () => {
    expect(languageDir("ar-DZ")).toBe("rtl");
    expect(languageDir("fr-DZ")).toBe("ltr");
    expect(languageDir("en")).toBe("ltr");
  });
  it("every language defines every key with non-empty text", () => {
    const keys = Object.keys(dictionaries.en) as MessageKey[];
    expect(keys.length).toBeGreaterThan(80);
    for (const lang of codes) {
      for (const key of keys) {
        const value = dictionaries[lang][key];
        expect(typeof value, `${lang}:${key}`).toBe("string");
        expect(value.trim().length, `${lang}:${key}`).toBeGreaterThan(0);
      }
    }
  });
  it("navigation keys exist for all 18 routes plus 4 groups in every language", () => {
    const navKeys: MessageKey[] = [
      "nav.group.workspace",
      "nav.group.inventory",
      "nav.group.business",
      "nav.group.administration",
      "nav.overview",
      "nav.pos",
      "nav.cash",
      "nav.phones",
      "nav.accessories",
      "nav.catalog",
      "nav.transfers",
      "nav.customers",
      "nav.debts",
      "nav.suppliers",
      "nav.purchases",
      "nav.expenses",
      "nav.facility",
      "nav.sav",
      "nav.reports",
      "nav.users",
      "nav.audit",
      "nav.settings",
    ];
    for (const lang of codes)
      for (const key of navKeys) expect(dictionaries[lang][key], `${lang}:${key}`).toBeTruthy();
  });
  it("translates and interpolates parameters", () => {
    expect(translate("en", "nav.pos")).toBe("Point of sale");
    expect(translate("fr-DZ", "nav.pos")).toBe("Point de vente");
    expect(translate("ar-DZ", "nav.pos")).toBe("نقطة البيع");
    expect(translate("en", "shared.openRecord", { id: "TR-001" })).toBe("Open TR-001");
  });
  it("Arabic strings contain Arabic script", () => {
    expect(dictionaries["ar-DZ"]["nav.customers"]).toMatch(/[؀-ۿ]/);
    expect(dictionaries["ar-DZ"]["dash.title"]).toMatch(/[؀-ۿ]/);
  });
  it("store names keep M01/M02 identifiers in every language", () => {
    for (const lang of codes) {
      expect(dictionaries[lang]["shell.store1"]).toContain("M01");
      expect(dictionaries[lang]["shell.store2"]).toContain("M02");
    }
  });
});
