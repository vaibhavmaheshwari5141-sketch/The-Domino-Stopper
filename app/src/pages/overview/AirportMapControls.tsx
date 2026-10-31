import { RotateCcw } from 'lucide-react';
import type { ReactNode } from 'react';
import { SegmentedControl } from '../../components/SegmentedControl';
import { formatMonth } from '../../lib/format';
import { GROUPS, MIN_DEPARTURES, type MapFilters, SIZE_BY, type SizeBy } from './airportMapFilters';

interface Props {
  filters: MapFilters;
  months: string[];
  budgets: number[];
  onChange: (patch: Partial<MapFilters>) => void;
  onReset: () => void;
  changed: boolean;
}

const lastOf = (months: string[], year: string) => months.filter((m) => m.startsWith(year)).pop();

const SELECT = 'focus-ring h-8 rounded-control border bg-surface px-2 text-[13px] text-ink hover:bg-bg';

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="label !text-[10px]">{label}</span>
      <div className="flex items-center gap-1.5">{children}</div>
    </div>
  );
}

/** Filters for the focused airport map. */
export function AirportMapControls({ filters, months, budgets, onChange, onReset, changed }: Props) {
  const first = filters.from ?? months[0] ?? '';
  const last = filters.to ?? months[months.length - 1] ?? '';
  const years = [...new Set(months.map((m) => m.slice(0, 4)))];
  // A preset is "on" when the chosen range is exactly that year (or every month)
  const preset = !filters.from && !filters.to ? 'all'
    : years.find((y) => first === months.find((m) => m.startsWith(y)) && last === lastOf(months, y)) ?? 'custom';
  const choosePreset = (p: string) => {
    if (p === 'all') return onChange({ from: null, to: null });
    onChange({ from: months.find((m) => m.startsWith(p)) ?? null, to: lastOf(months, p) ?? null });
  };
  // Choosing the first or last month available means "open-ended", which keeps the cache key short
  const setFrom = (m: string) => onChange({ from: m === months[0] ? null : m });
  const setTo = (m: string) => onChange({ to: m === months[months.length - 1] ? null : m });

  return (
    <div className="flex flex-wrap items-end gap-x-5 gap-y-3 rounded-card border bg-bg px-3 py-2.5">
      <Field label="Period">
        <SegmentedControl
          label="Period preset"
          value={preset}
          onChange={choosePreset}
          options={[{ value: 'all', label: 'All' }, ...years.map((y) => ({ value: y, label: y }))]}
        />
        <select aria-label="First month" className={SELECT} value={first} onChange={(e) => setFrom(e.target.value)}>
          {months.filter((m) => m <= last).map((m) => <option key={m} value={m}>{formatMonth(m)}</option>)}
        </select>
        <span className="text-muted">–</span>
        <select aria-label="Last month" className={SELECT} value={last} onChange={(e) => setTo(e.target.value)}>
          {months.filter((m) => m >= first).map((m) => <option key={m} value={m}>{formatMonth(m)}</option>)}
        </select>
      </Field>

      <Field label="Engine buffer per turnaround">
        <SegmentedControl
          label="Engine buffer per turnaround"
          value={filters.budget}
          onChange={(budget) => onChange({ budget })}
          options={budgets.map((b) => ({ value: b, label: `${b} min` }))}
        />
      </Field>

      <Field label="Airports">
        <SegmentedControl label="Airports" value={filters.group} onChange={(group) => onChange({ group })} options={GROUPS} />
      </Field>

      <Field label="Departures in period">
        <SegmentedControl
          label="Minimum departures in period"
          value={filters.minDepartures}
          onChange={(minDepartures) => onChange({ minDepartures })}
          options={MIN_DEPARTURES}
        />
      </Field>

      <Field label="Bubble size">
        <select aria-label="Bubble size" className={SELECT} value={filters.sizeBy} onChange={(e) => onChange({ sizeBy: e.target.value as SizeBy })}>
          {SIZE_BY.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </Field>

      {changed && (
        <button type="button" onClick={onReset} className="focus-ring ml-auto inline-flex h-8 items-center gap-1.5 rounded-control px-2 text-[13px] text-muted hover:bg-surface hover:text-ink">
          <RotateCcw size={14} aria-hidden="true" />
          Reset
        </button>
      )}
    </div>
  );
}
