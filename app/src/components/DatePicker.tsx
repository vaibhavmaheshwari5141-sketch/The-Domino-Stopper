import clsx from 'clsx';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import type { PlannerDay } from '../lib/api';
import { formatDayLong, formatMonth } from '../lib/format';
import { useDismiss } from '../lib/useDismiss';

interface Props {
  value: string;
  days: PlannerDay[] | undefined;
  onChange: (date: string) => void;
}

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const iso = (y: number, m: number, d: number) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

/** Day picker limited to the days that have a plan; disruption days carry an amber dot. Arrows step one day. */
export function DatePicker({ value, days, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => value.slice(0, 7));
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(ref, open, () => setOpen(false));

  const { available, disruption, sorted } = useMemo(() => {
    const list = (days ?? []).map((d) => d.flight_date).sort();
    return {
      sorted: list,
      available: new Set(list),
      disruption: new Set((days ?? []).filter((d) => d.is_disruption_day).map((d) => d.flight_date)),
    };
  }, [days]);

  const index = sorted.indexOf(value);
  const step = (dir: -1 | 1) => {
    const next = sorted[index + dir];
    if (next) onChange(next);
  };

  const [y, m] = month.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const lead = (first.getUTCDay() + 6) % 7;                  // Monday-first grid
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const minMonth = sorted[0]?.slice(0, 7);
  const maxMonth = sorted.at(-1)?.slice(0, 7);
  const shiftMonth = (dir: -1 | 1) => {
    const d = new Date(Date.UTC(y, m - 1 + dir, 1));
    setMonth(d.toISOString().slice(0, 7));
  };

  return (
    <div ref={ref} className="relative flex items-center gap-1">
      <button type="button" aria-label="Previous day" onClick={() => step(-1)} disabled={index <= 0}
        className="focus-ring flex h-8 w-8 items-center justify-center rounded-control border bg-surface text-muted hover:text-ink disabled:opacity-40">
        <ChevronLeft size={16} aria-hidden="true" />
      </button>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          setMonth(value.slice(0, 7));
          setOpen((o) => !o);
        }}
        className="focus-ring flex h-8 items-center gap-2 rounded-control border bg-surface px-2.5 text-[13px] font-medium text-ink hover:bg-bg"
      >
        <CalendarDays size={15} className="text-muted" aria-hidden="true" />
        <span className="num">{formatDayLong(value)}</span>
        {disruption.has(value) && <span className="h-1.5 w-1.5 rounded-full bg-amber" title="Disruption day" />}
      </button>
      <button type="button" aria-label="Next day" onClick={() => step(1)} disabled={index < 0 || index >= sorted.length - 1}
        className="focus-ring flex h-8 w-8 items-center justify-center rounded-control border bg-surface text-muted hover:text-ink disabled:opacity-40">
        <ChevronRight size={16} aria-hidden="true" />
      </button>

      {open && (
        <div role="dialog" aria-label="Choose a day" className="absolute left-9 top-full z-40 mt-1 w-[272px] rounded-card border bg-surface p-3 shadow-lg">
          <div className="mb-2 flex items-center justify-between">
            <button type="button" aria-label="Previous month" disabled={!minMonth || month <= minMonth} onClick={() => shiftMonth(-1)}
              className="focus-ring rounded-control p-1 text-muted hover:text-ink disabled:opacity-30">
              <ChevronLeft size={16} aria-hidden="true" />
            </button>
            <span className="text-sm font-semibold text-ink">{formatMonth(month)}</span>
            <button type="button" aria-label="Next month" disabled={!maxMonth || month >= maxMonth} onClick={() => shiftMonth(1)}
              className="focus-ring rounded-control p-1 text-muted hover:text-ink disabled:opacity-30">
              <ChevronRight size={16} aria-hidden="true" />
            </button>
          </div>
          <div className="grid grid-cols-7 gap-0.5 text-center">
            {WEEKDAYS.map((w) => <span key={w} className="label pb-1 text-[10px]">{w}</span>)}
            {Array.from({ length: lead }, (_, i) => <span key={`lead${i}`} />)}
            {Array.from({ length: daysInMonth }, (_, i) => {
              const d = iso(y, m - 1, i + 1);
              const enabled = available.has(d);
              const selected = d === value;
              return (
                <button
                  key={d}
                  type="button"
                  disabled={!enabled}
                  aria-pressed={selected}
                  aria-label={`${formatDayLong(d)}${disruption.has(d) ? ', disruption day' : ''}`}
                  onClick={() => {
                    onChange(d);
                    setOpen(false);
                  }}
                  className={clsx(
                    'focus-ring num relative flex h-8 flex-col items-center justify-center rounded-control text-[12px]',
                    selected ? 'bg-navy font-semibold text-white' : enabled ? 'text-ink hover:bg-bg' : 'text-line',
                  )}
                >
                  {i + 1}
                  {disruption.has(d) && <span className={clsx('absolute bottom-1 h-1 w-1 rounded-full', selected ? 'bg-amber-soft' : 'bg-amber')} />}
                </button>
              );
            })}
          </div>
          <p className="mt-2 flex items-center gap-1.5 text-[11px] text-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-amber" aria-hidden="true" /> Disruption day (over 10% of flights cancelled)
          </p>
        </div>
      )}
    </div>
  );
}
