import { useTranslation } from "react-i18next";
import type { ReportStatus } from "../types";
import { BoltIcon, BoltOffIcon } from "./icons";
import clsx from "../utils/clsx";

export default function StatusBadge({ status, size = "md" }: { status: ReportStatus; size?: "sm" | "md" }) {
  const { t } = useTranslation();
  const isOn = status === "power_on";
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
