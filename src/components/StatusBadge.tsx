import { useTranslation } from "react-i18next";
import type { Report } from "../types";
import { BoltIcon, BoltOffIcon } from "./icons";
import { isCurrentlyPowerOn } from "../utils/reportStatus";
import clsx from "../utils/clsx";

export default function StatusBadge({ report, size = "md" }: { report: Report; size?: "sm" | "md" }) {
  const { t } = useTranslation();
  const isOn = isCurrentlyPowerOn(report);
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-pill font-semibold",
        size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs",
        isOn ? "bg-leaf-500/15 text-leaf-400 ring-1 ring-inset ring-leaf-500/40" : "bg-rust-500/15 text-rust-400 ring-1 ring-inset ring-rust-500/40"
      )}
    >
      {isOn ? <BoltIcon width={12} height={12} /> : <BoltOffIcon width={12} height={12} />}
      {isOn ? t("status.powerOn") : t("status.loadShedding")}
    </span>
  );
}
