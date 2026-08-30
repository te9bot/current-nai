import { useTranslation } from "react-i18next";
import type { Report } from "../types";
import { getDistrict, localizedName } from "../data/locations";
import { BoltIcon, BoltOffIcon } from "./icons";
import clsx from "../utils/clsx";

export default function Ticker({ reports }: { reports: Report[] }) {
  const { t, i18n } = useTranslation();
  const items = reports.slice(0, 12);

  if (items.length === 0) {
    return (
      <div className="border-b border-black/8 bg-ink-900/50 px-4 py-2 text-center backdrop-blur-md text-xs text-grey-500">
        {t("ticker.empty")}
      </div>
    );
  }

  const renderItem = (report: Report, key: string) => {
    const district = getDistrict(report.divisionId, report.districtId);
    const districtName = localizedName(district, i18n.language);
    const isOn = report.status === "power_on";
    return (
      <span key={key} className="mx-4 inline-flex items-center gap-2 whitespace-nowrap font-mono text-xs">
        {isOn ? (
          <BoltIcon width={13} height={13} className="text-leaf-400" />
        ) : (
          <BoltOffIcon width={13} height={13} className="text-rust-400" />
        )}
        <span className={clsx("font-semibold", isOn ? "text-leaf-400" : "text-rust-400")}>
          {t(isOn ? "ticker.reportedPowerOn" : "ticker.reportedLoadShedding", {
            area: report.area,
            district: districtName,
          })}
        </span>
        <span className="text-grey-600">•</span>
      </span>
    );
  };

  return (
    <div className="group relative overflow-hidden border-b border-black/8 bg-ink-900/50 py-2 backdrop-blur-md">
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-10 bg-gradient-to-r from-ink-950 to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-10 bg-gradient-to-l from-ink-950 to-transparent" />
      <div className="mb-1 flex items-center gap-1.5 px-4">
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rust-500 opacity-75" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-rust-500" />
        </span>
        <span className="text-[10px] font-bold uppercase tracking-widest text-grey-500">{t("ticker.label")}</span>
      </div>
      <div className="flex animate-marquee group-hover:[animation-play-state:paused]">
        <div className="flex shrink-0">{items.map((r) => renderItem(r, `a-${r.id}`))}</div>
        <div className="flex shrink-0" aria-hidden>
          {items.map((r) => renderItem(r, `b-${r.id}`))}
        </div>
      </div>
    </div>
  );
}
