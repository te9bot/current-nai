import { useTranslation } from "react-i18next";
import LanguageToggle from "./LanguageToggle";
import { BoltIcon, HelpIcon, PlusIcon } from "./icons";

interface Props {
  onReportClick: () => void;
  onHelpClick: () => void;
}

export default function Header({ onReportClick, onHelpClick }: Props) {
  const { t } = useTranslation();

  return (
    <header className="sticky top-0 z-30 border-b border-black/8 bg-ink-950/75 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:px-6">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-amber-500 text-ink-onAccent shadow-glow-amber-soft">
            <BoltIcon width={20} height={20} />
          </span>
          <div className="leading-none">
            <h1 className="font-display text-lg font-extrabold tracking-tight text-grey-900">
              {t("app.name")}
            </h1>
            <p className="hidden text-[11px] text-grey-500 sm:block">{t("app.tagline")}</p>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          <LanguageToggle />
          <button
            type="button"
            onClick={onHelpClick}
            aria-label={t("onboarding.helpButton")}
            title={t("onboarding.helpButton")}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-pill text-grey-500 transition-colors duration-fast ease-standard hover:bg-black/10 hover:text-grey-900"
          >
            <HelpIcon width={18} height={18} />
          </button>
          <button
            type="button"
            onClick={onReportClick}
            className="inline-flex h-10 items-center gap-1.5 rounded-pill bg-amber-500 px-3.5 text-sm font-semibold text-ink-onAccent transition-colors duration-fast ease-standard hover:bg-amber-400 active:scale-[.97] sm:px-4"
          >
            <PlusIcon width={16} height={16} />
            <span className="hidden sm:inline">{t("header.reportButton")}</span>
          </button>
        </div>
      </div>
    </header>
  );
}
