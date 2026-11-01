import { AlertTriangle, Info, Plane } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Card } from '../components/Card';
import { ErrorState } from '../components/ErrorState';
import { SegmentedControl } from '../components/SegmentedControl';
import { InfoTip } from '../components/Tooltip';
import { MODE_HELP } from '../../shared/kpis';
import { ApiError } from '../lib/api';
import { formatDayLong, formatNumber } from '../lib/format';
import { useAircraftDay, useAircraftList, usePlannerAirports, usePlannerDates } from '../lib/queries';
import { AircraftControls } from './aircraft/AircraftControls';
import { AircraftList } from './aircraft/AircraftList';
import { DelayChart } from './aircraft/DelayChart';
import { ChainLegend, DominoChain } from './aircraft/DominoChain';
import { PlanCard } from './aircraft/PlanCard';
import { useAircraftFilters } from './aircraft/useAircraftFilters';
import { DetailDrawer } from './planner/DetailDrawer';

// Aircraft Day: one aircraft's day as a chain of flights and stops, with where the engine adds buffer and what
// really happened. Arrives from the Buffer Planner with tail, date and budget in the URL, or picks an aircraft here.
export default function AircraftDay() {
  const [filters, update] = useAircraftFilters();
  const dates = usePlannerDates(filters.budget);
  const airports = usePlannerAirports(filters.date);
  // An aircraft opened from a link may sit outside the top of the list; ask for it to be included (only that one,
  // so moving through the list does not refetch it)
  const [linkedTail] = useState(filters.tail);
  const list = useAircraftList(filters.date, filters.budget, filters.airport, filters.q, linkedTail);
  const day = useAircraftDay(filters.tail, filters.date, filters.budget);

  // No aircraft chosen yet: take the first one in the list (written to the URL, so the view can be bookmarked)
  const first = list.data?.aircraft[0]?.tail_number;
  useEffect(() => {
    if (!filters.tail && first && !list.isPlaceholderData) update({ tail: first });
  }, [filters.tail, first, list.isPlaceholderData, update]);

  const controlsRef = useRef<HTMLDivElement>(null);
  const [controlsHeight, setControlsHeight] = useState(110);
  useLayoutEffect(() => {
    const el = controlsRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setControlsHeight(el.offsetHeight));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const closeDrawer = useCallback(() => update({ turn: null }), [update]);
  const notFound = day.error instanceof ApiError && day.error.status === 404;

  return (
    <div className="flex flex-col gap-4">
      <AircraftControls ref={controlsRef} filters={filters} update={update} days={dates.data} airports={airports.data} />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-[280px_minmax(0,1fr)]">
        {list.isError && !list.data ? (
          <ErrorState title="Could not load the aircraft" error={list.error} onRetry={() => void list.refetch()} retrying={list.isFetching} />
        ) : (
          <AircraftList
            aircraft={list.data?.aircraft}
            total={list.data?.total ?? 0}
            selected={filters.tail}
            onSelect={(tail) => update({ tail, turn: null })}
            style={{ maxHeight: `calc(100vh - 56px - ${controlsHeight}px - 36px)`, minHeight: 280 }}
          />
        )}

        <div className="flex min-w-0 flex-col gap-4">
          <Card
            aside={
              <div className="flex items-center gap-1.5">
                <span className="text-[12px] text-muted">Show:</span>
                <SegmentedControl label="Plan shown" value={filters.plan} onChange={(plan) => update({ plan })}
                  options={[{ value: 'add', label: 'Add buffer plan' }, { value: 'realloc', label: 'Reallocation plan' }]} />
                <InfoTip label="About the plans" align="right">
                  <span className="mb-1 block">{MODE_HELP.add}</span>
                  <span className="block">{MODE_HELP.reallocate} Planned at the main budget (5 min per turnaround).</span>
                </InfoTip>
              </div>
            }
            title={
              day.data ? (
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <Plane size={15} className="text-amber" aria-hidden="true" />
                  <span className="num">{day.data.tail_number}</span>
                  <span className="font-normal text-muted">
                    · {formatDayLong(day.data.date)} · {formatNumber(day.data.turnarounds.length)} stops · {formatNumber(day.data.flights.length)} flights
                    {filters.plan === 'add' && day.data.totals.buffer_min > 0 && <> · <span className="font-semibold text-amber">+{formatNumber(day.data.totals.buffer_min)} min buffer</span></>}
                    {filters.plan === 'realloc' && day.data.reallocation.minutes_moved > 0 && <> · <span className="font-semibold text-teal">{formatNumber(day.data.reallocation.minutes_moved)} min moved, 0 added</span></>}
                  </span>
                  {day.data.is_disruption_day && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-soft px-2 py-px text-[11px] font-semibold text-amber">
                      <AlertTriangle size={12} aria-hidden="true" /> Disruption day
                    </span>
                  )}
                </span>
              ) : 'Aircraft day'
            }
          >
            <div className="px-4 pb-4">
              {!filters.tail ? (
                <p className="py-12 text-center text-[13px] text-muted">{list.data?.aircraft.length === 0 ? 'No aircraft match these filters.' : 'Select an aircraft on the left.'}</p>
              ) : notFound ? (
                <p className="flex items-start gap-2 rounded-control bg-bg p-4 text-[13px] text-ink">
                  <Info size={16} className="mt-0.5 shrink-0 text-teal" aria-hidden="true" />
                  {(day.error as ApiError).message}
                </p>
              ) : day.isError ? (
                <ErrorState title="Could not load this aircraft" error={day.error} onRetry={() => void day.refetch()} retrying={day.isFetching} />
              ) : !day.data ? (
                <div className="flex gap-3 overflow-hidden">{Array.from({ length: 6 }, (_, i) => <span key={i} className="skeleton block h-36 w-40 shrink-0" />)}</div>
              ) : (
                <>
                  <DominoChain day={day.data} plan={filters.plan} selectedTurn={filters.turn} onOpenTurn={(turn) => update({ turn })} />
                  <div className="mt-3 space-y-1.5 border-t pt-3">
                    <ChainLegend plan={filters.plan} />
                    <p className="text-[11px] text-muted">
                      Figures with real 2026 delays replay what really happened through the aircraft's day. They are estimates, not measured savings.
                      Hover a stop for its chain multiplier.
                    </p>
                  </div>
                </>
              )}
            </div>
          </Card>

          {day.data && !notFound && (
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              <DelayChart day={day.data} />
              <PlanCard day={day.data} plan={filters.plan} />
            </div>
          )}
        </div>
      </div>

      {filters.turn && <DetailDrawer turnId={filters.turn} budget={filters.budget} onClose={closeDrawer} showAircraftLink={false} />}
    </div>
  );
}
