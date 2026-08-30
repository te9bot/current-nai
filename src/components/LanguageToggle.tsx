import { useTranslation } from "react-i18next";
import clsx from "../utils/clsx";

export default function LanguageToggle() {
  const { i18n, t } = useTranslation();
  const isBangla = i18n.language.startsWith("bn");

  function setLang(lang: "en" | "bn") {
    i18n.changeLanguage(lang);
  }

  return (
    <div
      role="group"
      aria-label="Language"
      className="inline-flex items-center rounded-pill border border-black/10 bg-ink-800/80 p-1 text-xs font-semibold"
    >
      <button
        type="button"
        onClick={() => setLang("en")}
        aria-pressed={!isBangla}
        className={clsx(
          "rounded-pill px-3 py-1.5 transition-colors duration-fast ease-standard",
          !isBangla ? "bg-amber-500 text-ink-onAccent shadow-glow-amber-soft" : "text-grey-400 hover:text-grey-900"
        )}
      >
        {t("header.switchToEnglish")}
      </button>
      <button
        type="button"
        onClick={() => setLang("bn")}
        aria-pressed={isBangla}
        className={clsx(
          "rounded-pill px-3 py-1.5 font-bn transition-colors duration-fast ease-standard",
          isBangla ? "bg-amber-500 text-ink-onAccent shadow-glow-amber-soft" : "text-grey-400 hover:text-grey-900"
        )}
      >
        {t("header.switchToBangla")}
      </button>
    </div>
  );
}
