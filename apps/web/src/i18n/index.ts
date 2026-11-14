import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";

export const languages = { en: "English", de: "Deutsch" } as const;
export type Language = keyof typeof languages;

// Every file in src/locales/<language>/<namespace>.ts is picked up here.
const modules = import.meta.glob<{ default: object }>("../locales/*/*.ts", {
  eager: true,
});
const resources: Record<string, Record<string, object>> = {};
for (const [path, module] of Object.entries(modules)) {
  const [, language = "", namespace = ""] =
    path.match(/locales\/(\w+)\/(\w+)\.ts$/) ?? [];
  resources[language] = { ...resources[language], [namespace]: module.default };
}

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    supportedLngs: Object.keys(languages),
    nonExplicitSupportedLngs: true,
    fallbackLng: "en",
    defaultNS: "common",
    interpolation: { escapeValue: false },
    detection: {
      order: ["localStorage", "navigator"],
      lookupLocalStorage: "language",
      caches: ["localStorage"],
    },
  });

const syncDocumentLanguage = (language: string) => {
  document.documentElement.lang = language;
};
syncDocumentLanguage(i18n.resolvedLanguage ?? "en");
i18n.on("languageChanged", syncDocumentLanguage);

export default i18n;
