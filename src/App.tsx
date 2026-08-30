import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import Header from "./components/Header";
import Splash from "./components/Splash";
import MapBackdrop from "./components/MapBackdrop";
import Ticker from "./components/Ticker";
import SummaryCounts from "./components/SummaryCounts";
import StatsPanel from "./components/StatsPanel";
import NearbyPanel from "./components/NearbyPanel";
import LedgerTable from "./components/LedgerTable";
import Filters, { EMPTY_FILTERS, type FilterState } from "./components/Filters";
import Board from "./components/Board";
import ReportForm from "./components/ReportForm";
import { useReports } from "./hooks/useReports";
import { getDistrict } from "./data/locations";
import { providerName } from "./data/providers";
import type { Report } from "./types";

export default function App() {
  const { t, i18n } = useTranslation();
  const { reports, summary, stats, loading, error, refresh, applyConfirmed } = useReports();
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);
  const [formOpen, setFormOpen] = useState(false);
  const [localReports, setLocalReports] = useState<Report[]>([]);
  const [showSplash, setShowSplash] = useState(true);

  useEffect(() => {
    document.documentElement.lang = i18n.language.startsWith("bn") ? "bn" : "en";
  }, [i18n.language]);

  const allReports = useMemo(() => {
    const localIds = new Set(localReports.map((r) => r.id));
    return [...localReports, ...reports.filter((r) => !localIds.has(r.id))].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [reports, localReports]);

  const filteredReports = useMemo(() => {
    const q = filters.q.trim().toLowerCase();
    const matched = allReports.filter((r) => {
      if (filters.division && r.divisionId !== filters.division) return false;
      if (filters.status && r.status !== filters.status) return false;
      if (filters.provider && r.providerId !== filters.provider) return false;
      if (q) {
        const district = getDistrict(r.divisionId, r.districtId);
        const haystack = [r.area, district?.en, district?.bn, providerName(r.providerId, "en")]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });

    if (filters.sort === "longest") {
      return [...matched].sort((a, b) => b.durationMinutes - a.durationMinutes);
    }
    if (filters.sort === "confirmed") {
      return [...matched].sort((a, b) => b.confirmations - a.confirmations);
    }
    return matched;
  }, [allReports, filters]);

  const hasFilters = Boolean(filters.division || filters.status || filters.provider || filters.q);

  /** Keep an optimistic confirm visible in both the server list and any local additions. */
  function handleConfirmed(updated: Report) {
    applyConfirmed(updated);
    setLocalReports((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
  }

  return (
    <div className="relative min-h-screen bg-ink-950">
      <MapBackdrop />
      {showSplash && <Splash latestReport={allReports[0] ?? null} onDismiss={() => setShowSplash(false)} />}

      {/* Everything above the backdrop */}
      <div className="relative z-10">
        <Header onReportClick={() => setFormOpen(true)} />
        <Ticker reports={allReports} />

        <main className="mx-auto max-w-6xl px-3 py-5 sm:px-6 sm:py-8">
          <div className="mb-4">
            <SummaryCounts summary={summary} />
          </div>

          <div className="mb-4 sm:mb-6">
            <NearbyPanel reports={allReports} />
          </div>

          <div className="mb-4 sm:mb-6">
            <StatsPanel stats={stats} />
          </div>

          <div className="mb-4 sm:mb-6">
            <LedgerTable stats={stats} />
          </div>

          <div className="mb-4">
            <Filters value={filters} onChange={setFilters} />
          </div>

          <Board
            reports={filteredReports}
            loading={loading}
            error={error}
            hasFilters={hasFilters}
            onConfirmed={handleConfirmed}
          />

          <footer className="mt-8 border-t border-white/8 pt-6 text-center text-[11px] leading-relaxed text-grey-600">
            <p>{t("footer.disclaimer")}</p>
            <p className="mt-1">{t("footer.builtWith")}</p>
          </footer>
        </main>
      </div>

      {formOpen && (
        <ReportForm
          onClose={() => setFormOpen(false)}
          onCreated={(report) => {
            setLocalReports((prev) => [report, ...prev]);
            refresh();
          }}
        />
      )}
    </div>
  );
}
