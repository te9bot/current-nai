import rawGeo from "../../data/districts-geo.json";
import type { Report } from "../types";

export interface LatLng {
  lat: number;
  lng: number;
}

const GEO = rawGeo as unknown as Record<string, LatLng>;

/** Geographic centre of Bangladesh — the map's default view. */
export const BANGLADESH_CENTER: LatLng = { lat: 23.685, lng: 90.3563 };

/**
 * Bounding box for Bangladesh, with a small margin so border districts aren't
 * pinned against the edge. The map is clamped to this so the view stays on the
 * country instead of drifting into neighbouring regions.
 */
export const BANGLADESH_BOUNDS: [[number, number], [number, number]] = [
  [20.3, 87.8],
  [26.9, 92.9],
];

export function districtCoords(districtId: string | undefined | null): LatLng | undefined {
  if (!districtId) return undefined;
  const c = GEO[districtId];
  return c && typeof c.lat === "number" ? c : undefined;
}

/**
 * Great-circle distance in kilometres between two points — as exact as the
 * two LatLngs it's given, which for a report is its own GPS/manual pin when
 * it has one, or otherwise its district's centroid (see pinCoords below).
 */
export function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function hasValidCoords(report: Report): report is Report & { latitude: number; longitude: number } {
  return (
    typeof report.latitude === "number" &&
    typeof report.longitude === "number" &&
    Number.isFinite(report.latitude) &&
    Number.isFinite(report.longitude) &&
    report.latitude >= -90 &&
    report.latitude <= 90 &&
    report.longitude >= -180 &&
    report.longitude <= 180
  );
}

/**
 * A report's exact GPS/manual pin — when the reporter provided one — is
 * always the true position and must be used as-is, unrounded and
 * unperturbed; a district centroid (below) is only ever a stand-in for
 * reports that never captured a real coordinate. Conflating the two was the
 * bug behind reports rendering at their district's center (e.g. Kushtia)
 * instead of the exact area the reporter confirmed (e.g. Bheramara) —
 * `districtCoords` was being applied unconditionally, discarding
 * `report.latitude`/`report.longitude` even when present.
 */
export function pinCoords(report: Report): LatLng | undefined {
  if (hasValidCoords(report)) {
    return { lat: report.latitude, lng: report.longitude };
  }
  return districtFallbackCoords(report);
}

/**
 * District-centroid-plus-jitter fallback, used only for reports that never
 * captured an exact coordinate. Several such reports can share one district
 * centroid, which would stack their pins into a single dot — each is offset
 * by a small deterministic amount derived from its id, so the spread is
 * stable across refreshes instead of jittering.
 */
function districtFallbackCoords(report: Report): LatLng | undefined {
  const base = districtCoords(report.districtId);
  if (!base) return undefined;
  // Two decorrelated pseudo-random values in [-1, 1] from the report id.
  const golden = 0.618033988749895;
  const a = ((report.id * golden) % 1) * 2 - 1;
  const b = ((report.id * golden * 3.0) % 1) * 2 - 1;
  const spread = 0.045; // ≈5 km, keeps pins inside their own district
  return { lat: base.lat + a * spread, lng: base.lng + b * spread };
}

export interface NearbyReport {
  report: Report;
  distanceKm: number;
}

/** Reports sorted by distance from a point, nearest first. Uses each
 *  report's own exact coordinates when it has one (same precedence as
 *  pinCoords above), falling back to its district centroid only when it
 *  doesn't — otherwise a report with a real pin in, say, Bheramara would be
 *  measured from Kushtia's centroid instead, skewing both the distance
 *  shown and which reports "nearby" even includes. */
export function reportsNear(reports: Report[], origin: LatLng, radiusKm = Infinity): NearbyReport[] {
  const out: NearbyReport[] = [];
  for (const report of reports) {
    const coords = pinCoords(report);
    if (!coords) continue;
    const distanceKm = haversineKm(origin, coords);
    if (distanceKm <= radiusKm) out.push({ report, distanceKm });
  }
  return out.sort((x, y) => x.distanceKm - y.distanceKm);
}

export function formatKm(km: number): string {
  if (km < 1) return "<1";
  if (km < 10) return km.toFixed(1);
  return String(Math.round(km));
}
