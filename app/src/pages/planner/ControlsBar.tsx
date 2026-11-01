import clsx from 'clsx';
import { Download, Search, X } from 'lucide-react';
import { forwardRef, useEffect, useState } from 'react';
import { SegmentedControl } from '../../components/SegmentedControl';
import { Toggle } from '../../components/Toggle';
import { InfoTip } from '../../components/Tooltip';
import { RISK_DOT } from '../../config/risk';
import { buildUrl, type PlannerAirport, type PlannerDay } from '../../lib/api';
import { MODE_HELP } from '../../../shared/kpis';
import { PLANNER_BUDGETS, RISK_BANDS } from '../../../shared/planner';
import { AirportSelect } from '../../components/AirportSelect';
import { DatePicker } from '../../components/DatePicker';
import { apiParams, type PlannerFilters } from './usePlannerFilters';

interface Props {
  filters: PlannerFilters;
  update: (patch: Partial<PlannerFilters>) => void;
  days: PlannerDay[] | undefined;
  airports: PlannerAirport[] | undefined;
}

/** Day, budget and filters for the page. Sticky at the top of the content area. */
export const ControlsBar = forwardRef<HTMLDivElement, Props>(function ControlsBar({ filters, update, days, airports }, ref) {
  // The search box updates the URL 300 ms after typing stops
  // (the box follows the URL when it changes elsewhere, e.g. Clear filters)
  const [text, setText] = useState(filters.q);
  const [synced, setSynced] = useState(filters.q);
  if (synced !== filters.q) {
    setSynced(filters.q);
    setText(filters.q);
  }
  useEffect(() => {
    if (text === filters.q) return;
    const id = setTimeout(() => update({ q: text.trim() }), 300);
    return () => clearTimeout(id);
  }, [text, filters.q, update]);

  return (
    // -mt-5 / top-[-20px] cancel the content area padding, so the bar sits flush under the top bar while scrolling
    <div ref={ref} className="sticky top-[-20px] z-30 -mx-5 -mt-5 border-b bg-bg px-5 pb-3 pt-4">
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <SegmentedControl
          label="Mode"
          value={filters.mode}
          options={[{ value: 'add', label: 'Add buffer' }, { value: 'reallocate', label: 'Reallocate' }]}
          onChange={(mode) => update({ mode, turn: null })}
        />
        <InfoTip label="About the modes" align="left">
          <span className="mb-1 block">{MODE_HELP.add}</span>
          <span className="block">{MODE_HELP.reallocate}</span>
        </InfoTip>
        <p className="text-[13px] text-muted">
          {filters.mode === 'add'
            ? 'Recommended extra ground time for each turnaround on the selected day, from the prediction engine and the optimisation engine.'
            : "Minutes moved from long sits to risky stops within each aircraft's day. Nothing is added to the schedule."}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2.5">
        <DatePicker value={filters.date} days={days} onChange={(date) => update({ date, turn: null })} />

        {filters.mode === 'add' ? (
          <div className="flex items-center gap-1.5">
            <SegmentedControl
              label="Buffer budget, minutes per turnaround"
              value={filters.budget}
              options={PLANNER_BUDGETS.map((b) => ({ value: b, label: <span className="num">{b}</span> }))}
              onChange={(budget) => update({ budget })}
            />
            <span className="text-[13px] text-muted">min per turnaround</span>
            <InfoTip label="About the buffer budget">
              Average extra minutes per turnaround the airline is willing to add that day. Every turnaround can receive 0 to 30 minutes.
            </InfoTip>
          </div>
        ) : (
          <span className="rounded-control bg-bg px-2 py-1 text-[12px] text-muted">Planned at the main budget, 5 min per turnaround</span>
        )}

        <AirportSelect value={filters.airport} airports={airports} onChange={(airport) => update({ airport })} />

        <label className="flex h-8 min-w-[160px] max-w-[300px] flex-1 items-center gap-2 rounded-control border bg-surface px-2.5 focus-within:ring-2 focus-within:ring-teal">
          <Search size={14} className="shrink-0 text-muted" aria-hidden="true" />
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Search tail or flight number"
            aria-label="Search tail or flight number"
            className="w-full bg-transparent text-[13px] text-ink outline-none placeholder:text-muted"
          />
          {text && (
            <button type="button" aria-label="Clear search" onClick={() => setText('')} className="focus-ring rounded text-muted hover:text-ink">
              <X size={14} aria-hidden="true" />
            </button>
          )}
        </label>

        {filters.mode === 'add' && (
          <a
            href={buildUrl('/api/planner/export', apiParams(filters, false))}
            download
            className="focus-ring ml-auto inline-flex h-8 items-center gap-1.5 rounded-control border bg-surface px-3 text-[13px] font-medium text-ink hover:bg-bg"
          >
            <Download size={15} className="text-muted" aria-hidden="true" />
            Export CSV
          </a>
        )}
      </div>

      {filters.mode === 'add' && <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-2.5">
        <div role="radiogroup" aria-label="Risk band" className="flex items-center gap-1">
          {(['all', ...RISK_BANDS] as const).map((band) => {
            const active = filters.risk === band;
            return (
              <button
                key={band}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => update({ risk: band })}
                className={clsx(
                  'focus-ring inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[12px]',
                  active ? 'border-navy bg-navy font-medium text-white' : 'bg-surface text-muted hover:text-ink',
                )}
              >
                {band !== 'all' && <span className={clsx('h-1.5 w-1.5 rounded-full', RISK_DOT[band])} aria-hidden="true" />}
                {band === 'all' ? 'All risk' : band}
              </button>
            );
          })}
        </div>

        <SegmentedControl
          label="Show"
          value={filters.show}
          options={[
            { value: 'all', label: 'All turnarounds' },
            { value: 'buffered', label: 'Receiving buffer' },
            { value: 'not_buffered', label: 'Not receiving buffer' },
          ]}
          onChange={(show) => update({ show })}
        />

        <div className="flex items-center gap-1.5">
          <Toggle checked={filters.veryShort} onChange={(veryShort) => update({ veryShort })} label="Include very short turns (under 20 min)" />
          <InfoTip label="About very short turns" align="right">
            Turnarounds planned at under 20 minutes. They are often aircraft swaps or timetable quirks rather than real turns.
          </InfoTip>
        </div>
      </div>}
    </div>
  );
});
