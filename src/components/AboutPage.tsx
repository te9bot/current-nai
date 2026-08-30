import { useTranslation } from "react-i18next";
import About from "./About";
import LanguageToggle from "./LanguageToggle";
import { BoltIcon, ChevronLeftIcon } from "./icons";

interface Props {
  onBack: () => void;
}

export default function AboutPage({ onBack }: Props) {
  const { t } = useTranslation();

  return (
    <div className="relative min-h-screen bg-ink-950">
      <header className="border-b border-black/8 bg-ink-950/75 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-3xl items-center gap-3 px-4 sm:px-6">
          <button
            type="button"
            onClick={onBack}
            className="flex h-10 items-center gap-1.5 rounded-pill px-2 text-sm font-semibold text-grey-400 transition-colors duration-fast hover:text-grey-900"
          >
            <ChevronLeftIcon width={18} height={18} />
            {t("about.back")}
          </button>
          <div className="ml-auto">
            <LanguageToggle />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
        <div className="mb-6 flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-amber-500 text-ink-onAccent shadow-glow-amber-soft">
            <BoltIcon width={20} height={20} />
          </span>
          <h1 className="font-display text-lg font-extrabold tracking-tight text-grey-900">{t("app.name")}</h1>
        </div>

        <About />
      </main>
    </div>
  );
}
