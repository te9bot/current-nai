import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import LanguageToggle from "./LanguageToggle";
import { createSuggestion } from "../api/suggestions";
import type { SuggestionCategory } from "../types";
import { AlertIcon, BoltIcon, ChevronLeftIcon, SuggestionIcon } from "./icons";

interface Props {
  onBack: () => void;
}

const CATEGORIES: SuggestionCategory[] = ["new_feature", "improvement", "bug", "design", "other"];

export default function SuggestionsPage({ onBack }: Props) {
  const { t } = useTranslation();
  const [message, setMessage] = useState("");
  const [category, setCategory] = useState<SuggestionCategory>("improvement");
  const [messageError, setMessageError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [submitError, setSubmitError] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = message.trim();
    if (!trimmed) {
      setMessageError(true);
      return;
    }

    setMessageError(false);
    setSubmitting(true);
    setSubmitError(false);
    try {
      await createSuggestion({ message: trimmed, category });
      setSuccess(true);
    } catch {
      setSubmitError(true);
    } finally {
      setSubmitting(false);
    }
  }

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
            <SuggestionIcon width={20} height={20} />
          </span>
          <div>
            <h1 className="font-display text-lg font-extrabold tracking-tight text-grey-900">
              {t("suggestions.title")}
            </h1>
            <p className="text-xs text-grey-500">{t("suggestions.subtitle")}</p>
          </div>
        </div>

        <section className="panel overflow-hidden">
          {success ? (
            <div className="px-5 py-10 text-center">
              <span className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-pill bg-amber-500 text-ink-onAccent">
                <BoltIcon width={18} height={18} />
              </span>
              <p className="font-display text-base font-semibold text-leaf-400">{t("suggestions.success")}</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4 px-5 py-5">
              <div>
                <label htmlFor="suggestion-message" className="mb-1.5 block text-xs font-semibold text-grey-400">
                  {t("suggestions.messageLabel")}
                </label>
                <textarea
                  id="suggestion-message"
                  value={message}
                  onChange={(e) => {
                    setMessage(e.target.value);
                    if (messageError) setMessageError(false);
                  }}
                  placeholder={t("suggestions.messagePlaceholder")}
                  rows={5}
                  maxLength={2000}
                  className={`w-full resize-none rounded-md border bg-ink-800 px-3 py-2 text-sm text-grey-900 placeholder:text-grey-600 outline-none transition-colors duration-fast ${
                    messageError ? "border-rust-500" : "border-black/10 focus:border-black/30"
                  }`}
                />
                {messageError && (
                  <p className="mt-1 text-[11px] text-rust-400">{t("suggestions.validation.messageRequired")}</p>
                )}
              </div>

              <div>
                <label htmlFor="suggestion-category" className="mb-1.5 block text-xs font-semibold text-grey-400">
                  {t("suggestions.categoryLabel")}
                </label>
                <select
                  id="suggestion-category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value as SuggestionCategory)}
                  className="h-11 w-full rounded-md border border-black/10 bg-ink-800 px-3 text-sm text-grey-900 outline-none transition-colors duration-fast focus:border-black/30"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {t(`suggestions.category.${toCamel(c)}`)}
                    </option>
                  ))}
                </select>
              </div>

              {submitError && (
                <div className="flex items-center gap-2 rounded-md border border-rust-600/30 bg-rust-500/10 px-3 py-2 text-xs text-rust-400">
                  <AlertIcon width={14} height={14} />
                  {t("suggestions.errorGeneric")}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="mt-1 h-12 rounded-pill bg-amber-500 font-display text-sm font-bold uppercase tracking-wide text-ink-onAccent transition-colors duration-fast hover:bg-amber-400 disabled:opacity-50"
              >
                {submitting ? t("suggestions.submitting") : t("suggestions.submit")}
              </button>

              <p className="text-center text-[11px] leading-relaxed text-grey-600">{t("suggestions.privacyNote")}</p>
            </form>
          )}
        </section>
      </main>
    </div>
  );
}

function toCamel(category: SuggestionCategory): string {
  return category.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}
