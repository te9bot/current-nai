import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import MapView from "./MapView";
import { BoltIcon, CheckCircleIcon, ChevronLeftIcon, ChevronRightIcon, LocateIcon, XIcon } from "./icons";
import type { Report } from "../types";
import { toLocalizedDigits } from "../utils/time";
import clsx from "../utils/clsx";

interface Props {
  /** An early bail-out (X, Escape, backdrop click, or the welcome screen's
   *  Skip link) — the guide is gone immediately, never auto-shown again. */
  onSkip: () => void;
  /** All 5 steps were read through and "Finish" was tapped — the guide stays
   *  open on the closing screen, but should never auto-show again either. */
  onFinish: () => void;
  /** Final screen's primary CTA — hands off to the real report form. */
  onReportClick: () => void;
  /** Final screen's secondary CTA — just closes, no report form. */
  onLater: () => void;
}

const TOTAL_STEPS = 5;
const WELCOME = 0;
const FINAL = TOTAL_STEPS + 1;

// A fixed illustrative point in Dhanmondi — not derived from any real
// report — used only so Step 3 can show the actual MapView component
// (matching the app's real map) instead of a hand-drawn fake one.
const EXAMPLE_FOCUS = { lat: 23.7461, lng: 90.3742 };
const EMPTY_REPORTS: Report[] = [];

