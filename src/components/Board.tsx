import { useTranslation } from "react-i18next";
import type { Report } from "../types";
import ReportCard from "./ReportCard";
import { AlertIcon } from "./icons";
import { useNowTick, toLocalizedDigits } from "../utils/time";

interface Props {
  reports: Report[];
  loading: boolean;
  error: boolean;
  hasFilters: boolean;
  onConfirmed: (report: Report) => void;
}

export default function Board({ reports, loading, error, hasFilters, onConfirmed }: Props) {
  const { t, i18n } = useTranslation();
  const now = useNowTick();

  return (
    <div className="panel">
      <div className="flex items-center justify-between border-b border-black/8 px-4 py-3">
        <div>
          <h2 className="font-display text-base font-bold text-grey-900">{t("board.title")}</h2>
          <p className="text-xs text-grey-500">{t("board.subtitle")}</p>
        </div>
        <span className="font-mono text-xs text-grey-500">
          {toLocalizedDigits(
            t("board.reportsCount", { count: reports.length }),
            i18n.language
          )}
        </span>
      </div>

      {error && (
        <div className="flex items-center gap-2 border-b border-rust-600/30 bg-rust-500/10 px-4 py-2.5 text-xs text-rust-400">
          <AlertIcon width={14} height={14} />
          {t("board.error")}
        </div>
      )}

      {loading ? (
        <div className="px-4 py-10 text-center text-sm text-grey-500">{t("board.loading")}</div>
      ) : reports.length === 0 ? (
        <div className="px-4 py-10 text-center text-sm text-grey-500">
          {hasFilters ? t("board.empty") : t("board.emptyAll")}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 p-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {reports.map((r) => (
            <ReportCard key={r.id} report={r} now={now} onConfirmed={onConfirmed} />
          ))}
        </div>
      )}
    </div>
  );
}
