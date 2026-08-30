import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { Stats } from "../types";
import { BoltOffIcon, HourglassIcon, UsersIcon, ListIcon } from "./icons";
import { formatDuration, formatHours, toLocalizedDigits } from "../utils/time";
import clsx from "../utils/clsx";

interface Tile {
  key: string;
  label: string;
  value: string;
  caption?: string;
  icon: ReactNode;
  tone: "rust" | "leaf" | "neutral";
}

export default function StatsPanel({ stats }: { stats: Stats }) {
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
  ];

  return (
    <section className="panel">
      <div className="border-b border-white/8 px-4 py-3">
        <h2 className="font-display text-base font-bold text-white">{t("stats.title")}</h2>
        <p className="text-xs text-grey-500">{t("stats.subtitle")}</p>
      </div>
      <div className="grid grid-cols-2 gap-px bg-white/8 lg:grid-cols-4">
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
            <span className="font-mono text-xl font-bold tabular-nums text-white sm:text-2xl">{tile.value}</span>
            <span className="text-[11px] leading-tight text-grey-500">{tile.label}</span>
            {tile.caption && <span className="text-[10px] leading-tight text-grey-600">{tile.caption}</span>}
          </div>
        ))}
      </div>
    </section>
  );
}
