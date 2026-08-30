import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Report } from "../types";
import { DIVISIONS, getDistricts, getDistrict, localizedName } from "../data/locations";
import { districtCoords, reportsNear, formatKm, type LatLng } from "../utils/geo";
import MapView from "./MapView";
import StatusBadge from "./StatusBadge";
import { SearchIcon } from "./icons";
import { formatDuration, toLocalizedDigits } from "../utils/time";
import clsx from "../utils/clsx";

const RADIUS_OPTIONS = [25, 50, 100, 0] as const; // 0 = no limit

export default function NearbyPanel({ reports }: { reports: Report[] }) {
  const { t, i18n } = useTranslation();
  const [divisionId, setDivisionId] = useState("");
  const [districtId, setDistrictId] = useState("");
  const [radiusKm, setRadiusKm] = useState<number>(50);
  const [geoState, setGeoState] = useState<"idle" | "locating" | "denied" | "unsupported">("idle");
  const [myLocation, setMyLocation] = useState<LatLng | null>(null);

  const localize = (v: string) => toLocalizedDigits(v, i18n.language);
  const districts = getDistricts(divisionId);

  // Browser location wins if the user granted it; otherwise the picked district.
  const origin: LatLng | null = useMemo(() => {
    if (myLocation) return myLocation;
    return districtCoords(districtId) ?? null;
  }, [myLocation, districtId]);

  const originLabel = useMemo(() => {
    if (myLocation) return t("map.yourLocation");
    const district = getDistrict(divisionId, districtId);
    return district ? localizedName(district, i18n.language) : "";
  }, [myLocation, divisionId, districtId, i18n.language, t]);

  const nearby = useMemo(() => {
    if (!origin) return [];
    return reportsNear(reports, origin, radiusKm === 0 ? Infinity : radiusKm).slice(0, 25);
  }, [reports, origin, radiusKm]);

  function useMyLocation() {
    if (!("geolocation" in navigator)) {
      setGeoState("unsupported");
      return;
    }
    setGeoState("locating");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setMyLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setGeoState("idle");
      },
      () => setGeoState("denied"),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 }
    );
  }

  function clearLocation() {
    setMyLocation(null);
    setGeoState("idle");
  }

  return (
    <section className="panel overflow-hidden">
      <div className="border-b border-white/8 px-4 py-3">
        <h2 className="font-display text-base font-bold text-white">{t("map.title")}</h2>
        <p className="text-xs text-grey-500">{t("map.subtitle")}</p>
      </div>

      {/* Area picker */}
      <div className="flex flex-col gap-2.5 border-b border-white/8 px-4 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
        <select
          value={divisionId}
          onChange={(e) => {
            setDivisionId(e.target.value);
            setDistrictId("");
          }}
          aria-label={t("form.division")}
          className="h-10 rounded-md border border-white/10 bg-ink-800 px-3 text-sm text-white outline-none transition-colors duration-fast focus:border-leaf-500/60 sm:w-44"
        >
          <option value="">{t("map.pickDivision")}</option>
          {DIVISIONS.map((d) => (
            <option key={d.id} value={d.id}>
              {localizedName(d, i18n.language)}
            </option>
          ))}
        </select>

        <select
          value={districtId}
          onChange={(e) => {
            setDistrictId(e.target.value);
            clearLocation();
          }}
          disabled={!divisionId}
          aria-label={t("form.district")}
          className="h-10 rounded-md border border-white/10 bg-ink-800 px-3 text-sm text-white outline-none transition-colors duration-fast focus:border-leaf-500/60 disabled:opacity-40 sm:w-44"
        >
          <option value="">
            {divisionId ? t("map.pickDistrict") : t("form.districtPlaceholderNoDivision")}
          </option>
          {districts.map((d) => (
            <option key={d.id} value={d.id}>
              {localizedName(d, i18n.language)}
            </option>
          ))}
        </select>

        <select
          value={radiusKm}
          onChange={(e) => setRadiusKm(Number(e.target.value))}
          aria-label={t("map.radius")}
          className="h-10 rounded-md border border-white/10 bg-ink-800 px-3 text-sm text-white outline-none transition-colors duration-fast focus:border-leaf-500/60 sm:w-36"
        >
          {RADIUS_OPTIONS.map((r) => (
            <option key={r} value={r}>
              {r === 0 ? t("map.anyDistance") : localize(t("map.withinKm", { km: r }))}
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={myLocation ? clearLocation : useMyLocation}
          className="inline-flex h-10 items-center gap-1.5 rounded-pill border border-white/10 px-3.5 text-xs font-semibold text-grey-300 transition-colors duration-fast hover:border-white/25 hover:text-white"
        >
          <SearchIcon width={14} height={14} />
          {myLocation
            ? t("map.clearLocation")
            : geoState === "locating"
              ? t("map.locating")
              : t("map.useMyLocation")}
        </button>

        {geoState === "denied" && <span className="text-[11px] text-rust-400">{t("map.locationDenied")}</span>}
        {geoState === "unsupported" && (
          <span className="text-[11px] text-rust-400">{t("map.locationUnsupported")}</span>
        )}
      </div>

      <MapView reports={reports} focus={origin} focusLabel={originLabel || undefined} />

      {/* Nearby results */}
      <div className="border-t border-white/8">
        {!origin ? (
          <p className="px-4 py-6 text-center text-sm text-grey-500">{t("map.pickToSeeNearby")}</p>
        ) : nearby.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-grey-500">{t("map.noneNearby")}</p>
        ) : (
          <>
            <div className="flex items-center justify-between px-4 py-2.5">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-grey-500">
                {t("map.nearbyTitle", { area: originLabel })}
              </h3>
              <span className="font-mono text-[11px] text-grey-500">
                {localize(t("board.reportsCount", { count: nearby.length }))}
              </span>
            </div>
            <ul className="max-h-[300px] overflow-y-auto">
              {nearby.map(({ report, distanceKm }) => (
                <li
                  key={report.id}
                  className="flex items-center gap-3 border-t border-white/8 px-4 py-2.5 text-sm hover:bg-white/[0.02]"
                >
                  <span
                    className={clsx(
                      "h-2 w-2 shrink-0 rounded-full",
                      report.status === "power_on" ? "bg-leaf-500" : "bg-rust-500"
                    )}
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-semibold text-white">{report.area}</span>
                      <StatusBadge status={report.status} size="sm" />
                    </div>
                    <span className="text-[11px] text-grey-500">
                      {localizedName(getDistrict(report.divisionId, report.districtId), i18n.language)}
                      {report.durationMinutes > 0 &&
                        ` · ${localize(formatDuration(report.durationMinutes, t))}`}
                    </span>
                  </div>
                  <span className="shrink-0 font-mono text-[11px] text-grey-400">
                    {localize(t("map.kmAway", { km: formatKm(distanceKm) }))}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      <p className="border-t border-white/8 px-4 py-3 text-[11px] leading-relaxed text-grey-600">
        {t("map.accuracyNote")}
      </p>
    </section>
  );
}
