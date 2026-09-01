import { useEffect, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import LanguageToggle from "./LanguageToggle";
import Skeleton from "./Skeleton";
import { createSuggestion, fetchSuggestions } from "../api/suggestions";
import type { Suggestion, SuggestionCategory } from "../types";
import { formatRelativeTime, useNowTick } from "../utils/time";
import { AlertIcon, BoltIcon, ChevronLeftIcon, SuggestionIcon } from "./icons";

interface Props {
  onBack: () => void;
}

const CATEGORIES: SuggestionCategory[] = ["new_feature", "improvement", "bug", "design", "other"];

export default function SuggestionsPage({ onBack }: Props) {
  const { t } = useTranslation();
  const now = useNowTick();
  const [message, setMessage] = useState("");
  const [category, setCategory] = useState<SuggestionCategory>("improvement");
  const [messageError, setMessageError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [submitError, setSubmitError] = useState(false);

  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState(false);

  // Scroll-driven parallax for the decorative backdrop below — same
  // technique as MapBackdrop's: a direct style write on every scroll frame
  // (batched via rAF) instead of React state, since this element re-renders
  // on every scroll frame otherwise for a transform string nothing else in
  // the tree reads. Skipped under prefers-reduced-motion and on touch
  // devices, where it costs more than it adds.
  const parallaxRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    if (reduced || coarse) return;

    let frame: number | null = null;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        const el = parallaxRef.current;
        if (el) el.style.transform = `translate3d(0, ${-(window.scrollY * 0.12)}px, 0)`;
        frame = null;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  // Loaded once on mount — this is a static feedback wall, not something
  // that needs live polling like the report board does.
  useEffect(() => {
    let cancelled = false;
    fetchSuggestions()
      .then((data) => {
        if (!cancelled) setSuggestions(data);
      })
      .catch(() => {
        if (!cancelled) setListError(true);
      })
      .finally(() => {
        if (!cancelled) setListLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

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
      const created = await createSuggestion({ message: trimmed, category });
      // Shows up under the tab immediately — no need to wait for a refetch
      // to see your own suggestion land at the top of the list.
      setSuggestions((prev) => [created, ...prev]);
      setSuccess(true);
    } catch {
      setSubmitError(true);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-ink-950">
      {/* Decorative only — a soft amber bloom that drifts slightly slower
          than the page scrolls, same parallax technique as the main app's
          MapBackdrop. Fixed + oversized (inset-[-6%]) so the translated
          layer never exposes an edge, and pointer-events-none/aria-hidden
          since it's pure background, never interactive. */}
      <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <div ref={parallaxRef} className="absolute inset-[-6%]" style={{ transform: "translate3d(0, 0, 0)" }}>
          <div className="absolute left-1/2 top-0 h-[520px] w-[520px] -translate-x-1/2 -translate-y-1/3 rounded-full bg-amber-500/10 blur-[120px]" />
        </div>
      </div>

      <div className="relative z-10">
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

          <div className="mb-3 mt-8">
            <h2 className="font-display text-base font-bold text-grey-900">{t("suggestions.listTitle")}</h2>
            <p className="text-xs text-grey-500">{t("suggestions.listSubtitle")}</p>
          </div>

          <section className="panel overflow-hidden">
            {listLoading ? (
              <ul>
                {[0, 1, 2].map((i) => (
                  <li key={i} className="border-t border-black/8 px-4 py-3.5 first:border-t-0">
                    <Skeleton className="mb-2 h-3 w-20" />
                    <Skeleton className="h-4 w-full" />
                  </li>
                ))}
              </ul>
            ) : listError ? (
              <div className="flex items-center gap-2 px-4 py-6 text-center text-sm text-rust-400">
                <AlertIcon width={14} height={14} />
                {t("suggestions.listError")}
              </div>
            ) : suggestions.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-grey-500">{t("suggestions.listEmpty")}</p>
            ) : (
              <ul>
                {suggestions.map((s) => (
                  <li key={s.id} className="border-t border-black/8 px-4 py-3.5 first:border-t-0">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="inline-flex items-center rounded-pill bg-amber-500/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-500">
                        {t(`suggestions.category.${toCamel(s.category)}`)}
                      </span>
                      <span className="font-mono text-[11px] text-grey-500">
                        {formatRelativeTime(s.createdAt, now, t)}
                      </span>
                    </div>
                    <p className="mt-1.5 whitespace-pre-line text-sm text-grey-900">{s.message}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </main>
      </div>
    </div>
  );
}

function toCamel(category: SuggestionCategory): string {
  return category.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}
