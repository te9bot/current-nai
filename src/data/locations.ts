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
