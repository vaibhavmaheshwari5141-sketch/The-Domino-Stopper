import clsx from 'clsx';
import { ChevronDown, ChevronRight, Database, Search, Table2, X } from 'lucide-react';
import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
import { ErrorState } from '../../components/ErrorState';
import type { DatasetGroupId, DatasetItem, DatasetsResponse } from '../../lib/api';
import { formatNumber } from '../../lib/format';

interface Props {
  data: DatasetsResponse | undefined;
  isPending: boolean;
  error: unknown;
  onRetry: () => void;
  retrying: boolean;
  selected: string | null;
  onSelect: (name: string) => void;
}

const ICONS = { input: Database, gold: Table2 } as const;

function matches(item: DatasetItem, q: string): boolean {
  return [item.name, item.display_name, item.description].some((s) => s.toLowerCase().includes(q));
}

/** Searchable dataset list in two collapsible groups. Up and down arrows move the selection. */
export function DatasetList({ data, isPending, error, onRetry, retrying, selected, onSelect }: Props) {
  const [text, setText] = useState('');
  const [collapsed, setCollapsed] = useState<Record<DatasetGroupId, boolean>>({ input: false, gold: false });
  const listRef = useRef<HTMLDivElement>(null);

  const q = text.trim().toLowerCase();
  const groups = useMemo(
    () => (data?.groups ?? []).map((g) => ({ ...g, shown: q ? g.items.filter((i) => matches(i, q)) : g.items })),
    [data, q],
  );
  // What the arrow keys move through: the items on screen, in order
  const visible = groups.flatMap((g) => (collapsed[g.id] ? [] : g.shown));

  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [selected, data]);

  const onKeyDown = (e: KeyboardEvent) => {
    if (!visible.length || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    const i = visible.findIndex((d) => d.name === selected);
    const next = e.key === 'Home' ? 0
      : e.key === 'End' ? visible.length - 1
      : e.key === 'ArrowDown' ? Math.min(visible.length - 1, i + 1)
      : Math.max(0, i < 0 ? 0 : i - 1);
    onSelect(visible[next].name);
  };

  return (
    <section className="flex min-h-0 flex-col rounded-card border bg-surface">
      <div className="border-b p-3">
        <label className="flex h-8 items-center gap-2 rounded-control border bg-surface px-2.5 focus-within:ring-2 focus-within:ring-teal">
          <Search size={14} className="shrink-0 text-muted" aria-hidden="true" />
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Search datasets" aria-label="Search datasets"
            className="w-full bg-transparent text-[13px] text-ink outline-none placeholder:text-muted" />
          {text && (
            <button type="button" aria-label="Clear search" onClick={() => setText('')} className="focus-ring rounded text-muted hover:text-ink">
              <X size={14} aria-hidden="true" />
            </button>
          )}
        </label>
      </div>

      {error ? (
        <div className="p-3"><ErrorState title="Could not load the datasets" error={error} onRetry={onRetry} retrying={retrying} /></div>
      ) : isPending ? (
        <div className="space-y-2 p-3" aria-busy="true">
          <span className="skeleton block h-4 w-40" />
          {Array.from({ length: 6 }, (_, i) => <span key={i} className="skeleton block h-7" />)}
          <span className="skeleton mt-4 block h-4 w-40" />
          {Array.from({ length: 8 }, (_, i) => <span key={i} className="skeleton block h-7" />)}
        </div>
      ) : (
        <div ref={listRef} role="listbox" aria-label="Datasets" tabIndex={0} onKeyDown={onKeyDown}
          aria-activedescendant={selected ? `dataset-${selected}` : undefined}
          className="focus-ring min-h-0 flex-1 overflow-y-auto p-1.5">
          {groups.map((g) => {
            const Icon = ICONS[g.id];
            const open = !collapsed[g.id];
            return (
              <div key={g.id} role="group" aria-labelledby={`group-${g.id}`} className="mb-1">
                <button type="button" id={`group-${g.id}`} aria-expanded={open} tabIndex={-1}
                  onClick={() => setCollapsed((c) => ({ ...c, [g.id]: !c[g.id] }))}
                  className="flex w-full items-center gap-1.5 rounded-control px-1.5 py-1.5 text-left hover:bg-bg">
                  {open ? <ChevronDown size={14} className="text-muted" aria-hidden="true" /> : <ChevronRight size={14} className="text-muted" aria-hidden="true" />}
                  <span className="label flex-1">{g.title}</span>
                  <span className="num text-[11px] text-muted">{q ? `${g.shown.length} of ${g.items.length}` : g.items.length}</span>
                </button>
                {open && (
                  g.id === 'input' && g.items.length === 0 ? (
                    <p className="mx-1.5 mb-2 rounded-control bg-bg px-2.5 py-2 text-[12px] leading-relaxed text-muted">
                      No input sample tables found. Run <code className="font-mono text-ink">databricks/03_input_tables_sample.py</code> in
                      Databricks (or put the sample CSV files in the local input folder) and refresh.
                    </p>
                  ) : g.shown.length === 0 ? (
                    <p className="px-2.5 pb-2 text-[12px] text-muted">No match for “{text.trim()}”.</p>
                  ) : (
                    g.shown.map((d) => {
                      const isSelected = d.name === selected;
                      return (
                        <div key={d.name} id={`dataset-${d.name}`} role="option" aria-selected={isSelected} title={d.name}
                          onClick={() => onSelect(d.name)}
                          className={clsx('flex cursor-pointer items-center gap-2 rounded-control py-1.5 pl-6 pr-2.5', isSelected ? 'bg-amber-soft' : 'hover:bg-bg')}>
                          <Icon size={14} className={clsx('shrink-0', isSelected ? 'text-ink' : 'text-muted')} aria-hidden="true" />
                          <span className={clsx('min-w-0 flex-1 truncate text-[13px]', isSelected ? 'font-medium text-ink' : 'text-ink')}>{d.display_name}</span>
                          <span className="num shrink-0 text-[11px] text-muted">{formatNumber(d.rows)}</span>
                        </div>
                      );
                    })
                  )
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
