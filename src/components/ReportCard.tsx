import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { Report } from "../types";
import { getDivision, getDistrict, localizedName } from "../data/locations";
import { providerName, providerFullName } from "../data/providers";
import { confirmReport } from "../api/reports";
import StatusBadge from "./StatusBadge";
import { UsersIcon } from "./icons";
import { formatRelativeTime, formatDuration, toLocalizedDigits } from "../utils/time";
import clsx from "../utils/clsx";

const CONFIRMED_KEY = "current-nai-confirmed";

/** Report ids this browser has already confirmed, so one person can't stack votes. */
function readConfirmed(): Set<number> {
  try {
    const raw = localStorage.getItem(CONFIRMED_KEY);
    return new Set<number>(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
}

function rememberConfirmed(id: number) {
  try {
    const next = readConfirmed();
    next.add(id);
    localStorage.setItem(CONFIRMED_KEY, JSON.stringify([...next]));
  } catch {
    /* storage unavailable (private mode) — the button just won't persist */
  }
}

interface Props {
  report: Report;
  now: number;
  onConfirmed: (report: Report) => void;
}

export default function ReportCard({ report, now, onConfirmed }: Props) {
  const { t, i18n } = useTranslation();
  const [confirmed, setConfirmed] = useState(() => readConfirmed().has(report.id));
  const [pending, setPending] = useState(false);

  const division = getDivision(report.divisionId);
  const district = getDistrict(report.divisionId, report.districtId);
  const isOn = report.status === "power_on";
  const localize = (v: string) => toLocalizedDigits(v, i18n.language);

  let outageWindow: string | null = null;
  if (!isOn && report.startTime) {
    outageWindow = report.endTime
      ? t("board.outageWindow", { start: localize(report.startTime), end: localize(report.endTime) })
      : t("board.outageOngoing", { start: localize(report.startTime) });
  }

  async function handleConfirm() {
    if (confirmed || pending) return;
    setPending(true);
    setConfirmed(true); // optimistic — reverted below if the request fails
    try {
      const updated = await confirmReport(report.id);
      rememberConfirmed(report.id);
      onConfirmed(updated);
    } catch {
      setConfirmed(false);
    } finally {
      setPending(false);
    }
  }

  return (
    <article className="flex items-start gap-3 border-b border-white/8 px-4 py-4 transition-colors duration-fast hover:bg-white/[0.02]">
      <span
        className={clsx(
          "mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full",
          isOn ? "bg-leaf-500 shadow-glow-leaf-soft" : "bg-rust-500 shadow-glow-rust-soft"
        )}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="truncate font-display text-base font-bold text-white">{report.area}</h3>
          <StatusBadge status={report.status} size="sm" />
          {report.providerId && report.providerId !== "unknown" && (
            <span
              title={providerFullName(report.providerId, i18n.language)}
              className="rounded-pill border border-white/10 bg-ink-800 px-2 py-0.5 font-mono text-[10px] font-medium text-grey-400"
            >
              {providerName(report.providerId, i18n.language)}
            </span>
          )}
        </div>

        <p className="mt-0.5 truncate text-xs text-grey-500">
          {localizedName(district, i18n.language)}
          {district ? ", " : ""}
          {localizedName(division, i18n.language)}
        </p>

        {outageWindow && (
          <p className="mt-1.5 flex flex-wrap items-center gap-2 font-mono text-xs text-grey-400">
            <span>{outageWindow}</span>
            {report.durationMinutes > 0 && (
              <span className={clsx("font-semibold", report.endTime ? "text-grey-300" : "text-rust-400")}>
                {localize(formatDuration(report.durationMinutes, t))}
              </span>
            )}
          </p>
        )}

        {report.note && <p className="mt-1.5 text-sm text-grey-300">{report.note}</p>}

        <div className="mt-2.5 flex items-center gap-3">
          <button
            type="button"
            onClick={handleConfirm}
            disabled={confirmed || pending}
            title={confirmed ? undefined : t("confirm.hint")}
            className={clsx(
              "inline-flex items-center gap-1.5 rounded-pill border px-2.5 py-1 text-[11px] font-semibold transition-colors duration-fast ease-standard",
              confirmed
                ? "cursor-default border-leaf-600/40 bg-leaf-500/10 text-leaf-400"
                : "border-white/10 text-grey-400 hover:border-white/25 hover:text-white active:scale-[.97]"
            )}
          >
            <UsersIcon width={12} height={12} />
            {confirmed ? t("confirm.confirmed") : t("confirm.action")}
          </button>
          {report.confirmations > 0 && (
            <span className="font-mono text-[11px] text-grey-500">
              {localize(t("confirm.count", { count: report.confirmations }))}
            </span>
          )}
        </div>
      </div>

      <time className="shrink-0 whitespace-nowrap font-mono text-[11px] text-grey-500" dateTime={report.createdAt}>
        {localize(formatRelativeTime(report.createdAt, now, t))}
      </time>
    </article>
  );
}
