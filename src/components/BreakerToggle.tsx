import { useTranslation } from "react-i18next";
import type { ReportStatus } from "../types";
import { BoltIcon, BoltOffIcon } from "./icons";
import clsx from "../utils/clsx";

interface Props {
  value: ReportStatus;
  onChange: (status: ReportStatus) => void;
}

export default function BreakerToggle({ value, onChange }: Props) {
  const { t } = useTranslation();
  const isOn = value === "power_on";

  return (
    <div className="select-none">
      <div
        role="radiogroup"
        aria-label={t("form.statusLabel")}
        className={clsx(
          "relative flex h-16 items-stretch rounded-lg border-2 bg-ink-900 p-1.5 shadow-[inset_0_2px_6px_rgba(0,0,0,.6)] transition-shadow duration-base ease-standard",
          isOn ? "border-leaf-600/50" : "border-rust-600/50"
        )}
      >
        {/* Sliding breaker lever */}
        <div
          aria-hidden
          className={clsx(
            "absolute inset-y-1.5 w-[calc(50%-6px)] rounded-md transition-all duration-base ease-standard",
            isOn
              ? "left-1.5 bg-gradient-to-b from-leaf-400 to-leaf-600 shadow-glow-leaf"
              : "left-[calc(50%+3px)] bg-gradient-to-b from-rust-400 to-rust-600 shadow-glow-rust"
          )}
        >
          <div className="absolute inset-x-0 top-1 h-1 rounded-full bg-white/30" />
        </div>

        <button
          type="button"
          role="radio"
          aria-checked={isOn}
          onClick={() => onChange("power_on")}
          className={clsx(
            "relative z-10 flex flex-1 items-center justify-center gap-2 rounded-md font-display text-sm font-bold uppercase tracking-wide transition-colors duration-fast",
            isOn ? "text-ink-950" : "text-grey-400 hover:text-leaf-400"
          )}
        >
          <BoltIcon width={18} height={18} />
          {t("form.statusPowerOn")}
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={!isOn}
          onClick={() => onChange("load_shedding")}
          className={clsx(
            "relative z-10 flex flex-1 items-center justify-center gap-2 rounded-md font-display text-sm font-bold uppercase tracking-wide transition-colors duration-fast",
            !isOn ? "text-ink-950" : "text-grey-400 hover:text-rust-400"
          )}
        >
          <BoltOffIcon width={18} height={18} />
          {t("form.statusLoadShedding")}
        </button>
      </div>
      {/* breaker panel screws, purely decorative */}
      <div className="mt-1 flex justify-between px-1">
        <span className="h-1 w-1 rounded-full bg-white/15" />
        <span className="h-1 w-1 rounded-full bg-white/15" />
      </div>
    </div>
  );
}
