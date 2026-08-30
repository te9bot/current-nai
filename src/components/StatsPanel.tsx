import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { Stats } from "../types";
import { BoltOffIcon, HourglassIcon, UsersIcon, ListIcon, CoinIcon } from "./icons";
import Skeleton from "./Skeleton";
import { formatDuration, formatHours, toLocalizedDigits } from "../utils/time";
import { estimatedLossTaka, formatTaka, ASSUMED_LOAD_KW } from "../utils/costEstimate";
import clsx from "../utils/clsx";

interface Tile {
  key: string;
  label: string;
  value: string;
  caption?: string;
  icon: ReactNode;
  tone: "rust" | "leaf" | "neutral";
}

export default function StatsPanel({ stats, loading }: { stats: Stats; loading: boolean }) {
  const { t, i18n } = useTranslation();
  const localize = (v: string) => toLocalizedDigits(v, i18n.language);

  const tiles: Tile[] = [
    {
      key: "totalTime",
      label: t("stats.totalOutageTime"),
      value: localize(formatHours(stats.totalOutageMinutes, t)),
      caption: localize(t("stats.outageReports") + ": " + stats.outageReports),
      icon: <HourglassIcon width={18} height={18} />,
      tone: "rust",
    },
    {
      key: "avg",
      label: t("stats.averageOutage"),
      value: localize(formatDuration(stats.averageOutageMinutes, t)),
      icon: <BoltOffIcon width={18} height={18} />,
      tone: "rust",
    },
    {
      key: "ongoing",
      label: t("stats.stillOngoing"),
      value: localize(String(stats.ongoingCount)),
      caption: localize(t("stats.ongoingRate", { rate: stats.ongoingRate })),
      icon: <ListIcon width={18} height={18} />,
      tone: "neutral",
    },
    {
      key: "confirmations",
      label: t("stats.confirmations"),
      value: localize(String(stats.totalConfirmations)),
      caption: localize(
        t("stats.coverageValue", { divisions: stats.divisionsCovered, providers: stats.providersCovered })
      ),
      icon: <UsersIcon width={18} height={18} />,
      tone: "leaf",
    },
    {
      key: "economicLoss",
      label: t("stats.economicLoss"),
      value: formatTaka(estimatedLossTaka(stats.byProvider), i18n.language),
      caption: localize(t("stats.economicLossCaption", { load: ASSUMED_LOAD_KW })),
      icon: <CoinIcon width={18} height={18} />,
      tone: "rust",
    },
  ];

  return (
    <section className="panel">
      <div className="border-b border-black/8 px-4 py-3">
        <h2 className="font-display text-base font-bold text-grey-900">{t("stats.title")}</h2>
        <p className="text-xs text-grey-500">{t("stats.subtitle")}</p>
      </div>
      <div className="grid grid-cols-2 gap-px bg-black/8 lg:grid-cols-4">
        {tiles.map((tile) => (
          <div key={tile.key} className="flex flex-col gap-1.5 bg-ink-950/70 p-3 sm:p-4">
            <span
              className={clsx(
                tile.tone === "rust" && "text-rust-400",
                tile.tone === "leaf" && "text-leaf-400",
                tile.tone === "neutral" && "text-grey-400"
              )}
            >
              {tile.icon}
            </span>
            {loading ? (
              <Skeleton className="h-6 w-16 sm:h-7" />
            ) : (
              <span className="font-mono text-xl font-bold tabular-nums text-grey-900 sm:text-2xl">{tile.value}</span>
            )}
            <span className="text-[11px] leading-tight text-grey-500">{tile.label}</span>
            {tile.caption &&
              (loading ? (
                <Skeleton className="h-3 w-24" />
              ) : (
                <span className="text-[10px] leading-tight text-grey-600">{tile.caption}</span>
              ))}
          </div>
        ))}
      </div>
    </section>
  );
}
