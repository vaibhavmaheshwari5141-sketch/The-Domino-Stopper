import clsx from 'clsx';
import { Plane } from 'lucide-react';
import { type CSSProperties, type KeyboardEvent, useEffect, useRef } from 'react';
import { RISK_DOT } from '../../config/risk';
import type { AircraftSummary } from '../../lib/api';
import { formatNumber } from '../../lib/format';

interface Props {
  aircraft: AircraftSummary[] | undefined;
  total: number;
  selected: string | null;
  onSelect: (tail: string) => void;
  style?: CSSProperties;
}

/** Aircraft flying on the day. Up and down arrows move the selection. */
export function AircraftList({ aircraft, total, selected, onSelect, style }: Props) {
  const listRef = useRef<HTMLUListElement>(null);
  const index = aircraft?.findIndex((a) => a.tail_number === selected) ?? -1;

  // Keep the selected aircraft in view (also once the list has loaded)
  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [selected, aircraft]);

  const onKeyDown = (e: KeyboardEvent) => {
    if (!aircraft?.length || (e.key !== 'ArrowDown' && e.key !== 'ArrowUp')) return;
    e.preventDefault();
    const next = e.key === 'ArrowDown' ? Math.min(aircraft.length - 1, index + 1) : Math.max(0, index - 1);
    onSelect(aircraft[next].tail_number);
  };

  return (
    <section className="flex min-h-0 flex-col rounded-card border bg-surface" style={style}>
      <header className="flex items-baseline justify-between border-b px-3 py-2.5">
        <h2 className="text-sm font-semibold text-ink">Aircraft</h2>
        {aircraft && <span className="num text-[12px] text-muted">{formatNumber(total)} flying</span>}
      </header>

      {!aircraft ? (
        <div className="space-y-2 p-3">{Array.from({ length: 8 }, (_, i) => <span key={i} className="skeleton block h-12" />)}</div>
      ) : aircraft.length === 0 ? (
        <p className="px-3 py-10 text-center text-[13px] text-muted">No aircraft match these filters.</p>
      ) : (
        <ul
          ref={listRef}
          role="listbox"
          aria-label="Aircraft flying on this day"
          aria-activedescendant={selected ? `aircraft-${selected}` : undefined}
          tabIndex={0}
          onKeyDown={onKeyDown}
          className="focus-ring min-h-0 flex-1 overflow-y-auto p-1.5"
        >
          {aircraft.map((a) => {
            const isSelected = a.tail_number === selected;
            return (
              <li
                key={a.tail_number}
                id={`aircraft-${a.tail_number}`}
                role="option"
                aria-selected={isSelected}
                onClick={() => onSelect(a.tail_number)}
                className={clsx(
                  'cursor-pointer rounded-control px-2.5 py-2',
                  isSelected ? 'bg-amber-soft' : 'hover:bg-bg',
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="num inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink">
                    <Plane size={13} className={isSelected ? 'text-amber' : 'text-muted'} aria-hidden="true" />
                    {a.tail_number}
                  </span>
                  {a.buffer_min > 0 && <span className="num text-[12px] font-semibold text-amber">+{formatNumber(a.buffer_min)} min buffer</span>}
                </div>
                <div className="mt-1 flex items-center gap-2 text-[11px] text-muted">
                  <span className="num">{a.flights} flights</span>
                  <span className="flex items-center gap-0.5" aria-label={`Risk by turnaround: ${a.risk_bands.join(', ')}`}>
                    {a.risk_bands.map((b, i) => <span key={i} className={clsx('h-2 w-2 rounded-full', RISK_DOT[b] ?? 'bg-line')} />)}
                  </span>
                  <span className="ml-auto truncate">{a.first_airport} → {a.last_airport}</span>
                </div>
              </li>
            );
          })}
          {total > aircraft.length && (
            <li className="px-2.5 py-2 text-[11px] text-muted">
              Showing {formatNumber(aircraft.length)} of {formatNumber(total)}, most buffer first. Search for a tail or pick an airport to find others.
            </li>
          )}
        </ul>
      )}
    </section>
  );
}