export default function OnboardingGuide({ onSkip, onFinish, onReportClick, onLater }: Props) {
  const { t } = useTranslation();
  const [screen, setScreen] = useState(WELCOME);
  const dialogRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onSkip();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onSkip]);

  function handleBackdropMouseDown(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) onSkip();
  }

  function next() {
    setScreen((s) => {
      const upcoming = Math.min(s + 1, FINAL);
      if (upcoming === FINAL) onFinish();
      return upcoming;
    });
  }

  function back() {
    setScreen((s) => Math.max(s - 1, WELCOME));
  }

  const isStep = screen >= 1 && screen <= TOTAL_STEPS;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink-950/35 backdrop-blur-[2px] sm:items-center sm:p-4"
      onMouseDown={handleBackdropMouseDown}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="max-h-[92vh] w-full overflow-y-auto rounded-t-xl border border-black/10 bg-ink-900/95 shadow-sheet backdrop-blur outline-none sm:max-w-md sm:rounded-xl sm:shadow-callout"
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-heading"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-black/8 bg-ink-900/95 px-5 py-3.5 backdrop-blur">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-amber-500 text-ink-onAccent">
              <BoltIcon width={14} height={14} />
            </span>
            <span className="font-display text-sm font-bold text-grey-900">{t("app.name")}</span>
          </div>
          {screen !== FINAL && (
            <button
              type="button"
              onClick={onSkip}
              aria-label={t("onboarding.close")}
              className="flex h-11 w-11 items-center justify-center rounded-pill text-grey-400 hover:bg-black/10 hover:text-grey-900"
            >
              <XIcon width={16} height={16} />
            </button>
          )}
        </div>

        <div className="px-5 py-5">
          {screen === WELCOME && (
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-amber-500 text-ink-onAccent shadow-glow-amber">
                <BoltIcon width={26} height={26} />
              </div>
              <h2 id="onboarding-heading" className="mb-2 font-display text-xl font-extrabold text-grey-900">
                {t("onboarding.welcomeTitle")}
              </h2>
              <p className="text-sm text-grey-500">{t("onboarding.welcomeSubtitle")}</p>
            </div>
          )}

          {screen === 1 && (
            <StepShell screen={screen} title={t("onboarding.step1Title")} body={t("onboarding.step1Body")}>
              <div className="rounded-md border border-black/10 bg-ink-800 p-3 text-sm">
                <ExampleRow
                  position="first"
                  label={t("onboarding.step1ExampleDivision")}
                  value={t("onboarding.step1ValueDivision")}
                />
                <ExampleRow
                  position="middle"
                  label={t("onboarding.step1ExampleDistrict")}
                  value={t("onboarding.step1ValueDistrict")}
                />
                <ExampleRow
                  position="last"
                  label={t("onboarding.step1ExampleArea")}
                  value={t("onboarding.step1ValueArea")}
                />
              </div>
              <p className="mt-2 text-[11px] text-grey-600">{t("onboarding.step1Helper")}</p>
            </StepShell>
          )}

          {screen === 2 && (
            <StepShell screen={screen} title={t("onboarding.step2Title")} body={t("onboarding.step2Body1")}>
              <div
                aria-hidden
                className="flex h-11 w-full items-center justify-center gap-2 rounded-md border border-black/10 bg-ink-800 text-sm font-semibold text-grey-900"
              >
                <LocateIcon width={16} height={16} />
                {t("form.useMyLocation")}
              </div>
              <p className="mt-3 text-sm text-grey-500">{t("onboarding.step2Body2")}</p>
              <div className="mt-3 rounded-md border border-leaf-600/20 bg-leaf-500/5 p-3 text-xs text-grey-500">
                {t("onboarding.step2Privacy")}
              </div>
            </StepShell>
          )}

          {screen === 3 && (
            <StepShell screen={screen} title={t("onboarding.step3Title")} body={t("onboarding.step3Body")}>
              <div className="mb-3 overflow-hidden rounded-md border border-black/10">
                <MapView reports={EMPTY_REPORTS} focus={EXAMPLE_FOCUS} focusLabel={t("onboarding.step1ValueArea")} />
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-md border border-black/10 bg-ink-800 p-2.5">
                  <p className="text-grey-500">{t("onboarding.step3AreaLabel")}</p>
                  <p className="font-semibold text-grey-900">{t("onboarding.step1ValueArea")}</p>
                </div>
                <div className="rounded-md border border-black/10 bg-ink-800 p-2.5">
                  <p className="text-grey-500">{t("onboarding.step3PinLabel")}</p>
                  <p className="font-semibold text-grey-900">{t("onboarding.step3PinValue")}</p>
                </div>
              </div>
            </StepShell>
          )}

          {screen === 4 && (
            <StepShell screen={screen} title={t("onboarding.step4Title")} body={t("onboarding.step4Body")}>
              <div aria-hidden className="grid grid-cols-2 gap-3 rounded-md border border-rust-600/20 bg-rust-500/5 p-3">
                <div>
                  <p className="mb-1 text-[11px] text-grey-400">{t("form.date")}</p>
                  <div className="h-9 rounded-md border border-black/10 bg-ink-800" />
                </div>
                <div>
                  <p className="mb-1 text-[11px] text-grey-400">{t("form.startTime")}</p>
                  <div className="h-9 rounded-md border border-black/10 bg-ink-800" />
                </div>
              </div>
              <div className="mt-3">
                <p className="mb-1 text-xs font-semibold text-grey-400">{t("form.note")}</p>
                <div className="rounded-md border border-black/10 bg-ink-800 p-2.5 text-xs italic text-grey-500">
                  <span className="mr-1 not-italic font-semibold text-grey-600">
                    {t("onboarding.step4ExampleLabel")}:
                  </span>
                  {t("onboarding.step4Example")}
                </div>
              </div>
            </StepShell>
          )}

          {screen === 5 && (
            <StepShell screen={screen} title={t("onboarding.step5Title")} body={t("onboarding.step5Body")}>
              <div
                aria-hidden
                className="flex h-12 items-center justify-center rounded-pill bg-amber-500 font-display text-sm font-bold uppercase tracking-wide text-ink-onAccent"
              >
                {t("form.submit")}
              </div>
            </StepShell>
          )}

          {screen === FINAL && (
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-leaf-500 text-ink-onAccent">
                <CheckCircleIcon width={26} height={26} />
              </div>
              <h2 id="onboarding-heading" className="mb-2 font-display text-xl font-extrabold text-grey-900">
                {t("onboarding.finalTitle")}
              </h2>
              <p className="mb-5 text-sm text-grey-500">{t("onboarding.finalSubtitle")}</p>
              <button
                type="button"
                onClick={onReportClick}
                className="mb-2 h-12 w-full rounded-pill bg-amber-500 font-display text-sm font-bold uppercase tracking-wide text-ink-onAccent transition-colors duration-fast ease-standard hover:bg-amber-400"
              >
                {t("onboarding.reportCta")}
              </button>
              <button
                type="button"
                onClick={onLater}
                className="h-11 w-full rounded-pill text-sm font-semibold text-grey-500 hover:text-grey-900"
              >
                {t("onboarding.laterCta")}
              </button>
            </div>
          )}
        </div>

        {screen === WELCOME && (
          <div className="flex flex-col gap-2 px-5 pb-5">
            <button
              type="button"
              onClick={next}
              className="h-12 w-full rounded-pill bg-amber-500 font-display text-sm font-bold uppercase tracking-wide text-ink-onAccent transition-colors duration-fast ease-standard hover:bg-amber-400"
            >
              {t("onboarding.next")}
            </button>
            <button
              type="button"
              onClick={onSkip}
              className="flex h-11 items-center justify-center text-xs font-semibold text-grey-500 hover:text-grey-900"
            >
              {t("landing.skip")}
            </button>
          </div>
        )}

        {isStep && (
          <div className="sticky bottom-0 border-t border-black/8 bg-ink-900/95 px-5 py-4 backdrop-blur">
            <div className="mb-3 flex items-center justify-center gap-1.5" aria-hidden>
              {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
                <span
                  key={i}
                  className={clsx(
                    "h-1.5 rounded-pill transition-all duration-base ease-standard",
                    i + 1 === screen ? "w-5 bg-amber-500" : "w-1.5 bg-black/15"
                  )}
                />
              ))}
            </div>
            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={back}
                className="flex h-11 items-center gap-1 rounded-pill px-3 text-sm font-semibold text-grey-500 hover:bg-black/10 hover:text-grey-900"
              >
                <ChevronLeftIcon width={16} height={16} />
                {t("onboarding.back")}
              </button>
              <button
                type="button"
                onClick={next}
                className="flex h-11 items-center gap-1 rounded-pill bg-amber-500 px-4 text-sm font-bold text-ink-onAccent transition-colors duration-fast ease-standard hover:bg-amber-400"
              >
                {screen === TOTAL_STEPS ? t("onboarding.finish") : t("onboarding.next")}
                {screen !== TOTAL_STEPS && <ChevronRightIcon width={16} height={16} />}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StepShell({
  screen,
  title,
  body,
  children,
}: {
  screen: number;
  title: string;
  body: string;
  children: React.ReactNode;
}) {
  const { t, i18n } = useTranslation();
  return (
    <div>
      <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-amber-500">
        {toLocalizedDigits(t("onboarding.stepIndicator", { current: screen, total: TOTAL_STEPS }), i18n.language)}
      </p>
      <h2 id="onboarding-heading" className="mb-2 font-display text-lg font-bold text-grey-900">
        {title}
      </h2>
      <p className="mb-4 text-sm text-grey-500">{body}</p>
      {children}
    </div>
  );
}

function ExampleRow({
  label,
  value,
  position,
}: {
  label: string;
  value: string;
  position: "first" | "middle" | "last";
}) {
  return (
    <div
      className={clsx(
        "flex items-center justify-between",
        position === "first" && "pb-2",
        position === "middle" && "border-y border-black/8 py-2",
        position === "last" && "pt-2"
      )}
    >
      <span className="text-grey-500">{label}</span>
      <span className="font-semibold text-grey-900">{value}</span>
    </div>
  );
}
