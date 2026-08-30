import { useRef, useState, type MouseEvent } from "react";
import { useTranslation } from "react-i18next";
import type { Report } from "../types";
import { getDivision, getDistrict, localizedName } from "../data/locations";
import StatusBadge from "./StatusBadge";
import { BoltIcon } from "./icons";
import { formatRelativeTime, useNowTick } from "../utils/time";

interface Props {
  latestReport: Report | null;
  onDismiss: () => void;
}

export default function Splash({ latestReport, onDismiss }: Props) {
  const { t, i18n } = useTranslation();
  const now = useNowTick();
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const frame = useRef<number | null>(null);

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
        }}
      />
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-b from-ink-950/40 via-ink-950/70 to-ink-950" />
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/3 h-[420px] w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-leaf-500/20 blur-[100px] transition-transform duration-fast ease-standard"
        style={{ translate: `${tilt.x * 18}px ${tilt.y * 18}px` }}
      />

      <div className="relative z-10 flex items-center justify-between px-6 pt-8 sm:px-10">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-leaf-500 text-ink-950 shadow-glow-leaf">
            <BoltIcon width={20} height={20} />
          </span>
          <h1 className="font-display text-lg font-extrabold tracking-tight text-white">{t("app.name")}</h1>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="text-xs font-semibold text-grey-500 transition-colors duration-fast hover:text-white"
        >
          {t("landing.skip")}
        </button>
      </div>

      <div className="relative z-10 flex flex-1 items-center justify-center px-6">
        {latestReport ? (
          <div
            className="w-full max-w-xs rounded-lg border border-white/10 bg-ink-900/90 p-4 shadow-callout backdrop-blur transition-transform duration-fast ease-standard"
            style={{ translate: `${tilt.x * 8}px ${tilt.y * 8}px` }}
          >
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-grey-500">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-leaf-500 opacity-75" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-leaf-500" />
                </span>
                {t("landing.previewLabel")}
              </span>
              <StatusBadge status={latestReport.status} size="sm" />
            </div>
            <h3 className="mt-2 font-display text-base font-bold text-white">{latestReport.area}</h3>
            <p className="text-xs text-grey-500">
              {localizedName(district, i18n.language)}, {localizedName(division, i18n.language)}
            </p>
            <p className="mt-1 font-mono text-[11px] text-grey-600">
              {formatRelativeTime(latestReport.createdAt, now, t)}
            </p>
          </div>
        ) : (
          <div className="w-full max-w-xs rounded-lg border border-white/10 bg-ink-900/60 p-6 text-center">
            <p className="text-sm text-grey-500">{t("landing.previewEmpty")}</p>
          </div>
        )}
      </div>

      <div className="relative z-10 px-6 pb-10 sm:px-10">
        <p className="whitespace-pre-line text-center font-display text-2xl font-extrabold leading-tight tracking-tight text-white sm:text-3xl">
          {t("landing.headline")}
        </p>
        <button
          type="button"
          onClick={onDismiss}
          className="mt-6 h-14 w-full rounded-pill bg-leaf-500 font-display text-base font-bold uppercase tracking-wide text-ink-950 shadow-glow-leaf transition-colors duration-fast ease-standard hover:bg-leaf-400 active:scale-[.98]"
        >
          {t("landing.getStarted")}
        </button>
        <div className="mx-auto mt-6 h-1 w-32 rounded-full bg-white/15" aria-hidden />
      </div>
    </div>
  );
}
