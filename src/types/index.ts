export type ReportStatus = "power_on" | "load_shedding";

export interface Area {
  id: string;
  en: string;
  bn: string;
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
