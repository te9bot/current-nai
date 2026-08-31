import StatsPanel from "./StatsPanel";
import LedgerTable from "./LedgerTable";
import OutagePatterns from "./OutagePatterns";
import Filters from "./Filters";
import Board from "./Board";
import Faq from "./Faq";
import Reveal from "./Reveal";
import type { FilterState, Report, Stats } from "../types";

interface Props {
  stats: Stats;
  loading: boolean;
  error: boolean;
  filters: FilterState;
  onFiltersChange: (value: FilterState) => void;
  filteredReports: Report[];
  hasFilters: boolean;
  onConfirmed: (updated: Report) => void;
  onResolved: (updated: Report) => void;
}

/**
 * Everything below NearbyPanel, grouped into one lazy chunk. None of this is
 * visible without scrolling, so there's no reason for its JS to be part of
 * the bundle the browser must download/parse before first paint — it loads
 * in the background while the visitor is still reading the hero/splash.
 */
export default function BelowFold({
  stats,
  loading,
  error,
  filters,
  onFiltersChange,
  filteredReports,
  hasFilters,
  onConfirmed,
  onResolved,
}: Props) {
  return (
    <>
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
        <Filters value={filters} onChange={onFiltersChange} />
      </div>

      <Board
        reports={filteredReports}
        loading={loading}
        error={error}
        hasFilters={hasFilters}
        onConfirmed={onConfirmed}
        onResolved={onResolved}
      />

      <Reveal>
        <div className="mb-4 mt-4 sm:mt-6">
          <Faq />
        </div>
      </Reveal>
    </>
  );
}
