import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { Summary } from "../types";
import { BoltIcon, BoltOffIcon, ClockIcon } from "./icons";
import { toLocalizedDigits } from "../utils/time";
import clsx from "../utils/clsx";

interface Tile {
  key: string;
  label: string;
  value: number;
  icon: ReactNode;
  tone: "leaf" | "rust" | "neutral";
}

export default function SummaryCounts({ summary }: { summary: Summary }) {
  const { t, i18n } = useTranslation();

  const tiles: Tile[] = [
    {
      key: "powerOn",
      label: t("summary.powerOn"),
      value: summary.powerOn,
      icon: <BoltIcon width={20} height={20} />,
      tone: "leaf",
    },
    {
      key: "loadShedding",
      label: t("summary.loadShedding"),
      value: summary.loadShedding,
      icon: <BoltOffIcon width={20} height={20} />,
      tone: "rust",
    },
    {
      key: "total",
      label: t("summary.totalReports"),
      value: summary.total,
      icon: <ClockIcon width={20} height={20} />,
      tone: "neutral",
    },
  ];

  return (
    <div className="grid grid-cols-3 gap-2 sm:gap-3">
      {tiles.map((tile) => (
        <div
          key={tile.key}
          className={clsx(
            "flex flex-col gap-1.5 rounded-lg border p-3 backdrop-blur-md sm:p-4",
            tile.tone === "leaf" && "border-leaf-600/30 bg-leaf-500/[0.07]",
            tile.tone === "rust" && "border-rust-600/30 bg-rust-500/[0.07]",
            tile.tone === "neutral" && "border-white/8 bg-ink-900/70"
          )}
        >
          <div className="flex items-center justify-between">
            <span
              className={clsx(
                tile.tone === "leaf" && "text-leaf-400",
                tile.tone === "rust" && "text-rust-400",
                tile.tone === "neutral" && "text-grey-400"
              )}
            >
              {tile.icon}
            </span>
          </div>
          <span className="font-mono text-2xl font-bold tabular-nums text-white sm:text-3xl">
            {toLocalizedDigits(String(tile.value), i18n.language)}
          </span>
          <span className="text-[11px] leading-tight text-grey-500 sm:text-xs">{tile.label}</span>
        </div>
      ))}
    </div>
  );
}
