import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Report } from "../types";
import { getDivision, getDistrict, localizedName } from "../data/locations";
import { providerName } from "../data/providers";
import { BANGLADESH_CENTER, BANGLADESH_BOUNDS, pinCoords, type LatLng } from "../utils/geo";
import { formatDuration, formatRelativeTime, toLocalizedDigits } from "../utils/time";

interface Props {
  reports: Report[];
  /** When set, the map flies here and drops a "you are here" marker. */
  focus: LatLng | null;
  focusLabel?: string;
}

/** Escape values before they go into Leaflet popup HTML. */
function esc(value: string): string {
  return value.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string
  );
}

function markerIcon(status: Report["status"]): L.DivIcon {
  const on = status === "power_on";
  const color = on ? "#50AF6C" : "#E4573D";
  const glow = on ? "rgba(80,175,108,.55)" : "rgba(228,87,61,.55)";
  return L.divIcon({
    className: "",
    iconSize: [16, 16],
    iconAnchor: [8, 8],
    html: `<span style="
      display:block;width:16px;height:16px;border-radius:999px;
      background:${color};border:2px solid rgba(0,0,0,.65);
      box-shadow:0 0 12px ${glow};"></span>`,
  });
}

const focusIcon = L.divIcon({
  className: "",
  iconSize: [22, 22],
  iconAnchor: [11, 11],
  html: `<span style="
    display:block;width:22px;height:22px;border-radius:999px;
    border:2px solid #141414;background:rgba(20,20,20,.15);
    box-shadow:0 0 0 4px rgba(20,20,20,.12);"></span>`,
});

export default function MapView({ reports, focus, focusLabel }: Props) {
  const { t, i18n } = useTranslation();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerLayerRef = useRef<L.LayerGroup | null>(null);
  const focusMarkerRef = useRef<L.Marker | null>(null);

  // Create the map once.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [BANGLADESH_CENTER.lat, BANGLADESH_CENTER.lng],
      zoom: 7,
      minZoom: 7,
      zoomControl: true,
      scrollWheelZoom: true,
      // The default control adds a "Leaflet" credit alongside the tile
      // attribution; that part isn't required by anything, so it's turned
      // off here and a minimal control (OSM credit only) is added below.
      attributionControl: false,
      // Keep the view on Bangladesh — panning past the border springs back.
      // fitBounds is deliberately not used: in a wide, short container it fits
      // the box by height and zooms out far enough to show half of India.
      maxBounds: BANGLADESH_BOUNDS,
      maxBoundsViscosity: 1.0,
    });

    // Standard OSM tiles: free, keyless, and light by default — matching the
    // app's bright theme with no filtering needed.
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
    }).addTo(map);

    // OpenStreetMap's tile usage policy requires this credit — kept, but as
    // small and unobtrusive as the policy's "reasonably prominent" bar allows.
    L.control
      .attribution({ prefix: false })
      .addAttribution('&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors')
      .addTo(map);

    markerLayerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      markerLayerRef.current = null;
      focusMarkerRef.current = null;
    };
  }, []);

  // Redraw report pins whenever the data (or language) changes.
  useEffect(() => {
    const layer = markerLayerRef.current;
    if (!layer) return;
    layer.clearLayers();

    const now = Date.now();
    for (const report of reports) {
      const coords = pinCoords(report);
      if (!coords) continue;

      const district = getDistrict(report.divisionId, report.districtId);
      const division = getDivision(report.divisionId);
      const localize = (v: string) => toLocalizedDigits(v, i18n.language);

      const statusLabel = report.status === "power_on" ? t("status.powerOn") : t("status.loadShedding");
      const statusColor = report.status === "power_on" ? "#6BC183" : "#EB7C6C";
      const provider = providerName(report.providerId, i18n.language);

      const lines = [
        `<div style="font-weight:700;font-size:14px;margin-bottom:2px">${esc(report.area)}</div>`,
        `<div style="color:#54544F;font-size:11px;margin-bottom:6px">${esc(
          [localizedName(district, i18n.language), localizedName(division, i18n.language)]
            .filter(Boolean)
            .join(", ")
        )}</div>`,
        `<div style="color:${statusColor};font-weight:600;font-size:12px">${esc(statusLabel)}${
          report.durationMinutes > 0 ? ` · ${esc(localize(formatDuration(report.durationMinutes, t)))}` : ""
        }</div>`,
      ];
      if (provider) {
        lines.push(`<div style="color:#54544F;font-size:11px;margin-top:4px">${esc(provider)}</div>`);
      }
      if (report.note) {
        lines.push(`<div style="color:#2E2E2E;font-size:12px;margin-top:6px">${esc(report.note)}</div>`);
      }
      lines.push(
        `<div style="color:#6C6C68;font-size:11px;margin-top:6px">${esc(
          localize(formatRelativeTime(report.createdAt, now, t))
        )} · ${esc(localize(t("confirm.count", { count: report.confirmations })))}</div>`
      );

      L.marker([coords.lat, coords.lng], { icon: markerIcon(report.status) })
        .bindPopup(`<div style="min-width:180px">${lines.join("")}</div>`, { closeButton: true })
        .addTo(layer);
    }
  }, [reports, i18n.language, t]);

  // Fly to the chosen area and mark it.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (focusMarkerRef.current) {
      focusMarkerRef.current.remove();
      focusMarkerRef.current = null;
    }
    if (!focus) return;

    // Zoomed in enough that a border district (India wraps most of the
    // country) doesn't fly out to a view dominated by neighbouring territory.
    map.flyTo([focus.lat, focus.lng], 11, { duration: 0.8 });
    const marker = L.marker([focus.lat, focus.lng], { icon: focusIcon, zIndexOffset: 1000 }).addTo(map);
    if (focusLabel) marker.bindTooltip(focusLabel, { direction: "top", offset: [0, -12] });
    focusMarkerRef.current = marker;
  }, [focus, focusLabel]);

  return (
    <div
      ref={containerRef}
      className="h-[340px] w-full sm:h-[420px]"
      role="region"
      aria-label={t("map.title")}
    />
  );
}
