import rawGeo from "../../data/districts-geo.json";
import { getArea } from "../data/locations";
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
 * An area's own upazila/thana/city-level coordinate — real GeoNames data for
 * most areas (see data/LOCATIONS_SOURCE.md), sourced independently of
 * whatever a report's own GPS/manual pin says. Undefined for the areas
 * listed as unmatched in that doc, and for the manual-address-typed "area"
 * free-text case where no areaId was ever recorded.
 */
export function areaCoords(
  divisionId: string | undefined | null,
  districtId: string | undefined | null,
  areaId: string | undefined | null
): LatLng | undefined {
  const area = getArea(divisionId, districtId, areaId);
  if (area && typeof area.lat === "number" && typeof area.lng === "number") {
    return { lat: area.lat, lng: area.lng };
  }
  return undefined;
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
 * unperturbed; the area/district fallbacks below are only ever a stand-in
 * for reports that never captured a real coordinate. Conflating the two was
 * the bug behind reports rendering at their district's center (e.g. Kushtia)
 * instead of the exact area the reporter confirmed (e.g. Bheramara) —
 * `districtCoords` was being applied unconditionally, discarding
 * `report.latitude`/`report.longitude` even when present.
 */
export function pinCoords(report: Report): LatLng | undefined {
  if (hasValidCoords(report)) {
    return { lat: report.latitude, lng: report.longitude };
  }
  return localityFallbackCoords(report);
}

/**
 * For a report with no exact GPS/manual pin, the most precise fallback
 * available is its own area's real coordinate (upazila/thana/city — see
 * areaCoords above) — falling back further to the district centroid only
 * when that area isn't one of the ones with real GeoNames coordinates yet
 * (data/LOCATIONS_SOURCE.md lists which). Several reports can share one
 * fallback point, which would stack their pins into a single dot — each is
 * offset by a small deterministic amount derived from its id, so the spread
 * is stable across refreshes instead of jittering. The area-level spread is
 * tighter than the district one since an upazila/thana is itself much
 * smaller than its district — a district-sized jitter there would scatter
 * pins outside the area they're actually meant to represent.
 */
function localityFallbackCoords(report: Report): LatLng | undefined {
  const area = areaCoords(report.divisionId, report.districtId, report.areaId);
  const base = area ?? districtCoords(report.districtId);
  if (!base) return undefined;
  // Two decorrelated pseudo-random values in [-1, 1] from the report id.
  const golden = 0.618033988749895;
  const a = ((report.id * golden) % 1) * 2 - 1;
  const b = ((report.id * golden * 3.0) % 1) * 2 - 1;
  const spread = area ? 0.012 : 0.045; // ≈1.3km within an area, ≈5km within a district
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
