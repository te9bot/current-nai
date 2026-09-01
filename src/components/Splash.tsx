import { useEffect, useRef, type MouseEvent } from "react";
import { useTranslation } from "react-i18next";
import type { Report } from "../types";
import { getDivision, getDistrict, localizedName } from "../data/locations";
import StatusBadge from "./StatusBadge";
import { BoltIcon, BoltOffIcon } from "./icons";
import { formatRelativeTime, useNowTick } from "../utils/time";
import { isCurrentlyPowerOn } from "../utils/reportStatus";
import { prefersReducedMotion } from "../utils/motion";
import clsx from "../utils/clsx";

interface Props {
  /** Most recent reports, newest first. reports[0] drives the big "LIVE NOW"
   *  card; up to 9 more (if present) float in as scrolling continues. */
  reports: Report[];
  onDismiss: () => void;
}

/** Fixed (not random) placement/timing per floating card slot — stable across
 *  re-renders, and spread so no two bob in sync. Each slot's className
 *  carries its own visibility + position + width so mobile and desktop can
 *  differ per slot: the first four also show on phones (there's open space
 *  directly above/below the centered main card there), sized to fit; the
 *  rest are desktop-only ("hidden … lg:block") where there's room on the
 *  sides. Five rows between the header and the headline/CTA band on
 *  desktop, alternating left/right so cards revealed later land beside the
 *  earlier ones rather than on top of them. */
const FLOAT_SLOTS = [
  { className: "block left-[4%] top-[9%] w-[44%] lg:left-[8%] lg:top-[8%] lg:w-40", tiltFactor: 5, delay: "0s" },
  { className: "block right-[4%] top-[9%] w-[44%] lg:right-[8%] lg:top-[6%] lg:w-40", tiltFactor: -6, delay: "1.1s" },
  {
    className:
      "block left-[4%] bottom-[9%] w-[44%] lg:left-[11%] lg:bottom-auto lg:top-[20%] lg:w-40",
    tiltFactor: -4,
    delay: "2.2s",
  },
  {
    className:
      "block right-[4%] bottom-[9%] w-[44%] lg:right-[9%] lg:bottom-auto lg:top-[18%] lg:w-40",
    tiltFactor: 6,
    delay: "0.6s",
  },
  { className: "hidden left-[7%] top-[31%] w-40 lg:block", tiltFactor: 4, delay: "1.6s" },
  { className: "hidden right-[12%] top-[29%] w-40 lg:block", tiltFactor: -5, delay: "2.6s" },
  { className: "hidden left-[13%] top-[42%] w-40 lg:block", tiltFactor: -6, delay: "0.3s" },
  { className: "hidden right-[7%] top-[40%] w-40 lg:block", tiltFactor: 5, delay: "1.9s" },
  { className: "hidden left-[9%] top-[53%] w-40 lg:block", tiltFactor: 3, delay: "2.9s" },
];

