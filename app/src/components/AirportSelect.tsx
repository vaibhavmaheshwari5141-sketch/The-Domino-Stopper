import clsx from 'clsx';
import { Check, ChevronDown, Search } from 'lucide-react';
import { useRef, useState } from 'react';
import type { PlannerAirport } from '../lib/api';
import { formatNumber } from '../lib/format';
import { useDismiss } from '../lib/useDismiss';

interface Props {
  value: string | null;
  airports: PlannerAirport[] | undefined;
  onChange: (airport: string | null) => void;
}

/** Searchable airport filter with each airport's turnaround count for the day. */
export function AirportSelect({ value, airports, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(ref, open, () => setOpen(false));

  const list = airports ?? [];
  const total = list.reduce((s, a) => s + a.turnarounds, 0);
  const matches = list.filter((a) => a.airport.includes(text.trim().toUpperCase()));
  const current = list.find((a) => a.airport === value);
  const choose = (airport: string | null) => {
    onChange(airport);
    setOpen(false);
    setText('');
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Airport"
        onClick={() => setOpen((o) => !o)}
        className="focus-ring flex h-8 min-w-[130px] items-center justify-between gap-2 rounded-control border bg-surface px-2.5 text-[13px] text-ink hover:bg-bg"
      >
        <span className="truncate">
          {value ? <><span className="font-semibold">{value}</span><span className="num ml-1.5 text-muted">{formatNumber(current?.turnarounds)}</span></> : 'All airports'}
        </span>
        <ChevronDown size={15} className="text-muted" aria-hidden="true" />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-40 mt-1 w-[220px] rounded-card border bg-surface shadow-lg">
          <label className="flex items-center gap-2 border-b px-2.5 py-2">
            <Search size={14} className="text-muted" aria-hidden="true" />
            <input
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && matches[0]) choose(matches[0].airport);
              }}
              placeholder="Search airport code"
              aria-label="Search airport code"
              className="w-full bg-transparent text-[13px] text-ink outline-none placeholder:text-muted"
            />
          </label>
          <ul role="listbox" aria-label="Airports" className="max-h-64 overflow-y-auto py-1">
            {[{ airport: null as string | null, turnarounds: total }, ...matches].map((a) => {
              const selected = a.airport === value;
              return (
                <li key={a.airport ?? 'all'} role="option" aria-selected={selected}>
                  <button
                    type="button"
                    onClick={() => choose(a.airport)}
                    className={clsx('focus-ring flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] hover:bg-bg', selected && 'font-semibold')}
                  >
                    <Check size={14} className={selected ? 'text-teal' : 'invisible'} aria-hidden="true" />
                    <span className="flex-1">{a.airport ?? 'All airports'}</span>
                    <span className="num text-[12px] text-muted">{formatNumber(a.turnarounds)}</span>
                  </button>
                </li>
              );
            })}
            {matches.length === 0 && <li className="px-3 py-2 text-[13px] text-muted">No airport matches “{text}”.</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
