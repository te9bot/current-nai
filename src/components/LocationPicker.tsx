import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { LatLng } from "../utils/geo";
import { getCurrentPositionQuick, isInAppBrowser } from "../utils/geolocation";
import { LocateIcon, LoaderIcon } from "./icons";
import clsx from "../utils/clsx";

export type LocationSource = "gps" | "manual";

export interface PickedLocation {
  lat: number;
  lng: number;
  accuracy: number | null;
  source: LocationSource;
}

interface Props {
  /** Approximate centre for the selected area (district-level — the finest
   *  granularity this app has coordinates for), used only to give the map a
   *  sensible starting view. Never itself treated as the report's location. */
  areaFocus: LatLng | null;
  value: PickedLocation | null;
  onChange: (location: PickedLocation | null) => void;
  /** True while `value` is a live guess from the typed address rather than
   *  something the reporter confirmed themselves (GPS or a map tap/drag) —
   *  swaps the status line to say so instead of claiming it as confirmed. */
  previewFromAddress?: boolean;
  /** True while an address lookup is in flight and there's no pin yet. */
  geocoding?: boolean;
}

const AREA_ZOOM = 13;
const GPS_ZOOM = 17;

function isValidLatLng(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

function markerIcon(source: LocationSource): L.DivIcon {
  // Blue for GPS ("you are here", the conventional web-map color for a
  // device-detected position) vs the app's own amber accent for a manually
  // placed pin — the color itself is what tells them apart at a glance.
  const color = source === "gps" ? "#2E86FF" : "#F2B705";
  return L.divIcon({
    className: "",
    iconSize: [20, 20],
    iconAnchor: [10, 10],
    html: `<span style="
      display:block;width:20px;height:20px;border-radius:999px;
      background:${color};border:3px solid #ffffff;
      box-shadow:0 1px 6px rgba(0,0,0,.5);"></span>`,
  });
}

export default function LocationPicker({ areaFocus, value, onChange, previewFromAddress, geocoding }: Props) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const accuracyCircleRef = useRef<L.Circle | null>(null);
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState(false);

  // A manual click/drag succeeding after a failed GPS attempt should clear
  // that stale error, same as a fresh GPS success already does inline.
  useEffect(() => {
    if (value) setGeoError(false);
  }, [value]);

  // Create the map once, centred on the area's approximate location (or
  // Bangladesh generally if that isn't known yet either).
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const start = areaFocus ?? { lat: 23.685, lng: 90.3563 };

    const map = L.map(containerRef.current, {
      center: [start.lat, start.lng],
      zoom: areaFocus ? AREA_ZOOM : 7,
      zoomControl: true,
      scrollWheelZoom: false,
      attributionControl: false,
    });
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19 }).addTo(map);
    L.control
      .attribution({ prefix: false })
      .addAttribution('&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>')
      .addTo(map);

    // Manual fallback: tapping/clicking the map places or moves the pin.
    map.on("click", (e: L.LeafletMouseEvent) => {
      onChange({ lat: e.latlng.lat, lng: e.latlng.lng, accuracy: null, source: "manual" });
    });

    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
      accuracyCircleRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Recentre on the area's approximate location as the visitor narrows down
  // division/district/area — but only until a real location exists. Once
  // GPS or a manual pin sets the actual position, that position is the
  // report's location and area changes no longer move the view.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !areaFocus || value) return;
    map.setView([areaFocus.lat, areaFocus.lng], AREA_ZOOM, { animate: false });
  }, [areaFocus, value]);

  // Draw (or clear) the marker + accuracy circle whenever the picked location
  // changes, and centre the view on it — instantly, not an animated fly-to,
  // to keep this lightweight on phones.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (markerRef.current) {
      markerRef.current.remove();
      markerRef.current = null;
    }
    if (accuracyCircleRef.current) {
      accuracyCircleRef.current.remove();
      accuracyCircleRef.current = null;
    }
    if (!value) return;

    const marker = L.marker([value.lat, value.lng], {
      icon: markerIcon(value.source),
      draggable: true,
      zIndexOffset: 1000,
    }).addTo(map);
    marker.on("dragend", () => {
      const pos = marker.getLatLng();
      onChange({ lat: pos.lat, lng: pos.lng, accuracy: null, source: "manual" });
    });
    markerRef.current = marker;

    if (value.accuracy) {
      accuracyCircleRef.current = L.circle([value.lat, value.lng], {
        radius: value.accuracy,
        color: "#2E86FF",
        weight: 1,
        fillColor: "#2E86FF",
        fillOpacity: 0.12,
        interactive: false,
      }).addTo(map);
    }

    map.setView([value.lat, value.lng], Math.max(map.getZoom(), value.source === "gps" ? GPS_ZOOM : AREA_ZOOM), {
      animate: false,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  async function handleUseMyLocation() {
    setGeoError(false);
    setLocating(true);
    try {
      const { lat, lng, accuracy } = await getCurrentPositionQuick();
      if (!isValidLatLng(lat, lng)) {
        setGeoError(true);
        return;
      }
      onChange({ lat, lng, accuracy, source: "gps" });
    } catch {
      setGeoError(true);
    } finally {
      setLocating(false);
    }
  }

  return (
    <div>
      <label className="mb-1.5 block text-xs font-semibold text-grey-400">{t("form.locationSection")}</label>
      <p className="mb-2 text-[11px] text-grey-600">{t("form.locationHelp")}</p>

      <button
        type="button"
        onClick={handleUseMyLocation}
        disabled={locating}
        className="mb-2 flex h-11 w-full items-center justify-center gap-2 rounded-md border border-black/10 bg-ink-800 text-sm font-semibold text-grey-900 transition-colors duration-fast hover:border-black/30 disabled:opacity-60"
      >
        {locating ? (
          <LoaderIcon width={16} height={16} className="animate-spin" />
        ) : (
          <LocateIcon width={16} height={16} />
        )}
        {locating ? t("form.locating") : t("form.useMyLocation")}
      </button>

      <div ref={containerRef} className="h-[220px] w-full overflow-hidden rounded-md border border-black/10" />

      {geoError ? (
        // Checked ahead of `value`: if a pin was already set (GPS or manual)
        // and a later GPS attempt fails, the old pin stays on the map — but
        // the visitor still needs to know that latest tap didn't work,
        // rather than the failure being silently swallowed by the old value.
        <>
          <p className="mt-2 text-[11px] text-rust-400">{t("form.locationError")}</p>
          {isInAppBrowser() && (
            <p className="mt-1 text-[11px] text-grey-600">{t("location.inAppBrowserHint")}</p>
          )}
        </>
      ) : value && previewFromAddress ? (
        <p className="mt-2 text-[11px] font-semibold text-amber-500">{t("form.locationFromAddress")}</p>
      ) : value ? (
        <p
          className={clsx(
            "mt-2 text-[11px] font-semibold",
            value.source === "gps" ? "text-leaf-400" : "text-amber-500"
          )}
        >
          {value.source === "gps" ? t("form.locationDetectedGps") : t("form.locationDetectedManual")}
          {value.accuracy ? ` (±${Math.round(value.accuracy)}m)` : ""}
        </p>
      ) : geocoding ? (
        <p className="mt-2 text-[11px] text-grey-600">{t("form.locationSearching")}</p>
      ) : (
        <p className="mt-2 text-[11px] text-grey-600">{t("form.locationEmpty")}</p>
      )}
    </div>
  );
}
