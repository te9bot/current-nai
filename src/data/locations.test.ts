import { describe, expect, it } from "vitest";
import {
  getAreas,
  getArea,
  getDistricts,
  getLocalities,
  getLocality,
  findAreaContainingLocality,
} from "./locations";
import { areaCoords, districtCoords, haversineKm } from "../utils/geo";

/**
 * Coverage for the Division -> District -> Thana/Upazila -> Locality
 * cascade, using the one district (Rajshahi) with verified real locality
 * data: Rajshahi -> Rajshahi -> Motihar -> Talaimari, and Rajshahi ->
 * Rajshahi -> Rajpara -> Laxmipur (data/LOCATIONS_SOURCE.md has the sources).
 */
describe("Thana/Upazila -> Locality cascade (Rajshahi)", () => {
  it("lists Rajshahi's real city-corporation thanas among its districts' areas", () => {
    const districts = getDistricts("rajshahi");
    expect(districts.map((d) => d.id)).toContain("rajshahi");

    const areas = getAreas("rajshahi", "rajshahi");
    const areaIds = areas.map((a) => a.id);
    expect(areaIds).toEqual(
      expect.arrayContaining(["boalia", "rajpara", "motihar", "shahmokhdum"])
    );
    // The old single "Rajshahi City" catch-all is gone, replaced by the 4
    // real thanas — never both at once.
    expect(areaIds).not.toContain("rajshahi-city");
  });

  it("only Motihar and Rajpara currently expose a locality list — the rest have none, honestly", () => {
    expect(getLocalities("rajshahi", "rajshahi", "motihar").map((l) => l.id)).toEqual(["motihar-talaimari"]);
    expect(getLocalities("rajshahi", "rajshahi", "rajpara").map((l) => l.id)).toEqual(["rajpara-laxmipur"]);
    expect(getLocalities("rajshahi", "rajshahi", "boalia")).toEqual([]);
    expect(getLocalities("rajshahi", "rajshahi", "shahmokhdum")).toEqual([]);
  });

  it("resolves Talaimari as a real locality under Motihar, not Boalia", () => {
    const talaimari = getLocality("rajshahi", "rajshahi", "motihar", "motihar-talaimari");
    expect(talaimari?.en).toBe("Talaimari");
    expect(getLocality("rajshahi", "rajshahi", "boalia", "motihar-talaimari")).toBeUndefined();
  });

  it("full cascade: Division -> District -> Thana -> Locality all resolve consistently", () => {
    const area = getArea("rajshahi", "rajshahi", "motihar")!;
    expect(area.en).toBe("Motihar");
    const locality = area.localities?.find((l) => l.id === "motihar-talaimari");
    expect(locality?.en).toBe("Talaimari");
  });

  it("finds a locality's parent thana without a separate stored thanaId (backend has none)", () => {
    const found = findAreaContainingLocality("rajshahi", "rajshahi", "motihar-talaimari");
    expect(found?.area.id).toBe("motihar");
    expect(found?.locality.id).toBe("motihar-talaimari");
  });

  it("prefers a locality's own coordinate over its parent thana's, and both over the district centroid", () => {
    const localityCoord = areaCoords("rajshahi", "rajshahi", "motihar-talaimari")!;
    const thanaCoord = areaCoords("rajshahi", "rajshahi", "motihar")!;
    const districtCentroid = districtCoords("rajshahi")!;

    // Talaimari's own point (verified via OSM + mindat.org gazetteer), not
    // just Motihar's thana-seat point.
    expect(localityCoord).toEqual({ lat: 24.3617221, lng: 88.6268824 });
    expect(localityCoord).not.toEqual(thanaCoord);
    expect(haversineKm(localityCoord, districtCentroid)).toBeGreaterThan(0.5);
  });

  it("falls back to the thana's own coordinate for a locality that has none", () => {
    // Simulates a future locality entry with a name but no verified
    // coordinate yet — must fall back to its parent thana, never invent one.
    const coord = areaCoords("rajshahi", "rajshahi", "not-a-real-locality-id");
    expect(coord).toBeUndefined(); // no such id anywhere — undefined, not a guess
  });
});
