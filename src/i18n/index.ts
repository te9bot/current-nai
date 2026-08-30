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
    fallbackLng: "bn",
    supportedLngs: SUPPORTED_LANGUAGES as unknown as string[],
    interpolation: { escapeValue: false },
    detection: {
      order: ["localStorage", "navigator"],
      caches: ["localStorage"],
      lookupLocalStorage: "current-nai-language",
    },
  })
  .then(() => {
    // Bangla is the default for every first-time visitor, regardless of
    // browser locale — the language toggle in the header still lets anyone
    // switch to English. Runs only once, after init fully resolves, so it
    // can never race a later manual changeLanguage() call from the language
    // toggle (calling changeLanguage before init resolves gets queued
    // internally and could otherwise apply *after* — and clobber — a user's
    // own selection).
    const hasStoredChoice = typeof window !== "undefined" && window.localStorage.getItem("current-nai-language");
    if (!hasStoredChoice) {
      i18n.changeLanguage("bn");
    }
  });

export default i18n;
