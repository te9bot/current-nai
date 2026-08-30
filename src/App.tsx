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
import OutagePatterns from "./components/OutagePatterns";
import Filters, { EMPTY_FILTERS, type FilterState } from "./components/Filters";
import Board from "./components/Board";
import ReportForm from "./components/ReportForm";
import MyReports from "./components/MyReports";
import Faq from "./components/Faq";
import AboutPage from "./components/AboutPage";
import Reveal from "./components/Reveal";
import { useReports } from "./hooks/useReports";
import { useRoute } from "./hooks/useRoute";
import { getDistrict } from "./data/locations";
import { providerName } from "./data/providers";
import { readMyReports } from "./utils/myReports";
import type { Report } from "./types";
import type { LatLng } from "./utils/geo";

export default function App() {
  const { t, i18n } = useTranslation();
  const [route, navigate] = useRoute();
  const { reports, summary, stats, loading, error, refresh, applyUpdate } = useReports();
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);
  const [formOpen, setFormOpen] = useState(false);
  const [myReportsOpen, setMyReportsOpen] = useState(false);
  const [hasMyReports, setHasMyReports] = useState(false);
  const [localReports, setLocalReports] = useState<Report[]>([]);
  const [showSplash, setShowSplash] = useState(true);
  const [mapFocus, setMapFocus] = useState<LatLng | null>(null);

  useEffect(() => {
    setHasMyReports(readMyReports().size > 0);
  }, [formOpen]);

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

  /** Keep an optimistic confirm/resolve visible in both the server list and any local additions. */
  function handleConfirmed(updated: Report) {
    applyUpdate(updated);
    setLocalReports((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
  }

  function handleResolved(updated: Report) {
    applyUpdate(updated);
    setLocalReports((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
  }

  const myReportTokens = useMemo(() => readMyReports(), [myReportsOpen]);
  const myReports = useMemo(
    () => allReports.filter((r) => myReportTokens.has(r.id)),
    [allReports, myReportTokens]
  );

  if (route === "/about") {
    return <AboutPage onBack={() => navigate("/")} />;
  }

  return (
    <div className="relative min-h-screen bg-ink-950">
      <MapBackdrop focus={mapFocus} />
      {showSplash && <Splash reports={allReports.slice(0, 5)} onDismiss={() => setShowSplash(false)} />}

      {/* Everything above the backdrop */}
      <div className="relative z-10">
        <Header
          onReportClick={() => setFormOpen(true)}
          onMyReportsClick={() => setMyReportsOpen(true)}
          showMyReports={hasMyReports}
        />
        <Ticker reports={allReports} />

        <main className="mx-auto max-w-6xl px-3 py-5 sm:px-6 sm:py-8">
          <div className="mb-4">
            <SummaryCounts summary={summary} loading={loading} />
          </div>

          <Reveal>
            <div className="mb-4 sm:mb-6">
              <NearbyPanel reports={allReports} onRegionChange={setMapFocus} />
            </div>
          </Reveal>

          <Reveal>
            <div className="mb-4 sm:mb-6">
              <StatsPanel stats={stats} loading={loading} />
            </div>
          </Reveal>

          <Reveal>
            <div className="mb-4 sm:mb-6">
              <LedgerTable stats={stats} loading={loading} />
            </div>
          </Reveal>

          <Reveal>
            <div className="mb-4 sm:mb-6">
              <OutagePatterns />
            </div>
          </Reveal>

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

          <Reveal>
            <div className="mb-4 mt-4 sm:mt-6">
              <Faq />
            </div>
          </Reveal>

          <footer className="mt-8 border-t border-black/8 pt-6 text-center text-[11px] leading-relaxed text-grey-600">
            <p>{t("footer.disclaimer")}</p>
            <p className="mt-1">{t("footer.builtWith")}</p>
            <button
              type="button"
              onClick={() => navigate("/about")}
              className="mt-3 font-semibold text-grey-500 underline-offset-2 hover:text-grey-900 hover:underline"
            >
              {t("about.link")}
            </button>
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

      {myReportsOpen && (
        <MyReports
          reports={myReports}
          tokens={myReportTokens}
          onClose={() => setMyReportsOpen(false)}
          onResolved={handleResolved}
        />
      )}
    </div>
  );
}
