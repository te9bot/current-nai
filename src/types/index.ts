export type ReportStatus = "power_on" | "load_shedding";

/**
 * A neighborhood/mohalla-level place nested under an Area (below) — the
 * finest granularity this dataset has verified real-world coordinates for.
 * Populated only where a real, sourced coordinate exists (see
 * data/LOCATIONS_SOURCE.md); absent everywhere else rather than guessed.
 */
export interface Locality {
  id: string;
  en: string;
  bn: string;
  lat?: number;
  lng?: number;
}

/**
 * Despite the generic name (kept as-is so existing submitted reports'
 * `areaId` values — which predate the locality tier — stay resolvable
 * unchanged), this is the Thana/Upazila/city-corporation tier: Division →
 * District → **Area** → Locality. The UI labels this dropdown
 * "Thana / Upazila"; `Locality` above is what the UI calls "Area".
 */
export interface Area {
  id: string;
  en: string;
  bn: string;
  /** Real upazila/thana/city-corporation-level coordinates (GeoNames, see
   *  data/LOCATIONS_SOURCE.md) — present for most areas, absent for the ones
   *  listed as unmatched in that doc (mainly Dhaka/Chattogram's own internal
   *  thana breakdown, which GeoNames' gazetteer doesn't carry as separate
   *  admin features). Never a substitute for a report's own GPS/manual
   *  pin — only ever used as a *more precise than district* fallback. */
  lat?: number;
  lng?: number;
  /** Neighborhood-level children, where a verified source exists (currently
   *  Rajshahi's Motihar/Rajpara thanas — see data/LOCATIONS_SOURCE.md).
   *  Absent for the vast majority of areas; the form simply has nothing to
   *  show a fourth dropdown for in that case, same as before this existed. */
  localities?: Locality[];
}

export interface District {
  id: string;
  en: string;
  bn: string;
  areas: Area[];
}

export interface Division {
  id: string;
  en: string;
  bn: string;
  districts: District[];
}

export interface Provider {
  id: string;
  en: string;
  bn: string;
  fullEn: string;
  fullBn: string;
}

export interface Report {
  id: number;
  divisionId: string;
  districtId: string;
  area: string;
  areaId: string | null;
  landmark: string | null;
  providerId: string;
  status: ReportStatus;
  outageDate: string | null;
  startTime: string | null;
  endTime: string | null;
  note: string;
  confirmations: number;
  /** Whether this anonymous visitor (via the server-side identity cookie)
   *  has already confirmed this report — drives the Confirm button's
   *  disabled state without any client-side storage. */
  confirmedByYou: boolean;
  /** Distinct anonymous "power's back" votes recorded so far. A report only
   *  actually resolves once this reaches restoreVotesNeeded. */
  restoreVotes: number;
  /** How many distinct restore votes this report needs to resolve — 1 for a
   *  barely-confirmed report, more for a strongly-confirmed one. */
  restoreVotesNeeded: number;
  /** Whether this anonymous visitor has already cast a restore vote. */
  restoredByYou: boolean;
  durationMinutes: number;
  /** Exact reporter-supplied coordinates — distinct from the area/district
   *  dropdown, which is administrative context only. Null when no GPS fix
   *  or manual pin was captured. */
  latitude: number | null;
  longitude: number | null;
  locationAccuracy: number | null;
  locationSource: "gps" | "manual" | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateReportResult {
  report: Report;
}

export interface NewReportInput {
  divisionId: string;
  districtId: string;
  area: string;
  areaId?: string | null;
  landmark?: string | null;
  providerId: string;
  status: ReportStatus;
  outageDate?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  note?: string;
  latitude?: number | null;
  longitude?: number | null;
  locationAccuracy?: number | null;
  locationSource?: "gps" | "manual" | null;
}

export interface LedgerRow {
  id: string;
  reports: number;
  minutes: number;
  ongoing: number;
}

export interface Stats {
  totalReports: number;
  outageReports: number;
  ongoingCount: number;
  ongoingRate: number;
  totalOutageMinutes: number;
  averageOutageMinutes: number;
  totalConfirmations: number;
  divisionsCovered: number;
  providersCovered: number;
  byProvider: LedgerRow[];
  byDivision: LedgerRow[];
}

export type SortKey = "latest" | "longest" | "confirmed";

export interface FilterState {
  division: string;
  status: "" | ReportStatus;
  provider: string;
  sort: SortKey;
  q: string;
}

export const EMPTY_FILTERS: FilterState = { division: "", status: "", provider: "", sort: "latest", q: "" };

export interface Summary {
  total: number;
  powerOn: number;
  loadShedding: number;
}

export interface HourlyPattern {
  hour: number;
  count: number;
}

export interface Patterns {
  hourly: HourlyPattern[];
}

export type SuggestionCategory = "new_feature" | "improvement" | "bug" | "design" | "other";

export interface NewSuggestionInput {
  message: string;
  category: SuggestionCategory;
}

/** Fully anonymous by design (see backend/main.py) — no author, no
 *  identity of any kind, just the message/category/timestamp. */
export interface Suggestion {
  id: number;
  message: string;
  category: SuggestionCategory;
  createdAt: string;
}
