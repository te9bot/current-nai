import { useState } from "react";
import { useTranslation } from "react-i18next";
import { getDivision, getDistrict, localizedName } from "../data/locations";
import { resolveReport } from "../api/reports";
import type { Report } from "../types";
import { XIcon, CheckCircleIcon, AlertIcon } from "./icons";
import { formatDuration, formatRelativeTime, toLocalizedDigits } from "../utils/time";
import clsx from "../utils/clsx";

interface Props {
  reports: Report[];
  /** Report id -> resolve token, proving this browser owns each report. */
  tokens: Map<number, string>;
  onClose: () => void;
  onResolved: (report: Report) => void;
}

interface RowProps {
  report: Report;
  resolveToken: string;
  onResolved: (report: Report) => void;
}

function MyReportRow({ report, resolveToken, onResolved }: RowProps) {
  const { t, i18n } = useTranslation();
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  const division = getDivision(report.divisionId);
  const district = getDistrict(report.divisionId, report.districtId);
  const localize = (v: string) => toLocalizedDigits(v, i18n.language);

  async function handleResolve() {
    if (pending) return;
    setPending(true);
    setFailed(false);
    try {
      const updated = await resolveReport(report.id, resolveToken);
      onResolved(updated);
    } catch {
      setFailed(true);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex items-start gap-3 border-b border-black/8 px-4 py-4 last:border-b-0">
      <div className="min-w-0 flex-1">
        <h3 className="truncate font-display text-sm font-bold text-grey-900">{report.area}</h3>
        <p className="mt-0.5 truncate text-xs text-grey-500">
          {localizedName(district, i18n.language)}
          {district ? ", " : ""}
          {localizedName(division, i18n.language)}
        </p>
        {report.startTime && (
          <p className="mt-1.5 font-mono text-xs text-rust-400">
            {t("board.outageOngoing", { start: localize(report.startTime) })}
            {report.durationMinutes > 0 && ` · ${localize(formatDuration(report.durationMinutes, t))}`}
          </p>
        )}
        <p className="mt-1 text-[11px] text-grey-600">{localize(formatRelativeTime(report.createdAt, Date.now(), t))}</p>
        {failed && (
          <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-rust-400">
            <AlertIcon width={12} height={12} />
            {t("myReports.resolveError")}
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={handleResolve}
        disabled={pending}
        className={clsx(
          "inline-flex shrink-0 items-center gap-1.5 rounded-pill border border-leaf-600/40 bg-leaf-500/10 px-3 py-1.5 text-xs font-semibold text-leaf-400 transition-colors duration-fast hover:bg-leaf-500/20 active:scale-[.97] disabled:opacity-50"
        )}
      >
        <CheckCircleIcon width={13} height={13} />
        {pending ? t("myReports.resolving") : t("myReports.resolveAction")}
      </button>
    </div>
  );
}

export default function MyReports({ reports, tokens, onClose, onResolved }: Props) {
  const { t } = useTranslation();
  const ongoing = reports.filter((r) => r.status === "load_shedding" && !r.endTime && tokens.has(r.id));

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink-950/80 backdrop-blur-md sm:items-center sm:p-4">
      <div
        className="max-h-[80vh] w-full overflow-y-auto rounded-t-xl border border-black/10 bg-ink-900 shadow-sheet sm:max-w-lg sm:rounded-xl sm:shadow-callout"
        role="dialog"
        aria-modal="true"
        aria-labelledby="my-reports-heading"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-black/8 bg-ink-900/95 px-5 py-4 backdrop-blur">
          <div>
            <h2 id="my-reports-heading" className="font-display text-lg font-bold text-grey-900">
              {t("myReports.title")}
            </h2>
            <p className="text-xs text-grey-500">{t("myReports.subtitle")}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("form.close")}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-pill text-grey-400 hover:bg-black/10 hover:text-grey-900"
          >
            <XIcon width={18} height={18} />
          </button>
        </div>

        {ongoing.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-grey-500">{t("myReports.empty")}</div>
        ) : (
          <div>
            {ongoing.map((r) => (
              <MyReportRow key={r.id} report={r} resolveToken={tokens.get(r.id)!} onResolved={onResolved} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
