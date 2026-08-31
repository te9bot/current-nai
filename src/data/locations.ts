import raw from "../../data/locations.json";
import type { Area, Division, District } from "../types";

export const DIVISIONS = raw as Division[];

export function getDivision(divisionId: string | undefined | null): Division | undefined {
  if (!divisionId) return undefined;
  return DIVISIONS.find((d) => d.id === divisionId);
}

export function getDistricts(divisionId: string | undefined | null): District[] {
  return getDivision(divisionId)?.districts ?? [];
}

export function getDistrict(divisionId: string | undefined | null, districtId: string | undefined | null): District | undefined {
  if (!districtId) return undefined;
  return getDistricts(divisionId).find((d) => d.id === districtId);
}

export function getAreas(divisionId: string | undefined | null, districtId: string | undefined | null): Area[] {
  return getDistrict(divisionId, districtId)?.areas ?? [];
}

export function getArea(
  divisionId: string | undefined | null,
  districtId: string | undefined | null,
  areaId: string | undefined | null
): Area | undefined {
  if (!areaId) return undefined;
  return getAreas(divisionId, districtId).find((a) => a.id === areaId);
}

export function findDistrictAnyDivision(districtId: string | undefined | null): { division: Division; district: District } | undefined {
  if (!districtId) return undefined;
  for (const division of DIVISIONS) {
    const district = division.districts.find((d) => d.id === districtId);
    if (district) return { division, district };
  }
  return undefined;
}

export function localizedName(entity: { en: string; bn: string } | undefined | null, lang: string): string {
  if (!entity) return "";
  return lang.startsWith("bn") ? entity.bn : entity.en;
}

/** Loosely normalizes a place name for matching against reverse-geocoded
 *  text — strips administrative-boundary words Nominatim tacks on (e.g.
 *  "Dhaka District", "Dhaka Metropolitan", "Dhanmondi Residential Area")
 *  that don't appear in this app's own division/district/area names. */
function normalizePlaceName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(district|division|metropolitan|residential area|city corporation|corporation|thana|upazila)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Matches a reverse-geocoded division name against this app's list. Exact
 *  after normalization only — a near-miss here would silently misfile a
 *  report under the wrong division, worse than just leaving it unmatched. */
export function matchDivision(name: string | undefined | null): Division | undefined {
  if (!name) return undefined;
  const target = normalizePlaceName(name);
  return DIVISIONS.find((d) => normalizePlaceName(d.en) === target);
}

/** Tries each candidate string in order (Nominatim's state_district, county,
 *  city fields don't map 1:1 to this app's district list, so several
 *  candidates are offered) and returns the first exact normalized match. */
export function matchDistrictFromCandidates(division: Division, candidates: string[]): District | undefined {
  for (const candidate of candidates) {
    const target = normalizePlaceName(candidate);
    const hit = division.districts.find((d) => normalizePlaceName(d.en) === target);
    if (hit) return hit;
  }
  return undefined;
}

/** Same candidate-list approach as matchDistrictFromCandidates, for the
 *  area level (Nominatim's suburb/neighbourhood granularity is finer than
 *  this app's thana-level area list, so an exact match often won't be
 *  found — that's expected, not a bug, and callers should fall back to
 *  manual area selection rather than guessing). */
export function matchAreaFromCandidates(district: District, candidates: string[]): Area | undefined {
  for (const candidate of candidates) {
    const target = normalizePlaceName(candidate);
    const hit = district.areas.find((a) => normalizePlaceName(a.en) === target);
    if (hit) return hit;
  }
  return undefined;
}
