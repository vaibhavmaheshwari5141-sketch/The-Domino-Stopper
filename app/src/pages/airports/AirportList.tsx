import clsx from 'clsx';
import { Search, X } from 'lucide-react';
import { type KeyboardEvent, useEffect, useRef, useState } from 'react';
import { Toggle } from '../../components/Toggle';
import { formatCompact, formatNumber, formatPercent } from '../../lib/format';
import { useAirportList } from '../../lib/queries';
import { LIST_SORTS, type ListSort } from './useAirportState';

interface Props {
  selected: string;
  q: string;
  sort: ListSort;
  top10: boolean;
  onSelect: (code: string) => void;
  onFilters: (patch: { q?: string; sort?: ListSort; top10?: boolean }) => void;
}

const BAR_MAX = 0.5;     // late-rate bars are drawn on a 0–50% scale

/** Searchable, sortable airport list. Up and down arrows move the selection. */
export function AirportList({ selected, q, sort, top10, onSelect, onFilters }: Props) {
  const { data, isPending } = useAirportList(q, sort, top10);
  const listRef = useRef<HTMLUListElement>(null);

  // The search box updates the URL 250 ms after typing stops, and follows the URL when it changes elsewhere
  const [text, setText] = useState(q);
  const [synced, setSynced] = useState(q);
  if (synced !== q) {
    setSynced(q);
    setText(q);
  }
  useEffect(() => {
    if (text.trim() === q) return;
    const id = setTimeout(() => onFilters({ q: text.trim() }), 250);
    return () => clearTimeout(id);
  }, [text, q, onFilters]);

  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [selected, data]);

  const airports = data?.airports ?? [];
  const onKeyDown = (e: KeyboardEvent) => {
    if (!airports.length || (e.key !== 'ArrowDown' && e.key !== 'ArrowUp')) return;
    e.preventDefault();
    const i = airports.findIndex((a) => a.airport === selected);
    const next = e.key === 'ArrowDown' ? Math.min(airports.length - 1, i + 1) : Math.max(0, i - 1);
    onSelect(airports[next].airport);
  };

  return (
    <section className="flex min-h-0 flex-col rounded-card border bg-surface">
      <div className="space-y-2 border-b p-3">
        <label className="flex h-8 items-center gap-2 rounded-control border bg-surface px-2.5 focus-within:ring-2 focus-within:ring-teal">
          <Search size={14} className="shrink-0 text-muted" aria-hidden="true" />
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Search airport or city" aria-label="Search airport or city"
            className="w-full bg-transparent text-[13px] text-ink outline-none placeholder:text-muted" />
          {text && (
            <button type="button" aria-label="Clear search" onClick={() => setText('')} className="focus-ring rounded text-muted hover:text-ink">
              <X size={14} aria-hidden="true" />
            </button>
          )}
        </label>
        <div className="flex items-center justify-between gap-2">
          <label className="flex items-center gap-1.5 text-[12px] text-muted">
            Sort
            <select value={sort} onChange={(e) => onFilters({ sort: e.target.value as ListSort })}
              className="focus-ring h-7 rounded-control border bg-surface px-1.5 text-[12px] text-ink">
              {LIST_SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </label>
          <span className="num text-[11px] text-muted">{data ? `${formatNumber(data.total)} airports` : ''}</span>
        </div>
        <Toggle checked={top10} onChange={(v) => onFilters({ top10: v })} label="Ten busiest only" />
      </div>

      {isPending ? (
        <div className="space-y-2 p-3">{Array.from({ length: 10 }, (_, i) => <span key={i} className="skeleton block h-10" />)}</div>
      ) : airports.length === 0 ? (
        <p className="px-3 py-10 text-center text-[13px] text-muted">No airports match “{q}”.</p>
      ) : (
        <ul ref={listRef} role="listbox" aria-label="Airports" aria-activedescendant={`airport-${selected}`} tabIndex={0} onKeyDown={onKeyDown}
          className="focus-ring min-h-0 flex-1 overflow-y-auto p-1.5">
          {airports.map((a) => {
            const isSelected = a.airport === selected;
            const rate = a.dep_late15_rate ?? 0;
            return (
              <li key={a.airport} id={`airport-${a.airport}`} role="option" aria-selected={isSelected} onClick={() => onSelect(a.airport)}
                className={clsx('cursor-pointer rounded-control px-2.5 py-1.5', isSelected ? 'bg-amber-soft' : 'hover:bg-bg')}>
                <div className="flex items-baseline gap-2">
                  <span className="num w-9 shrink-0 text-[13px] font-bold text-ink">{a.airport}</span>
                  <span className="min-w-0 flex-1 truncate text-[12px] text-muted">{a.city}</span>
                  <span className="num shrink-0 text-[11px] text-muted" title={`${formatNumber(a.departures)} departures`}>{formatCompact(a.departures)}</span>
                </div>
                <div className="mt-1 flex items-center gap-2" title={`Departure late rate ${formatPercent(a.dep_late15_rate)}`}>
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-bg" aria-hidden="true">
                    <span className={clsx('block h-full rounded-full', rate >= 0.3 ? 'bg-critical' : rate >= 0.2 ? 'bg-amber' : 'bg-teal')}
                      style={{ width: `${Math.min(100, (rate / BAR_MAX) * 100)}%` }} />
                  </span>
                  <span className="num w-10 shrink-0 text-right text-[11px] text-muted">{formatPercent(a.dep_late15_rate, 0)}</span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
