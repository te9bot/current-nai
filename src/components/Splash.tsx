import { useRef, useState, type MouseEvent } from "react";
import { useTranslation } from "react-i18next";
import type { Report } from "../types";
import { getDivision, getDistrict, localizedName } from "../data/locations";
import StatusBadge from "./StatusBadge";
import { BoltIcon, BoltOffIcon, ChevronRightIcon } from "./icons";
import { formatRelativeTime, useNowTick } from "../utils/time";
import { isCurrentlyPowerOn } from "../utils/reportStatus";
import clsx from "../utils/clsx";

interface Props {
  /** Most recent reports, newest first. reports[0] drives the big "LIVE NOW"
   *  card; a few more (if present) float as smaller cards around it. */
  reports: Report[];
  onDismiss: () => void;
}

/** Fixed (not random) placement/timing per floating card slot — stable across
 *  re-renders, and spread so no two bob in sync. Hidden below `lg`: at
 *  phone/tablet width there isn't room around the main card without overlap. */
// All within the band between the header and the headline/CTA — that button
// runs nearly full-width, so anything lower would sit behind it instead.
const FLOAT_SLOTS = [
  { className: "left-[6%] top-[18%]", tiltFactor: 5, delay: "0s" },
  { className: "right-[6%] top-[14%]", tiltFactor: -6, delay: "1.1s" },
  { className: "left-[11%] top-[46%]", tiltFactor: -4, delay: "2.2s" },
  { className: "right-[10%] top-[50%]", tiltFactor: 6, delay: "0.6s" },
];

