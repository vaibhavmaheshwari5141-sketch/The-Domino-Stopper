import { ArrowLeft, Search, X } from 'lucide-react';
import { forwardRef, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AirportSelect } from '../../components/AirportSelect';
import { DatePicker } from '../../components/DatePicker';
import { SegmentedControl } from '../../components/SegmentedControl';
import { InfoTip } from '../../components/Tooltip';
import type { PlannerAirport, PlannerDay } from '../../lib/api';
import { PLANNER_BUDGETS } from '../../../shared/planner';
import { type AircraftFilters, plannerHref } from './useAircraftFilters';

interface Props {
  filters: AircraftFilters;
  update: (patch: Partial<AircraftFilters>) => void;
  days: PlannerDay[] | undefined;
  airports: PlannerAirport[] | undefined;
}

export const AircraftControls = forwardRef<HTMLDivElement, Props>(function AircraftControls({ filters, update, days, airports }, ref) {
  // Aircraft search updates the URL 300 ms after typing stops, and follows the URL when it changes elsewhere
  const [text, setText] = useState(filters.q);
  const [synced, setSynced] = useState(filters.q);
  if (synced !== filters.q) {
    setSynced(filters.q);
    setText(filters.q);
  }
  useEffect(() => {
    if (text.trim() === filters.q) return;
    const id = setTimeout(() => update({ q: text.trim().toUpperCase(), tail: null, turn: null }), 300);
    return () => clearTimeout(id);
  }, [text, filters.q, update]);

  return (
    // -mt-5 / top-[-20px] cancel the content area padding, so the bar sits flush under the top bar while scrolling
    <div ref={ref} className="sticky top-[-20px] z-30 -mx-5 -mt-5 border-b bg-bg px-5 pb-3 pt-4">
      <p className="mb-3 text-[13px] text-muted">
        One aircraft&apos;s day as a chain of flights. See where delay risk sits and where the engine adds buffer.
      </p>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2.5">
        {/* A new day or airport starts again from the top of the aircraft list */}
        <DatePicker value={filters.date} days={days} onChange={(date) => update({ date, tail: null, turn: null })} />

        <div className="flex items-center gap-1.5">
          <SegmentedControl
            label="Buffer budget, minutes per turnaround"
            value={filters.budget}
            options={PLANNER_BUDGETS.map((b) => ({ value: b, label: <span className="num">{b}</span> }))}
            onChange={(budget) => update({ budget, turn: null })}
          />
          <span className="text-[13px] text-muted">min per turnaround</span>
          <InfoTip label="About the buffer budget">
            Average extra minutes per turnaround the airline is willing to add that day. Every turnaround can receive 0 to 30 minutes.
          </InfoTip>
        </div>

        <AirportSelect value={filters.airport} airports={airports} onChange={(airport) => update({ airport, tail: null, turn: null })} />

        <label className="flex h-8 min-w-[160px] max-w-[240px] flex-1 items-center gap-2 rounded-control border bg-surface px-2.5 focus-within:ring-2 focus-within:ring-teal">
          <Search size={14} className="shrink-0 text-muted" aria-hidden="true" />
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Search aircraft (tail)"
            aria-label="Search aircraft by tail number"
            className="w-full bg-transparent text-[13px] text-ink outline-none placeholder:text-muted"
          />
          {text && (
            <button type="button" aria-label="Clear aircraft search" onClick={() => setText('')} className="focus-ring rounded text-muted hover:text-ink">
              <X size={14} aria-hidden="true" />
            </button>
          )}
        </label>

        {filters.from !== null && (
          <Link
            to={plannerHref(filters)}
            className="focus-ring ml-auto inline-flex h-8 items-center gap-1.5 rounded-control border bg-surface px-3 text-[13px] font-medium text-ink hover:bg-bg"
          >
            <ArrowLeft size={15} className="text-muted" aria-hidden="true" />
            Back to Buffer Planner
          </Link>
        )}
      </div>
    </div>
  );
});
