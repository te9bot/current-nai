import { describe, expect, it } from "vitest";
import { areaCoords, districtCoords, haversineKm, pinCoords, reportsNear } from "./geo";
import type { Report } from "../types";

/**
 * Regression coverage for the bug where GPS detected Khulna → Kushtia →
 * Bheramara, but the submitted report's marker rendered at Kushtia's
 * district centroid instead of the exact Bheramara location — because
 * `pinCoords` was applying the district centroid unconditionally instead of
 * preferring the report's own stored coordinate.
 */

const BASE_REPORT: Report = {
  id: 1,
  divisionId: "khulna",
  districtId: "kushtia",
  area: "Bheramara",
  areaId: "bheramara",
  landmark: null,
  providerId: "unknown",
  status: "load_shedding",
  outageDate: "2026-01-01",
  startTime: "10:00",
  endTime: null,
  note: "",
  confirmations: 0,
  confirmedByYou: false,
  restoreVotes: 0,
  restoreVotesNeeded: 1,
  restoredByYou: false,
  durationMinutes: 0,
  latitude: null,
  longitude: null,
  locationAccuracy: null,
  locationSource: null,
  createdAt: "2026-01-01T10:00:00.000Z",
  updatedAt: "2026-01-01T10:00:00.000Z",
};

// Real, exact Bheramara coordinates (as GPS would report them) — deliberately
// distinct from both Kushtia's district centroid and Bheramara's own
// upazila-level centroid, so a test passing can't be an accident of the
// fallback happening to land close by.
const EXACT_GPS_BHERAMARA = { lat: 24.0301, lng: 88.9847 };
const KUSHTIA_DISTRICT_CENTROID = districtCoords("kushtia")!;
const BHERAMARA_AREA_COORD = areaCoords("khulna", "kushtia", "bheramara")!;

describe("pinCoords — exact coordinate preservation", () => {
  it("uses the report's exact GPS coordinate, never the district centroid", () => {
    const report: Report = {
      ...BASE_REPORT,
      latitude: EXACT_GPS_BHERAMARA.lat,
      longitude: EXACT_GPS_BHERAMARA.lng,
      locationSource: "gps",
    };
    const coords = pinCoords(report)!;
    expect(coords.lat).toBe(EXACT_GPS_BHERAMARA.lat);
    expect(coords.lng).toBe(EXACT_GPS_BHERAMARA.lng);
    // The historical bug: this used to equal the district centroid exactly.
    expect(coords).not.toEqual(KUSHTIA_DISTRICT_CENTROID);
  });

  it("uses a manually-tapped coordinate exactly, overriding whatever GPS/area info is also present", () => {
    const manualTap = { lat: 23.85, lng: 89.02 }; // a different point the reporter chose deliberately
    const report: Report = {
      ...BASE_REPORT,
      latitude: manualTap.lat,
      longitude: manualTap.lng,
      locationSource: "manual",
    };
    const coords = pinCoords(report)!;
    expect(coords).toEqual(manualTap);
  });

  it("survives a refresh unchanged — pinCoords is a pure function of the stored report, not session state", () => {
    const report: Report = {
      ...BASE_REPORT,
      latitude: EXACT_GPS_BHERAMARA.lat,
      longitude: EXACT_GPS_BHERAMARA.lng,
      locationSource: "gps",
    };
    expect(pinCoords(report)).toEqual(pinCoords({ ...report }));
  });
});

describe("pinCoords — fallback priority when no exact coordinate exists", () => {
  it("falls back to the area's own (upazila/city) coordinate before the district centroid", () => {
    const report: Report = { ...BASE_REPORT, latitude: null, longitude: null };
    const coords = pinCoords(report)!;
    // Bheramara's real upazila coordinate, not Kushtia's district centroid —
    // this is the exact scenario from the original bug report, minus the
    // reporter ever having captured a GPS/manual pin at all.
    expect(coords.lat).toBeCloseTo(BHERAMARA_AREA_COORD.lat, 1);
    expect(coords.lng).toBeCloseTo(BHERAMARA_AREA_COORD.lng, 1);
    const distanceFromDistrictCentroid = haversineKm(coords, KUSHTIA_DISTRICT_CENTROID);
    expect(distanceFromDistrictCentroid).toBeGreaterThan(10); // real ~16km gap
  });

  it("falls back to the district centroid only when the area itself has no coordinate", () => {
    const report: Report = {
      ...BASE_REPORT,
      areaId: "some-area-not-in-geonames-yet",
      latitude: null,
      longitude: null,
    };
    const coords = pinCoords(report)!;
    expect(coords.lat).toBeCloseTo(KUSHTIA_DISTRICT_CENTROID.lat, 1);
    expect(coords.lng).toBeCloseTo(KUSHTIA_DISTRICT_CENTROID.lng, 1);
  });

  it("never lets an out-of-range stored coordinate pass through instead of falling back", () => {
    const report: Report = { ...BASE_REPORT, latitude: 999, longitude: 999 };
    const coords = pinCoords(report)!;
    expect(coords.lat).not.toBe(999);
  });
});

describe("nearby-report distance — must use exact coordinates, not centroids", () => {
  it("measures distance from the report's exact coordinate, not its district's centroid", () => {
    const exact: Report = {
      ...BASE_REPORT,
      id: 2,
      latitude: EXACT_GPS_BHERAMARA.lat,
      longitude: EXACT_GPS_BHERAMARA.lng,
      locationSource: "gps",
    };
    const [nearby] = reportsNear([exact], EXACT_GPS_BHERAMARA);
    // Standing exactly at the report's own coordinate, distance must read ~0 —
    // if this were (bugged) measuring from the district centroid instead, it
    // would read the real ~16km gap between Bheramara and Kushtia's centroid.
    expect(nearby.distanceKm).toBeLessThan(0.01);
  });
});