export default function Splash({ reports, onDismiss }: Props) {
  const { t, i18n } = useTranslation();
  const now = useNowTick();
  const reducedMotion = useRef(prefersReducedMotion()).current;

  // Scroll/mousemove-driven values live in refs, not state: both are written
  // every animation frame during a gesture, and driving them through
  // setState would force this whole tree (main card + up to 9 floating
  // cards) to re-render every frame just to update a transform/opacity
  // string. The rAF callbacks below write straight to each element's style
  // via these refs instead — same values, same easing, no React commit in
  // the scroll/pointer hot path.
  const tiltRef = useRef({ x: 0, y: 0 });
  const scrollProgressRef = useRef(0);
  const tiltFrame = useRef<number | null>(null);
  const bgRef = useRef<HTMLDivElement | null>(null);
  const bloomRef = useRef<HTMLDivElement | null>(null);
  const mainCardRef = useRef<HTMLDivElement | null>(null);
  const floatingCardRefs = useRef<(HTMLDivElement | null)[]>([]);

  const latestReport = reports[0] ?? null;
  const floatingReports = reports.slice(1, 1 + FLOAT_SLOTS.length);
  // Kept in sync with the render-scoped `floatingReports` on every render, so
  // the stable rAF callbacks set up once on mount (below) always see the
  // latest report list instead of the one from whichever render happened to
  // be current when they were created.
  const floatingReportsRef = useRef(floatingReports);
  floatingReportsRef.current = floatingReports;

  const division = latestReport ? getDivision(latestReport.divisionId) : undefined;
  const district = latestReport ? getDistrict(latestReport.divisionId, latestReport.districtId) : undefined;

  function applyTilt() {
    const { x, y } = tiltRef.current;
    if (bgRef.current) bgRef.current.style.translate = `${x * -14}px ${y * -14}px`;
    if (bloomRef.current) bloomRef.current.style.translate = `${x * 18}px ${y * 18}px`;
    if (mainCardRef.current) mainCardRef.current.style.translate = `${x * 8}px ${y * 8}px`;
    floatingReportsRef.current.forEach((_, i) => {
      const el = floatingCardRefs.current[i];
      const slot = FLOAT_SLOTS[i];
      if (el && slot) el.style.translate = `${x * slot.tiltFactor}px ${y * slot.tiltFactor}px`;
    });
  }

  function applyScroll() {
    const progress = scrollProgressRef.current;
    // String, not a number: React/DOM appends "px" to unrecognized numeric
    // style values, which turns `scale` into an invalid value the browser
    // drops — same reasoning the original state-driven version relied on.
    if (bgRef.current) bgRef.current.style.scale = String(1 + progress * 0.22);
    const cards = floatingReportsRef.current;
    cards.forEach((_, i) => {
      const el = floatingCardRefs.current[i];
      if (!el) return;
      // Cards reveal one at a time as the visitor scrolls down, staying real
      // data (just the next slice of `reports`) never invented rows — and
      // fold back away on the way back up to the original view.
      const cardProgress = reducedMotion ? 1 : Math.min(1, Math.max(0, progress * cards.length - i));
      el.style.scale = String(0.85 + cardProgress * 0.15);
      el.style.opacity = String(cardProgress * 0.7);
    });
  }

  useEffect(() => {
    // Reduced-motion visitors get the same real reports without the
    // scroll-tied zoom/reveal — same convention as MapBackdrop's parallax.
    if (reducedMotion) return;

    let scrollFrame: number | null = null;
    const onScroll = () => {
      if (scrollFrame) return;
      scrollFrame = requestAnimationFrame(() => {
        // Wider than the 4-card version: 9 cards now stagger across this
        // distance, so it needs more room to keep each reveal legible.
        const range = Math.max(480, window.innerHeight);
        scrollProgressRef.current = Math.min(1, Math.max(0, window.scrollY / range));
        applyScroll();
        scrollFrame = null;
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (scrollFrame) cancelAnimationFrame(scrollFrame);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reducedMotion]);

  function handleMouseMove(e: MouseEvent<HTMLDivElement>) {
    const { innerWidth, innerHeight } = window;
    tiltRef.current = {
      x: (e.clientX / innerWidth - 0.5) * 2,
      y: (e.clientY / innerHeight - 0.5) * 2,
    };
    if (tiltFrame.current) cancelAnimationFrame(tiltFrame.current);
    tiltFrame.current = requestAnimationFrame(applyTilt);
  }

  function handleMouseLeave() {
    tiltRef.current = { x: 0, y: 0 };
    applyTilt();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-ink-950"
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      {/* map background layer: ambient auto-pan for touch devices, plus a faster
          mouse-driven offset for a parallax depth cue on desktop */}
      <div
        ref={bgRef}
        aria-hidden
        className="animate-map-pan pointer-events-none absolute inset-[-8%] bg-cover bg-center opacity-45 transition-[scale] duration-base ease-standard"
        style={{
          backgroundImage: "url(/map-dark.webp)",
          translate: "0px 0px",
          scale: "1",
          filter: "invert(1) hue-rotate(180deg) brightness(1.08) contrast(0.92)",
        }}
      />
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-b from-ink-950/40 via-ink-950/70 to-ink-950" />
      <div
        ref={bloomRef}
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/3 h-[420px] w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-500/20 blur-[100px] transition-transform duration-fast ease-standard"
        style={{ translate: "0px 0px" }}
      />

      {/* Smaller reports drifting around the main card — atmosphere, not a
          second focal point, so they're muted, blurred. The first four also
          show on phones (there's open space above/below the centered card
          there); the rest need the side margins only desktop has, so each
          slot's own className carries its visibility + size. */}
      {floatingReports.map((r, i) => {
        const slot = FLOAT_SLOTS[i];
        const isOn = isCurrentlyPowerOn(r);
        const initialCardProgress = reducedMotion ? 1 : 0;
        return (
          <div
            key={r.id}
            ref={(el) => {
              floatingCardRefs.current[i] = el;
            }}
            aria-hidden
            className={clsx(
              "pointer-events-none absolute z-10 animate-float rounded-lg border border-black/10 bg-ink-900/70 p-2.5 shadow-pin backdrop-blur transition-[opacity,scale] duration-fast ease-standard",
              slot.className
            )}
            style={{
              translate: "0px 0px",
              scale: String(0.85 + initialCardProgress * 0.15),
              opacity: initialCardProgress * 0.7,
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

      <div className="relative z-10 flex items-center px-6 pt-8 sm:px-10">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-amber-500 text-ink-onAccent shadow-glow-amber">
            <BoltIcon width={20} height={20} />
          </span>
          <h1 className="font-display text-lg font-extrabold tracking-tight text-grey-900">{t("app.name")}</h1>
        </div>
      </div>

      <div className="relative z-10 flex flex-1 items-center justify-center px-6">
        {latestReport ? (
          <div
            ref={mainCardRef}
            className="w-full max-w-xs rounded-lg border border-black/10 bg-ink-900/90 p-4 shadow-callout backdrop-blur transition-transform duration-fast ease-standard"
            style={{ translate: "0px 0px" }}
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
            <h2 className="mt-2 font-display text-base font-bold text-grey-900">{latestReport.area}</h2>
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
        {/* Fixed, not translated — this exact Bengali headline is the hero's
            identity regardless of the EN/BN toggle, unlike every other
            string on the page. font-bn (not font-display) is forced
            explicitly so it always renders with a Bengali-capable typeface
            even while the rest of the UI is toggled to English (html[lang]
            would otherwise be "en" and pull in a Latin-only stack). */}
        <p className="whitespace-pre-line text-center font-bn text-2xl font-extrabold leading-tight tracking-tight text-grey-900 sm:text-3xl">
          কি Bhai কারেন্ট নাই? আসেন দেখি আপনার নাকি সবার!
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
        <p className="mx-auto mt-4 max-w-xs text-center text-[11px] font-bold leading-relaxed text-grey-500">
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
