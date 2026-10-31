import clsx from 'clsx';
import { ArrowUpRight } from 'lucide-react';
import { type KeyboardEvent, type ReactNode, useRef } from 'react';
import { Link } from 'react-router-dom';
import { DATASET_DOCS } from '../../config/datasetDocs';
import type { DatasetItem } from '../../lib/api';
import { formatNumber } from '../../lib/format';
import { usedOnPages } from './cells';
import { ColumnsTab } from './ColumnsTab';
import { LearnTab } from './LearnTab';
import { PreviewTab } from './PreviewTab';
import { ProfileTab } from './ProfileTab';
import { type DatasetTab, TABS } from './useInputDataState';

interface Props {
  dataset: DatasetItem;
  tab: DatasetTab;
  onTab: (tab: DatasetTab) => void;
}

function Chip({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <span title={title} className="inline-flex h-6 max-w-full items-center gap-1 rounded-full border bg-bg px-2.5 text-[12px] text-ink">
      {children}
    </span>
  );
}

/** One dataset: what it is, then its rows, columns and profile in tabs. */
export function DatasetPanel({ dataset: d, tab, onTab }: Props) {
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const pages = usedOnPages(d.dashboard_page);
  const use = DATASET_DOCS[d.name]?.use;

  // Left and right arrows move between tabs (the usual tablist keys)
  const onTabKey = (e: KeyboardEvent) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const i = TABS.findIndex((t) => t.value === tab);
    const next = (i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length;
    onTab(TABS[next].value);
    tabRefs.current[next]?.focus();
  };

  return (
    <section className="flex min-h-0 min-w-0 flex-col rounded-card border bg-surface">
      <header className="space-y-2 px-4 pt-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="num min-w-0 break-all text-[15px] font-semibold text-ink">{d.name}</h2>
          <span className={clsx('rounded-full px-2 py-0.5 text-[11px] font-medium', d.group === 'input' ? 'bg-teal-soft text-teal' : 'bg-amber-soft text-ink')}>
            {d.group === 'input' ? 'Input sample' : 'Gold output'}
          </span>
        </div>
        {d.description && <p className="text-[13px] text-muted">{d.description}</p>}
        {use && (
          <p className="text-[13px] text-ink">
            <span className="font-medium">Used for: </span>{use}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-1.5">
          <Chip><span className="num">{formatNumber(d.rows)}</span> rows</Chip>
          <Chip><span className="num">{formatNumber(d.columns)}</span> columns</Chip>
          {d.grain && <Chip title="What one row stands for">Grain: {d.grain}</Chip>}
          {d.group === 'gold' && d.dashboard_page && (
            <Chip title={`gold_table_catalog: ${d.dashboard_page}`}>
              Used on:{' '}
              {pages.length ? pages.map((p, i) => (
                <span key={p.path} className="inline-flex items-center">
                  {i > 0 && <span className="mr-1 text-muted">,</span>}
                  <Link to={p.path} className="focus-ring inline-flex items-center gap-0.5 rounded font-medium text-teal hover:underline">
                    {p.title}<ArrowUpRight size={12} aria-hidden="true" />
                  </Link>
                </span>
              )) : <span className="truncate">{d.dashboard_page}</span>}
            </Chip>
          )}
        </div>
      </header>

      <div role="tablist" aria-label="Dataset views" onKeyDown={onTabKey} className="mt-3 flex gap-1 border-b px-3">
        {TABS.map((t, i) => {
          const active = t.value === tab;
          return (
            <button key={t.value} ref={(el) => { tabRefs.current[i] = el; }} type="button" role="tab" id={`tab-${t.value}`}
              aria-selected={active} aria-controls={`panel-${t.value}`} tabIndex={active ? 0 : -1} onClick={() => onTab(t.value)}
              className={clsx('focus-ring -mb-px border-b-2 px-3 py-2 text-[13px]',
                active ? 'border-amber font-medium text-ink' : 'border-transparent text-muted hover:text-ink')}>
              {t.label}
            </button>
          );
        })}
      </div>

      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="flex min-h-0 flex-1 flex-col">
        {/* Keyed by dataset, so search, sort and page start fresh for each table */}
        {tab === 'preview' && <PreviewTab key={d.name} name={d.name} />}
        {tab === 'columns' && <ColumnsTab name={d.name} />}
        {tab === 'profile' && <ProfileTab name={d.name} />}
        {tab === 'learn' && <LearnTab dataset={d} />}
      </div>
    </section>
  );
}