export default function Splash({ reports, onDismiss }: Props) {
  const { t, i18n } = useTranslation();
  const now = useNowTick();
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const frame = useRef<number | null>(null);

  const latestReport = reports[0] ?? null;
  const floatingReports = reports.slice(1, 1 + FLOAT_SLOTS.length);

  const division = latestReport ? getDivision(latestReport.divisionId) : undefined;
  const district = latestReport ? getDistrict(latestReport.divisionId, latestReport.districtId) : undefined;

  function handleMouseMove(e: MouseEvent<HTMLDivElement>) {
    const { innerWidth, innerHeight } = window;
    const x = (e.clientX / innerWidth - 0.5) * 2;
    const y = (e.clientY / innerHeight - 0.5) * 2;
    if (frame.current) cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => setTilt({ x, y }));
  }

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-ink-950"
      onMouseMove={handleMouseMove}
      onMouseLeave={() => setTilt({ x: 0, y: 0 })}
    >
      {/* map background layer: ambient auto-pan for touch devices, plus a faster
          mouse-driven offset for a parallax depth cue on desktop */}
      <div
        aria-hidden
        className="animate-map-pan pointer-events-none absolute inset-[-8%] bg-cover bg-center opacity-45 transition-transform duration-fast ease-standard"
        style={{
          backgroundImage: "url(/map-dark.png)",
          translate: `${tilt.x * -14}px ${tilt.y * -14}px`,
          filter: "invert(1) hue-rotate(180deg) brightness(1.08) contrast(0.92)",
        }}
      />
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-b from-ink-950/40 via-ink-950/70 to-ink-950" />
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/3 h-[420px] w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-500/20 blur-[100px] transition-transform duration-fast ease-standard"
        style={{ translate: `${tilt.x * 18}px ${tilt.y * 18}px` }}
      />

      {/* Smaller reports drifting around the main card — atmosphere, not a
          second focal point, so they're muted, blurred, and skip mobile
          where there's no room beside the centered card. */}
      {floatingReports.map((r, i) => {
        const slot = FLOAT_SLOTS[i];
        const isOn = isCurrentlyPowerOn(r);
        return (
          <div
            key={r.id}
            aria-hidden
            className={clsx(
              "pointer-events-none absolute z-10 hidden w-40 animate-float rounded-lg border border-black/10 bg-ink-900/70 p-2.5 opacity-70 shadow-pin backdrop-blur transition-transform duration-fast ease-standard lg:block",
              slot.className
            )}
            style={{
              translate: `${tilt.x * slot.tiltFactor}px ${tilt.y * slot.tiltFactor}px`,
              animationDelay: slot.delay,
            }}
          >
            <div className="flex items-center gap-1.5">
              {isOn ? (
                <BoltIcon width={12} height={12} className="shrink-0 text-leaf-400" />
              ) : (
                <BoltOffIcon width={12} height={12} className="shrink-0 text-rust-400" />
              )}
              <span className="truncate font-display text-xs font-bold text-grey-900">{r.area}</span>
            </div>
            <p className="mt-0.5 truncate text-[10px] text-grey-500">
              {localizedName(getDistrict(r.divisionId, r.districtId), i18n.language)}
            </p>
          </div>
        );
      })}

      {/* Splash has no scroll of its own, so this is the "there's more, go
          on" affordance — deliberately on the side, not stacked with the
          text Skip link already in the top-right corner. */}
      <button
        type="button"
        onClick={onDismiss}
        aria-label={t("landing.getStarted")}
        className="absolute right-3 top-1/2 z-10 flex -translate-y-1/2 flex-col items-center gap-1.5 text-grey-500 transition-colors duration-fast hover:text-grey-900 sm:right-6"
      >
        <span className="flex h-10 w-10 animate-float items-center justify-center rounded-full border border-black/10 bg-ink-900/80 shadow-pin backdrop-blur">
          <ChevronRightIcon width={18} height={18} />
        </span>
        <span className="font-bn text-[10px] font-semibold">এগিয়ে যান</span>
      </button>

      <div className="relative z-10 flex items-center justify-between px-6 pt-8 sm:px-10">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-amber-500 text-ink-onAccent shadow-glow-amber">
            <BoltIcon width={20} height={20} />
          </span>
          <h1 className="font-display text-lg font-extrabold tracking-tight text-grey-900">{t("app.name")}</h1>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="text-xs font-semibold text-grey-500 transition-colors duration-fast hover:text-grey-900"
        >
          {t("landing.skip")}
        </button>
      </div>

      <div className="relative z-10 flex flex-1 items-center justify-center px-6">
        {latestReport ? (
          <div
            className="w-full max-w-xs rounded-lg border border-black/10 bg-ink-900/90 p-4 shadow-callout backdrop-blur transition-transform duration-fast ease-standard"
            style={{ translate: `${tilt.x * 8}px ${tilt.y * 8}px` }}
          >
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-grey-500">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-500 opacity-75" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-amber-500" />
                </span>
                {t("landing.previewLabel")}
              </span>
              <StatusBadge report={latestReport} size="sm" />
            </div>
            <h3 className="mt-2 font-display text-base font-bold text-grey-900">{latestReport.area}</h3>
            <p className="text-xs text-grey-500">
              {localizedName(district, i18n.language)}, {localizedName(division, i18n.language)}
            </p>
            <p className="mt-1 font-mono text-[11px] text-grey-600">
              {formatRelativeTime(latestReport.createdAt, now, t)}
            </p>
          </div>
        ) : (
          <div className="w-full max-w-xs rounded-lg border border-black/10 bg-ink-900/60 p-6 text-center">
            <p className="text-sm text-grey-500">{t("landing.previewEmpty")}</p>
          </div>
        )}
      </div>

      <div className="relative z-10 px-6 pb-10 sm:px-10">
        <p className="whitespace-pre-line text-center font-display text-2xl font-extrabold leading-tight tracking-tight text-grey-900 sm:text-3xl">
          {t("landing.headline")}
        </p>
        <button
          type="button"
          onClick={onDismiss}
          className="mt-6 h-14 w-full rounded-pill bg-amber-500 font-display text-base font-bold uppercase tracking-wide text-ink-onAccent shadow-glow-amber transition-colors duration-fast ease-standard hover:bg-amber-400 active:scale-[.98]"
        >
          {t("landing.getStarted")}
        </button>
        {/* Fixed bilingual, not tied to the language toggle — always Bangla then
            English, so the disclaimer reads regardless of which language a
            first-time visitor's browser defaulted the rest of the UI to. */}
        <p className="mx-auto mt-4 max-w-xs text-center text-[11px] leading-relaxed text-grey-500">
          <span className="font-bn block">
            এটি কোনো সরকারি বা অফিসিয়াল অ্যাপ নয় — লোডশেডিংয়ের সময় অনুমান করতে ও পরবর্তী বিভ্রাট কখন হতে পারে তা বোঝার জন্য তৈরি।
          </span>
          <span className="mt-1 block">
            Not an official app — built to help estimate load-shedding timing and guess when the next outage might happen.
          </span>
        </p>
        <div className="mx-auto mt-6 h-1 w-32 rounded-full bg-black/15" aria-hidden />
      </div>
    </div>
  );
}
