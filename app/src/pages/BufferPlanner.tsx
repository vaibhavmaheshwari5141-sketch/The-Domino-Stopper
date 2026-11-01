import { SearchX } from 'lucide-react';
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ErrorState } from '../components/ErrorState';
import { usePlannerAirports, usePlannerDates, usePlannerReallocation, usePlannerSummary, usePlannerTurnarounds } from '../lib/queries';
import { ControlsBar } from './planner/ControlsBar';
import { DetailDrawer } from './planner/DetailDrawer';
import { ReallocationView } from './planner/ReallocationView';
import { SummaryStrip } from './planner/SummaryStrip';
import { TurnaroundTable } from './planner/TurnaroundTable';
import { apiParams, usePlannerFilters } from './planner/usePlannerFilters';

// Buffer Planner: for one day and budget, which turnarounds get extra ground time, how much, and why. In reallocate
// mode: which stops give minutes and which receive them, within each aircraft's day.
// The page scrolls; the controls bar sticks to the top, and the table scrolls inside its card with a sticky header,
// sized so that once the page is scrolled the table fills the space under the controls.
export default function BufferPlanner() {
  const [filters, update] = usePlannerFilters();
  const realloc = filters.mode === 'reallocate';
  // Reallocation is planned at the main budget only
  const dates = usePlannerDates(realloc ? 5 : filters.budget);
  const airports = usePlannerAirports(filters.date);
  const summary = usePlannerSummary(filters.date, filters.budget, filters.airport);
  const params = useMemo(() => apiParams(filters), [filters]);
  const table = usePlannerTurnarounds(params);
  const moved = usePlannerReallocation(filters.date, filters.airport, filters.q, realloc);

  const controlsRef = useRef<HTMLDivElement>(null);
  const [controlsHeight, setControlsHeight] = useState(140);
  useLayoutEffect(() => {
    const el = controlsRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setControlsHeight(el.offsetHeight));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const closeDrawer = useCallback(() => update({ turn: null }), [update]);
  const clearFilters = () => update({ airport: null, risk: 'all', show: 'all', veryShort: true, q: '' });

  return (
    <div className="flex flex-col gap-4">
      <ControlsBar ref={controlsRef} filters={filters} update={update} days={dates.data} airports={airports.data} />

      {realloc ? (
        <ReallocationView data={moved.data} isError={moved.isError} error={moved.error} retry={() => void moved.refetch()} retrying={moved.isFetching}
          fetching={moved.isFetching} onClear={() => update({ airport: null, q: '' })}
          style={{ maxHeight: `calc(100vh - 56px - ${controlsHeight}px - 36px)`, minHeight: 320 }} />
      ) : <>
      {summary.isError && !summary.data
        ? <ErrorState title="Could not load the day summary" error={summary.error} onRetry={() => void summary.refetch()} retrying={summary.isFetching} />
        : <SummaryStrip summary={summary.data} />}

      {table.isError && !table.data ? (
        <ErrorState title="Could not load the turnarounds" error={table.error} onRetry={() => void table.refetch()} retrying={table.isFetching} />
      ) : (
        <TurnaroundTable
          rows={table.data?.rows}
          total={table.data?.total ?? 0}
          page={filters.page}
          budget={filters.budget}
          sort={filters.sort}
          order={filters.order}
          selected={filters.turn}
          fetching={table.isFetching}
          onSort={(sort, order) => update({ sort, order })}
          onPage={(page) => update({ page })}
          onOpen={(turn) => update({ turn })}
          style={{ maxHeight: `calc(100vh - 56px - ${controlsHeight}px - 36px)`, minHeight: 320 }}
          empty={
            <div className="flex flex-col items-center gap-3 px-4 py-16 text-center">
              <SearchX size={28} className="text-muted" aria-hidden="true" />
              <p className="text-sm font-medium text-ink">No turnarounds match these filters</p>
              <button type="button" onClick={clearFilters}
                className="focus-ring h-8 rounded-control border bg-surface px-3 text-[13px] font-medium text-ink hover:bg-bg">
                Clear filters
              </button>
            </div>
          }
        />
      )}
      </>}

      {filters.turn && <DetailDrawer turnId={filters.turn} budget={filters.budget} onClose={closeDrawer} />}
    </div>
  );
}
