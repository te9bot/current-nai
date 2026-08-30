import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { LedgerRow, Stats } from "../types";
import { getDivision, localizedName } from "../data/locations";
import { providerName, providerFullName } from "../data/providers";
import { formatHours, toLocalizedDigits } from "../utils/time";
import clsx from "../utils/clsx";

type Tab = "provider" | "division";

export default function LedgerTable({ stats }: { stats: Stats }) {
  const { t, i18n } = useTranslation();
  const [tab, setTab] = useState<Tab>("provider");
  const localize = (v: string) => toLocalizedDigits(v, i18n.language);

  const rows: LedgerRow[] = tab === "provider" ? stats.byProvider : stats.byDivision;
  const maxMinutes = Math.max(1, ...rows.map((r) => r.minutes));

  function labelFor(row: LedgerRow): string {
    return tab === "provider"
      ? providerName(row.id, i18n.language) || row.id
      : localizedName(getDivision(row.id), i18n.language) || row.id;
  }

  function titleFor(row: LedgerRow): string | undefined {
    return tab === "provider" ? providerFullName(row.id, i18n.language) : undefined;
  }

  return (
    <section className="panel">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/8 px-4 py-3">
        <div className="flex gap-1 rounded-pill border border-white/10 bg-ink-800 p-1">
          {(
            [
              { key: "provider", label: t("ledger.byProvider") },
              { key: "division", label: t("ledger.byDivision") },
            ] as const
          ).map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => setTab(opt.key)}
              className={clsx(
                "rounded-pill px-3 py-1.5 text-xs font-semibold transition-colors duration-fast",
                tab === opt.key ? "bg-white/15 text-white" : "text-grey-400 hover:text-white"
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-grey-500">{t("ledger.empty")}</p>
      ) : (
        <div className="scrollbar-thin overflow-x-auto">
          <table className="w-full min-w-[440px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-white/8 text-left text-[11px] uppercase tracking-wider text-grey-500">
                <th className="px-4 py-2 font-semibold">{t("ledger.colName")}</th>
                <th className="px-4 py-2 text-right font-semibold">{t("ledger.colReports")}</th>
                <th className="px-4 py-2 text-right font-semibold">{t("ledger.colOngoing")}</th>
                <th className="px-4 py-2 text-right font-semibold">{t("ledger.colTotalTime")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-white/8 last:border-0 hover:bg-white/[0.02]">
                  <td className="px-4 py-2.5" title={titleFor(row)}>
                    <div className="font-semibold text-white">{labelFor(row)}</div>
                    {/* proportional bar makes the concentration readable at a glance */}
                    <div className="mt-1 h-1 w-full max-w-[160px] overflow-hidden rounded-pill bg-white/8">
                      <div
                        className="h-full rounded-pill bg-rust-500/70"
                        style={{ width: `${Math.max(3, (row.minutes / maxMinutes) * 100)}%` }}
                      />
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums text-grey-300">
                    {localize(String(row.reports))}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                    <span className={row.ongoing > 0 ? "text-rust-400" : "text-grey-600"}>
                      {localize(String(row.ongoing))}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums font-semibold text-white">
                    {localize(formatHours(row.minutes, t))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="border-t border-white/8 px-4 py-3 text-[11px] leading-relaxed text-grey-600">
        {t("ledger.disclaimer")}
      </p>
    </section>
  );
}
