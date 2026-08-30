import type { CreateReportResult, NewReportInput, Patterns, Report, Stats, Summary } from "../types";

export interface PatternFilters {
  division?: string;
  district?: string;
  area?: string;
}

export interface ReportFilters {
  division?: string;
  status?: string;
  provider?: string;
  q?: string;
  sort?: string;
}

export async function fetchReports(filters: ReportFilters = {}): Promise<Report[]> {
  const params = new URLSearchParams();
  if (filters.division) params.set("division", filters.division);
  if (filters.status) params.set("status", filters.status);
  if (filters.provider) params.set("provider", filters.provider);
  if (filters.q) params.set("q", filters.q);
  if (filters.sort) params.set("sort", filters.sort);

  const res = await fetch(`/api/reports?${params.toString()}`);
  if (!res.ok) throw new Error(`Failed to fetch reports: ${res.status}`);
  const data = await res.json();
  return data.reports as Report[];
}

export async function fetchSummary(): Promise<Summary> {
  const res = await fetch("/api/summary");
  if (!res.ok) throw new Error(`Failed to fetch summary: ${res.status}`);
  return res.json();
}

export async function fetchStats(): Promise<Stats> {
  const res = await fetch("/api/stats");
  if (!res.ok) throw new Error(`Failed to fetch stats: ${res.status}`);
  return res.json();
}

export async function createReport(input: NewReportInput): Promise<CreateReportResult> {
  const res = await fetch("/api/reports", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Failed to create report: ${res.status}`);
  }
  const data = await res.json();
  return { report: data.report as Report, resolveToken: data.resolveToken as string };
}

export async function confirmReport(id: number): Promise<Report> {
  const res = await fetch(`/api/reports/${id}/confirm`, { method: "POST" });
  if (!res.ok) throw new Error(`Failed to confirm report: ${res.status}`);
  const data = await res.json();
  return data.report as Report;
}

/** Reports created from this same IP — recovers "My reports" after local storage is lost. */
export async function fetchMyReports(): Promise<Report[]> {
  const res = await fetch("/api/reports/mine");
  if (!res.ok) throw new Error(`Failed to fetch your reports: ${res.status}`);
  const data = await res.json();
  return data.reports as Report[];
}

/** resolveToken may be omitted when a report was only recovered via IP match, not local storage. */
export async function resolveReport(id: number, resolveToken?: string): Promise<Report> {
  const res = await fetch(`/api/reports/${id}/resolve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ resolveToken }),
  });
  if (!res.ok) throw new Error(`Failed to resolve report: ${res.status}`);
  const data = await res.json();
  return data.report as Report;
}

export async function fetchPatterns(filters: PatternFilters = {}): Promise<Patterns> {
  const params = new URLSearchParams();
  if (filters.division) params.set("division", filters.division);
  if (filters.district) params.set("district", filters.district);
  if (filters.area) params.set("area", filters.area);

  const res = await fetch(`/api/patterns?${params.toString()}`);
  if (!res.ok) throw new Error(`Failed to fetch patterns: ${res.status}`);
  return res.json();
}
