import { useCallback, useEffect, useState } from "react";
import { fetchReports, fetchStats, fetchSummary } from "../api/reports";
import type { Report, Stats, Summary } from "../types";

const POLL_INTERVAL_MS = 17_000;

const EMPTY_STATS: Stats = {
  totalReports: 0,
  outageReports: 0,
  ongoingCount: 0,
  ongoingRate: 0,
  totalOutageMinutes: 0,
  averageOutageMinutes: 0,
  totalConfirmations: 0,
  divisionsCovered: 0,
  providersCovered: 0,
  byProvider: [],
  byDivision: [],
};

export function useReports() {
  const [reports, setReports] = useState<Report[]>([]);
  const [summary, setSummary] = useState<Summary>({ total: 0, powerOn: 0, loadShedding: 0 });
  const [stats, setStats] = useState<Stats>(EMPTY_STATS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async (isInitial = false) => {
    try {
      const [reportsData, summaryData, statsData] = await Promise.all([
        fetchReports(),
        fetchSummary(),
        fetchStats(),
      ]);
      setReports(reportsData);
      setSummary(summaryData);
      setStats(statsData);
      setError(false);
    } catch {
      setError(true);
    } finally {
      if (isInitial) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(true);
    const id = setInterval(() => load(false), POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [load]);

  const refresh = useCallback(() => load(false), [load]);

  /** Optimistic local patch so confirm/resolve actions feel instant. */
  const applyUpdate = useCallback((updated: Report) => {
    setReports((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
  }, []);

  return { reports, summary, stats, loading, error, refresh, applyUpdate };
}
