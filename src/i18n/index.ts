import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import en from "../locales/en.json";
import bn from "../locales/bn.json";

export const SUPPORTED_LANGUAGES = ["en", "bn"] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      bn: { translation: bn },
    },
    fallbackLng: "en",
    supportedLngs: SUPPORTED_LANGUAGES as unknown as string[],
    interpolation: { escapeValue: false },
    detection: {
      order: ["localStorage", "navigator"],
      caches: ["localStorage"],
      lookupLocalStorage: "current-nai-language",
    },
  })
  .then(() => {
    // Browser locale bn-BD (or any bn-*) should default to Bangla when the
    // user has never explicitly chosen a language before. Runs only once,
    // after init fully resolves, so it can never race a later manual
    // changeLanguage() call from the language toggle (calling
    // changeLanguage before init resolves gets queued internally and could
    // otherwise apply *after* — and clobber — a user's own selection).
    const hasStoredChoice = typeof window !== "undefined" && window.localStorage.getItem("current-nai-language");
    if (!hasStoredChoice) {
      const browserLocale = typeof navigator !== "undefined" ? navigator.language : "en";
      if (browserLocale?.toLowerCase().startsWith("bn")) {
        i18n.changeLanguage("bn");
      }
    }
  });

export default i18n;
