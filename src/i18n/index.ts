import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import en from "../locales/en.json";
import bn from "../locales/bn.json";

export const SUPPORTED_LANGUAGES = ["en", "bn"] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

// Tried lazy-loading English on demand to shave ~5KB gzip off the main
// bundle, but it meant either delaying first paint to await it (defeating
// the point) or a multi-second flash of stale Bangla text on toggle/return
// visits while react-i18next's re-render caught up component by component.
// Not worth the correctness risk for this little: both ship eagerly.
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
      // "navigator" deliberately left out of the order: browser locale
      // should never decide the default (Bangla always should, regardless
      // of the visitor's browser language) — the toggle is how anyone
      // switches to English. localStorage is the *only* source consulted,
      // so a value only ever ends up here from an explicit toggle click,
      // never from silently caching whatever the browser's locale detector
      // guessed during init (which used to happen before this value could
      // even be checked, making every non-Bangla browser look like it had
      // already "chosen" English).
      order: ["localStorage"],
      caches: ["localStorage"],
      lookupLocalStorage: "current-nai-language",
    },
  });

export default i18n;
