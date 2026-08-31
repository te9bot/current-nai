import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { Report } from "../types";
import { getDivision, getDistrict, localizedName } from "../data/locations";
import { providerName, providerFullName } from "../data/providers";
import { confirmReport, resolveReport } from "../api/reports";
import StatusBadge from "./StatusBadge";
import { UsersIcon, CheckCircleIcon, AlertIcon } from "./icons";
import { formatRelativeTime, formatDuration, toLocalizedDigits } from "../utils/time";
import { isCurrentlyPowerOn } from "../utils/reportStatus";
import clsx from "../utils/clsx";

interface Props {
  report: Report;
  now: number;
  onConfirmed: (report: Report) => void;
  onResolved: (report: Report) => void;
}

export default function ReportCard({ report, now, onConfirmed, onResolved }: Props) {
  const { t, i18n } = useTranslation();
  // Confirmed-state comes entirely from the server (report.confirmedByYou,
  // derived from the anonymous HttpOnly identity cookie) — no client storage.
  const [confirmed, setConfirmed] = useState(report.confirmedByYou);
  const [pending, setPending] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [restoreFailed, setRestoreFailed] = useState(false);

  const division = getDivision(report.divisionId);
  const district = getDistrict(report.divisionId, report.districtId);
  const isOn = isCurrentlyPowerOn(report);
  const localize = (v: string) => toLocalizedDigits(v, i18n.language);
  const canRestore = report.status === "load_shedding" && !report.endTime;

  // Shown regardless of current status: a resolved outage still reports its
  // start/end window, just no longer flagged as ongoing.
  let outageWindow: string | null = null;
  if (report.startTime) {
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
      onConfirmed(updated);
    } catch {
      setConfirmed(false);
    } finally {
      setPending(false);
    }
  }

  // Any nearby anonymous visitor can mark a report resolved — not just
  // whoever created it — so this is available on every ongoing report.
  async function handleRestore() {
    if (restoring) return;
    setRestoring(true);
    setRestoreFailed(false);
    try {
      const updated = await resolveReport(report.id);
      onResolved(updated);
    } catch {
      setRestoreFailed(true);
    } finally {
      setRestoring(false);
    }
  }

  return (
    <article
      className={clsx(
        "flex flex-col gap-2.5 rounded-lg border border-black/8 bg-ink-900 p-4 shadow-pin transition-shadow duration-fast",
        isOn ? "hover:shadow-glow-leaf-soft" : "hover:shadow-glow-rust-soft"
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        <span
          className={clsx(
            "h-2.5 w-2.5 shrink-0 rounded-full",
            isOn ? "bg-leaf-500 shadow-glow-leaf-soft" : "bg-rust-500 shadow-glow-rust-soft"
          )}
          aria-hidden
        />
        <h3 className="truncate font-display text-base font-bold text-grey-900">{report.area}</h3>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge report={report} size="sm" />
        {report.providerId && report.providerId !== "unknown" && (
          <span
            title={providerFullName(report.providerId, i18n.language)}
            className="rounded-pill border border-black/10 bg-ink-800 px-2 py-0.5 font-mono text-[10px] font-medium text-grey-400"
          >
            {providerName(report.providerId, i18n.language)}
          </span>
        )}
      </div>

      <p className="truncate text-xs text-grey-500">
        {localizedName(district, i18n.language)}
        {district ? ", " : ""}
        {localizedName(division, i18n.language)}
      </p>

      {outageWindow && (
        <div className="font-mono text-xs text-grey-400">
          <p>{outageWindow}</p>
          {report.durationMinutes > 0 && (
            <p className={clsx("font-semibold", report.endTime ? "text-grey-300" : "text-rust-400")}>
              {localize(formatDuration(report.durationMinutes, t))}
            </p>
          )}
        </div>
      )}

      {report.note && <p className="text-sm text-grey-300">{report.note}</p>}

      <div className="mt-auto flex flex-col gap-2 pt-1">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleConfirm}
            disabled={confirmed || pending}
            title={confirmed ? undefined : t("confirm.hint")}
            className={clsx(
              "inline-flex items-center gap-1.5 rounded-pill border px-2.5 py-1 text-[11px] font-semibold transition-colors duration-fast ease-standard",
              confirmed
                ? "cursor-default border-leaf-600/40 bg-leaf-500/10 text-leaf-400"
                : "border-black/10 text-grey-400 hover:border-black/25 hover:text-grey-900 active:scale-[.97]"
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

        {canRestore && (
          <div className="flex flex-col gap-1">
            <button
              type="button"
              onClick={handleRestore}
              disabled={restoring || report.restoredByYou}
              title={report.restoredByYou ? undefined : t("restore.hint")}
              className={clsx(
                "inline-flex items-center gap-1.5 self-start rounded-pill border px-2.5 py-1 text-[11px] font-semibold transition-colors duration-fast",
                report.restoredByYou
                  ? "cursor-default border-leaf-600/40 bg-leaf-500/10 text-leaf-400"
                  : "border-leaf-600/40 bg-leaf-500/10 text-leaf-400 hover:bg-leaf-500/20 active:scale-[.97] disabled:opacity-50"
              )}
            >
              <CheckCircleIcon width={12} height={12} />
              {restoring
                ? t("restore.pending")
                : report.restoredByYou
                  ? t("restore.voted")
                  : t("restore.action")}
            </button>
            {report.restoreVotesNeeded > 1 && (
              <span className="font-mono text-[11px] text-grey-500">
                {localize(
                  t("restore.progress", { votes: report.restoreVotes, needed: report.restoreVotesNeeded })
                )}
              </span>
            )}
            {restoreFailed && (
              <p className="flex items-center gap-1.5 text-[11px] text-rust-400">
                <AlertIcon width={12} height={12} />
                {t("restore.error")}
              </p>
            )}
          </div>
        )}

        <time className="whitespace-nowrap font-mono text-[11px] text-grey-500" dateTime={report.createdAt}>
          {localize(formatRelativeTime(report.createdAt, now, t))}
        </time>
      </div>
    </article>
  );
}
