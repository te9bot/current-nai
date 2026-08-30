import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { DIVISIONS, getDistricts, getAreas, localizedName } from "../data/locations";
import { fetchPatterns } from "../api/reports";
import type { HourlyPattern } from "../types";
import Skeleton from "./Skeleton";
import { toLocalizedDigits } from "../utils/time";
import clsx from "../utils/clsx";

const AXIS_HOURS = [0, 3, 6, 9, 12, 15, 18, 21];

// Fixed (not random) so the placeholder doesn't jitter across re-renders —
// just varied enough to read as "a chart's worth" of bars, not a flat block.
const SKELETON_HEIGHTS = [
  35, 20, 55, 15, 40, 25, 60, 30, 45, 70, 50, 90, 65, 100, 55, 75, 35, 45, 60, 25, 40, 30, 20, 15,
];

function hourLabel(hour: number, t: (key: string, opts?: Record<string, unknown>) => string): string {
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return hour < 12 ? t("patterns.am", { hour: h12 }) : t("patterns.pm", { hour: h12 });
}

export default function OutagePatterns() {
  const { t, i18n } = useTranslation();
  const localize = (v: string) => toLocalizedDigits(v, i18n.language);
  const [division, setDivision] = useState("");
  const [district, setDistrict] = useState("");
  const [area, setArea] = useState("");
  const [hourly, setHourly] = useState<HourlyPattern[]>([]);
  const [loading, setLoading] = useState(true);
  const [hovered, setHovered] = useState<number | null>(null);

  const districts = getDistricts(division);
  const areas = getAreas(division, district);

  useEffect(() => {
    setDistrict("");
  }, [division]);

  useEffect(() => {
    setArea("");
  }, [district]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchPatterns({
      ...(division ? { division } : {}),
      ...(district ? { district } : {}),
      ...(area ? { area } : {}),
    })
      .then((data) => {
        if (!cancelled) setHourly(data.hourly);
      })
      .catch(() => {
        if (!cancelled) setHourly([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [division, district, area]);

  const maxCount = Math.max(1, ...hourly.map((h) => h.count));
  const totalCount = hourly.reduce((sum, h) => sum + h.count, 0);
  const peakHour = useMemo(() => {
    if (totalCount === 0) return null;
    return hourly.reduce((best, h) => (h.count > best.count ? h : best), hourly[0]);
  }, [hourly, totalCount]);

  /**
   * Rough "likely next outage window": the contiguous run of hours around the
   * peak that are still busy (>=60% of the peak's count), wrapping past
   * midnight if needed. Capped well under 24h — a run that long means the
   * data is too flat to say anything more specific than "when outages
   * happen" already does, so no window is shown rather than a useless
   * near-all-day one.
   */
  const predictedWindow = useMemo(() => {
    if (!peakHour || totalCount === 0) return null;
    const n = hourly.length;
    const peakIdx = hourly.findIndex((h) => h.hour === peakHour.hour);
    if (peakIdx === -1) return null;
    const threshold = maxCount * 0.6;

    let startIdx = peakIdx;
    let endIdx = peakIdx;
    for (let i = 0; i < n - 1; i++) {
      const prevIdx = (startIdx - 1 + n) % n;
      if (prevIdx === endIdx || hourly[prevIdx].count < threshold) break;
      startIdx = prevIdx;
    }
    for (let i = 0; i < n - 1; i++) {
      const nextIdx = (endIdx + 1) % n;
      if (nextIdx === startIdx || hourly[nextIdx].count < threshold) break;
      endIdx = nextIdx;
    }

    const span = (endIdx - startIdx + n) % n + 1;
    if (span >= 20) return null;

    return { startHour: hourly[startIdx].hour, endHour: (hourly[endIdx].hour + 1) % 24 };
  }, [hourly, peakHour, totalCount, maxCount]);

  return (
    <section className="panel">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-black/8 px-4 py-3">
        <div>
          <h2 className="font-display text-base font-bold text-grey-900">{t("patterns.title")}</h2>
          <p className="text-xs text-grey-500">
            {peakHour && totalCount > 0
              ? t("patterns.subtitlePeak", { time: hourLabel(peakHour.hour, t) })
              : t("patterns.subtitle")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <select
            value={division}
            onChange={(e) => setDivision(e.target.value)}
            className="h-9 rounded-md border border-black/10 bg-ink-800 px-2.5 text-xs text-grey-900 outline-none focus:border-black/30"
          >
            <option value="">{t("filters.allDivisions")}</option>
            {DIVISIONS.map((d) => (
              <option key={d.id} value={d.id}>
                {localizedName(d, i18n.language)}
              </option>
            ))}
          </select>
          <select
            value={district}
            onChange={(e) => setDistrict(e.target.value)}
            disabled={!division}
            className="h-9 rounded-md border border-black/10 bg-ink-800 px-2.5 text-xs text-grey-900 outline-none focus:border-black/30 disabled:opacity-40"
          >
            <option value="">{t("patterns.allCities")}</option>
            {districts.map((d) => (
              <option key={d.id} value={d.id}>
                {localizedName(d, i18n.language)}
              </option>
            ))}
          </select>
          <select
            value={area}
            onChange={(e) => setArea(e.target.value)}
            disabled={!district}
            className="h-9 rounded-md border border-black/10 bg-ink-800 px-2.5 text-xs text-grey-900 outline-none focus:border-black/30 disabled:opacity-40"
          >
            <option value="">{t("patterns.allAreas")}</option>
            {areas.map((a) => (
              <option key={a.id} value={a.id}>
                {localizedName(a, i18n.language)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {!loading && predictedWindow && (
        <div className="flex items-center gap-2 border-b border-black/8 bg-rust-500/5 px-4 py-2.5">
          <span className="relative flex h-1.5 w-1.5 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rust-500 opacity-75" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-rust-500" />
          </span>
          <p className="text-xs text-grey-900">
            {t("patterns.predictedWindow", {
              start: hourLabel(predictedWindow.startHour, t),
              end: hourLabel(predictedWindow.endHour, t),
            })}
          </p>
        </div>
      )}

      {loading ? (
        <div className="px-4 py-4">
          <div className="flex h-32 items-end gap-[3px]" aria-hidden>
            {SKELETON_HEIGHTS.map((h, i) => (
              <Skeleton key={i} className="w-full flex-1 rounded-t-xs rounded-b-none" style={{ height: `${h}%` }} />
            ))}
          </div>
          <div className="mt-2 flex gap-[3px]">
            {SKELETON_HEIGHTS.map((_, i) => (
              <div key={i} className="flex-1" />
            ))}
          </div>
        </div>
      ) : totalCount === 0 ? (
        <div className="px-4 py-10 text-center text-sm text-grey-500">{t("patterns.empty")}</div>
      ) : (
        <div className="px-4 py-4">
          <div className="relative flex h-32 items-end gap-[3px]" role="img" aria-label={t("patterns.chartLabel")}>
            {hourly.map((h) => {
              const isPeak = peakHour?.hour === h.hour;
              const heightPct = Math.max(3, (h.count / maxCount) * 100);
              return (
                <div
                  key={h.hour}
                  className="group relative flex h-full flex-1 flex-col justify-end"
                  onMouseEnter={() => setHovered(h.hour)}
                  onMouseLeave={() => setHovered((prev) => (prev === h.hour ? null : prev))}
                >
                  {hovered === h.hour && (
                    <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-sm border border-black/10 bg-ink-800 px-2 py-1 text-[11px] shadow-callout">
                      <span className="font-semibold text-grey-900">{hourLabel(h.hour, t)}</span>{" "}
                      <span className="text-grey-400">
                        {localize(t("patterns.reportsCount", { count: h.count }))}
                      </span>
                    </div>
                  )}
                  <div
                    className={clsx(
                      "w-full rounded-t-xs transition-colors duration-fast",
                      isPeak ? "bg-rust-400" : "bg-rust-500/70 group-hover:bg-rust-400"
                    )}
                    style={{ height: `${heightPct}%` }}
                  />
                </div>
              );
            })}
          </div>
          <div className="mt-2 flex text-[10px] text-grey-600">
            {hourly.map((h) => (
              <div key={h.hour} className="flex-1 text-center">
                {AXIS_HOURS.includes(h.hour) ? localize(String(h.hour)) : ""}
              </div>
            ))}
          </div>

          <table className="sr-only">
            <caption>{t("patterns.chartLabel")}</caption>
            <thead>
              <tr>
                <th>{t("patterns.hourColumn")}</th>
                <th>{t("patterns.reportsColumn")}</th>
              </tr>
            </thead>
            <tbody>
              {hourly.map((h) => (
                <tr key={h.hour}>
                  <td>{hourLabel(h.hour, t)}</td>
                  <td>{h.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="border-t border-black/8 px-4 py-3 text-[11px] leading-relaxed text-grey-600">
        {t("patterns.disclaimer")}
      </p>
    </section>
  );
}
