import { useTranslation } from "react-i18next";
import { DIVISIONS, localizedName } from "../data/locations";
import { PROVIDERS, providerName } from "../data/providers";
import { SearchIcon, XIcon } from "./icons";
import clsx from "../utils/clsx";
import { EMPTY_FILTERS, type FilterState, type SortKey } from "../types";

export type { FilterState } from "../types";
export { EMPTY_FILTERS } from "../types";

interface Props {
  value: FilterState;
  onChange: (next: FilterState) => void;
}

export default function Filters({ value, onChange }: Props) {
  const { t, i18n } = useTranslation();
  const hasActiveFilters =
    value.division || value.status || value.q || value.provider || value.sort !== "latest";

  return (
    <div className="panel flex flex-col gap-2.5 p-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3 sm:p-4">
      <div className="relative flex-1">
        <SearchIcon width={16} height={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-grey-500" />
        <input
          type="text"
          value={value.q}
          onChange={(e) => onChange({ ...value, q: e.target.value })}
          placeholder={t("filters.searchPlaceholder")}
          className="h-10 w-full rounded-md border border-black/10 bg-ink-800 pl-9 pr-9 text-sm text-grey-900 placeholder:text-grey-500 outline-none transition-colors duration-fast focus:border-black/30"
        />
        {value.q && (
          <button
            type="button"
            aria-label={t("filters.clear")}
            onClick={() => onChange({ ...value, q: "" })}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-grey-500 hover:text-grey-900"
          >
            <XIcon width={14} height={14} />
          </button>
        )}
      </div>

      <select
        value={value.division}
        onChange={(e) => onChange({ ...value, division: e.target.value })}
        className="h-10 rounded-md border border-black/10 bg-ink-800 px-3 text-sm text-grey-900 outline-none transition-colors duration-fast focus:border-black/30 sm:w-44"
      >
        <option value="">{t("filters.allDivisions")}</option>
        {DIVISIONS.map((d) => (
          <option key={d.id} value={d.id}>
            {localizedName(d, i18n.language)}
          </option>
        ))}
      </select>

      <div className="flex gap-1.5 rounded-pill border border-black/10 bg-ink-800 p-1">
        {(
          [
            { key: "", label: t("filters.allStatuses") },
            { key: "power_on", label: t("status.powerOn") },
            { key: "load_shedding", label: t("status.loadShedding") },
          ] as const
        ).map((opt) => (
          <button
            key={opt.key || "all"}
            type="button"
            onClick={() => onChange({ ...value, status: opt.key })}
            className={clsx(
              "whitespace-nowrap rounded-pill px-3 py-1.5 text-xs font-semibold transition-colors duration-fast",
              value.status === opt.key
                ? opt.key === "power_on"
                  ? "bg-leaf-500 text-ink-onAccent"
                  : opt.key === "load_shedding"
                    ? "bg-rust-500 text-ink-onAccent"
                    : "bg-black/15 text-grey-900"
                : "text-grey-400 hover:text-grey-900"
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <select
        value={value.provider}
        onChange={(e) => onChange({ ...value, provider: e.target.value })}
        aria-label={t("provider.label")}
        className="h-10 rounded-md border border-black/10 bg-ink-800 px-3 text-sm text-grey-900 outline-none transition-colors duration-fast focus:border-black/30 sm:w-40"
      >
        <option value="">{t("provider.all")}</option>
        {PROVIDERS.map((p) => (
          <option key={p.id} value={p.id}>
            {providerName(p.id, i18n.language)}
          </option>
        ))}
      </select>

      <select
        value={value.sort}
        onChange={(e) => onChange({ ...value, sort: e.target.value as SortKey })}
        aria-label={t("sort.label")}
        className="h-10 rounded-md border border-black/10 bg-ink-800 px-3 text-sm text-grey-900 outline-none transition-colors duration-fast focus:border-black/30 sm:w-40"
      >
        <option value="latest">{t("sort.latest")}</option>
        <option value="longest">{t("sort.longest")}</option>
        <option value="confirmed">{t("sort.confirmed")}</option>
      </select>

      {hasActiveFilters && (
        <button
          type="button"
          onClick={() => onChange(EMPTY_FILTERS)}
          className="text-xs font-semibold text-grey-500 underline-offset-2 hover:text-grey-900 hover:underline"
        >
          {t("filters.clear")}
        </button>
      )}
    </div>
  );
}
