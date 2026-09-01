import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import Header from "./components/Header";
import Splash from "./components/Splash";
import Ticker from "./components/Ticker";
import SummaryCounts from "./components/SummaryCounts";
import Reveal from "./components/Reveal";
import { useReports } from "./hooks/useReports";
import { useRoute } from "./hooks/useRoute";
import { getDistrict } from "./data/locations";
import { providerName } from "./data/providers";
import { EMPTY_FILTERS, type FilterState, type Report } from "./types";
import type { LatLng } from "./utils/geo";

// Leaflet (and everything that imports it) is code-split out of the main
// bundle: it's a sizeable dependency that none of these need for first
// paint, so keeping it out of the initial chunk shrinks the JS the browser
// must download/parse/execute before anything on screen can render.
const MapBackdrop = lazy(() => import("./components/MapBackdrop"));
const ReportForm = lazy(() => import("./components/ReportForm"));
const OnboardingGuide = lazy(() => import("./components/OnboardingGuide"));
// NearbyPanel sits entirely behind the splash overlay on first load too (its
// own embedded map is already deferred via deferMap below) — splitting the
// rest of it into its own chunk means the browser doesn't have to parse its
// code before it can paint the splash. It's still fetched immediately
// (unlike MapBackdrop, it isn't gated on splash dismissal), just off the
// main bundle's critical path.
const NearbyPanel = lazy(() => import("./components/NearbyPanel"));
// Everything from StatsPanel down is below the fold on first load — grouped
// into one chunk so none of it competes with the hero/splash for bandwidth
// or parse time. It fetches in the background regardless, so it's normally
// already cached by the time a visitor scrolls this far.
const BelowFold = lazy(() => import("./components/BelowFold"));
// Only reachable via the /about route, never the landing page itself.
const AboutPage = lazy(() => import("./components/AboutPage"));
// Only reachable via the /suggestions route, never the landing page itself.
const SuggestionsPage = lazy(() => import("./components/SuggestionsPage"));

// Same convention as i18next's own language cache key (current-nai-language)
// — a plain client-side preference flag, not report/session identity, so it
// doesn't need the anonymous server-side cookie system reports use.
const ONBOARDING_STORAGE_KEY = "current-nai-onboarding-completed";

export default function App() {
  const { t, i18n } = useTranslation();
  const [route, navigate] = useRoute();
  const { reports, summary, stats, loading, error, refresh, applyUpdate } = useReports();
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);
  const [formOpen, setFormOpen] = useState(false);
  const [localReports, setLocalReports] = useState<Report[]>([]);
  const [showSplash, setShowSplash] = useState(true);
  const [mapFocus, setMapFocus] = useState<LatLng | null>(null);
  const [onboardingCompleted, setOnboardingCompleted] = useState(
    () => localStorage.getItem(ONBOARDING_STORAGE_KEY) === "1"
  );
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    document.documentElement.lang = i18n.language.startsWith("bn") ? "bn" : "en";
  }, [i18n.language]);

  // Auto-show once, right after the splash is dismissed, for genuinely new
  // visitors only — never again once they've skipped or finished it.
  useEffect(() => {
    if (!showSplash && !onboardingCompleted) setShowOnboarding(true);
  }, [showSplash, onboardingCompleted]);

  function markOnboardingComplete() {
    localStorage.setItem(ONBOARDING_STORAGE_KEY, "1");
    setOnboardingCompleted(true);
  }

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

  if (route === "/about") {
    return (
      <Suspense fallback={null}>
        <AboutPage onBack={() => navigate("/")} />
      </Suspense>
    );
  }

  if (route === "/suggestions") {
    return (
      <Suspense fallback={null}>
        <SuggestionsPage onBack={() => navigate("/")} />
      </Suspense>
    );
  }

  return (
    <div className="relative min-h-screen bg-ink-950">
      {/* Purely decorative — invisible behind the splash anyway, so there's
          no reason to load Leaflet or fetch a single map tile until the
          splash is gone. Mounting it immediately was previously the mobile
          LCP element (a background OSM tile no one had actually seen yet). */}
      {!showSplash && (
        <Suspense fallback={null}>
          <MapBackdrop focus={mapFocus} />
        </Suspense>
      )}
      {showSplash && <Splash reports={allReports.slice(0, 10)} onDismiss={() => setShowSplash(false)} />}

      {/* Everything above the backdrop */}
      <div className="relative z-10">
        <Header onReportClick={() => setFormOpen(true)} onHelpClick={() => setShowOnboarding(true)} />
        <Ticker reports={allReports} />

        <main className="mx-auto max-w-6xl px-3 py-5 sm:px-6 sm:py-8">
          <div className="mb-4">
            <SummaryCounts summary={summary} loading={loading} />
          </div>

          <Reveal>
            <div className="mb-4 sm:mb-6">
              <Suspense fallback={<div className="panel h-[220px] animate-pulse sm:h-[260px]" />}>
                <NearbyPanel reports={allReports} onRegionChange={setMapFocus} deferMap={showSplash} />
              </Suspense>
            </div>
          </Reveal>

          <Suspense fallback={null}>
            <BelowFold
              stats={stats}
              loading={loading}
              error={error}
              filters={filters}
              onFiltersChange={setFilters}
              filteredReports={filteredReports}
              hasFilters={hasFilters}
              onConfirmed={handleConfirmed}
              onResolved={handleResolved}
            />
          </Suspense>

          <footer className="mt-8 border-t border-black/8 pt-6 text-center text-[11px] leading-relaxed text-grey-600">
            <p>{t("footer.disclaimer")}</p>
            <p className="mt-1">{t("footer.builtWith")}</p>
            <div className="mt-3 flex items-center justify-center gap-2 font-semibold text-grey-500">
              <button
                type="button"
                onClick={() => navigate("/about")}
                className="underline-offset-2 hover:text-grey-900 hover:underline"
              >
                {t("about.link")}
              </button>
              <span aria-hidden>·</span>
              <button
                type="button"
                onClick={() => navigate("/suggestions")}
                className="underline-offset-2 hover:text-grey-900 hover:underline"
              >
                {t("suggestions.link")}
              </button>
            </div>
          </footer>
        </main>
      </div>

      {formOpen && (
        <Suspense fallback={null}>
          <ReportForm
            onClose={() => setFormOpen(false)}
            onCreated={(report) => {
              setLocalReports((prev) => [report, ...prev]);
              refresh();
            }}
          />
        </Suspense>
      )}

      {showOnboarding && (
        <Suspense fallback={null}>
          <OnboardingGuide
            onSkip={() => {
              markOnboardingComplete();
              setShowOnboarding(false);
            }}
            onFinish={markOnboardingComplete}
            onLater={() => setShowOnboarding(false)}
            onReportClick={() => {
              setShowOnboarding(false);
              setFormOpen(true);
            }}
          />
        </Suspense>
      )}
    </div>
  );
}
