import clsx from 'clsx';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Download, Search, X } from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';
import { ErrorState } from '../../components/ErrorState';
import type { DatasetColumn } from '../../lib/api';
import { formatNumber } from '../../lib/format';
import { datasetDownloadUrl, useDatasetPreview } from '../../lib/queries';
import { columnMeaning } from '../../config/datasetDocs';
import { formatCell, rawCell } from './cells';

const PAGE_SIZES = [25, 50, 100] as const;
const DOWNLOAD_ROWS = 5000;

interface Sort {
  column: string;
  order: 'asc' | 'desc';
}

/** Rows of one dataset, paged, sorted and searched on the server. */
export function PreviewTab({ name }: { name: string }) {
  const [text, setText] = useState('');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<Sort | null>(null);
  const [size, setSize] = useState<(typeof PAGE_SIZES)[number]>(50);
  const [page, setPage] = useState(0);

  // The search runs 300 ms after typing stops
  useEffect(() => {
    const id = setTimeout(() => {
      setSearch(text.trim());
      setPage(0);
    }, 300);
    return () => clearTimeout(id);
  }, [text]);

  const params = { limit: size, offset: page * size, sort: sort?.column ?? null, order: sort?.order ?? null, search: search || null };
  const { data, error, isPending, isFetching, isPlaceholderData, refetch } = useDatasetPreview(name, params);

  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / size));
  const first = total ? page * size + 1 : 0;
  const last = Math.min(total, (page + 1) * size);

  const toggleSort = (column: string) => {
    // Ascending, then descending, then back to the table's own order
    setSort((s) => (s?.column !== column ? { column, order: 'asc' } : s.order === 'asc' ? { column, order: 'desc' } : null));
    setPage(0);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-2 px-3 py-2.5">
        <label className="flex h-8 w-64 max-w-full items-center gap-2 rounded-control border bg-surface px-2.5 focus-within:ring-2 focus-within:ring-teal">
          <Search size={14} className="shrink-0 text-muted" aria-hidden="true" />
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Search text columns" aria-label="Search the rows (text columns)"
            maxLength={100} className="w-full bg-transparent text-[13px] text-ink outline-none placeholder:text-muted" />
          {text && (
            <button type="button" aria-label="Clear search" onClick={() => setText('')} className="focus-ring rounded text-muted hover:text-ink">
              <X size={14} aria-hidden="true" />
            </button>
          )}
        </label>
        <label className="flex items-center gap-1.5 text-[12px] text-muted">
          Rows per page
          <select value={size} onChange={(e) => { setSize(Number(e.target.value) as typeof size); setPage(0); }}
            className="focus-ring h-8 rounded-control border bg-surface px-1.5 text-[12px] text-ink">
            {PAGE_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <a href={datasetDownloadUrl(name, { limit: DOWNLOAD_ROWS, sort: params.sort, order: params.order, search: params.search })}
          download={`${name}_preview.csv`} title={`The first ${formatNumber(DOWNLOAD_ROWS)} rows, in the current sort and search`}
          className="focus-ring ml-auto inline-flex h-8 items-center gap-1.5 rounded-control border px-3 text-[13px] font-medium text-ink hover:bg-bg">
          <Download size={14} aria-hidden="true" />
          Download CSV
        </a>
      </div>

      {error && !data ? (
        <div className="px-3 pb-3"><ErrorState title="Could not load the rows" error={error} onRetry={() => void refetch()} retrying={isFetching} /></div>
      ) : isPending ? (
        <div className="space-y-1.5 px-3 pb-3" aria-busy="true">
          {Array.from({ length: 12 }, (_, i) => <span key={i} className="skeleton block h-6" />)}
        </div>
      ) : (
        <>
          {error && <div className="px-3 pb-2"><ErrorState title="Could not load this page" error={error} onRetry={() => void refetch()} retrying={isFetching} /></div>}
          {/* Fixed height when the page scrolls (small screens); fills the panel when the page fits the viewport */}
          <div className={clsx('mx-3 h-[60vh] overflow-auto rounded-control border transition-opacity fit:h-auto fit:min-h-0 fit:flex-1',
            isPlaceholderData && 'opacity-60')} aria-busy={isFetching}>
            <table className="min-w-full border-separate border-spacing-0 text-[12px]">
              <thead>
                <tr>
                  {data.columns.map((c, i) => (
                    <HeaderCell key={c.name} column={c} meaning={columnMeaning(name, c.name)} first={i === 0} sort={sort} onSort={toggleSort} />
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row, r) => (
                  <tr key={data.offset + r} className="group">
                    {row.map((v, i) => <Cell key={i} value={v} column={data.columns[i]} first={i === 0} />)}
                  </tr>
                ))}
              </tbody>
            </table>
            {data.rows.length === 0 && (
              <p className="px-3 py-10 text-center text-[13px] text-muted">
                {search ? `No rows have a text value containing “${search}”.` : 'This table has no rows.'}
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
            <p className="num text-[12px] text-muted" aria-live="polite">
              {total ? `Rows ${formatNumber(first)}–${formatNumber(last)} of ${formatNumber(total)}${search ? ' matching' : ''}` : 'No rows'}
            </p>
            <div className="flex items-center gap-1">
              <PageButton label="First page" disabled={page === 0} onClick={() => setPage(0)}><ChevronsLeft size={14} /></PageButton>
              <PageButton label="Previous page" disabled={page === 0} onClick={() => setPage((p) => p - 1)}><ChevronLeft size={14} /></PageButton>
              <span className="num px-2 text-[12px] text-muted">Page {formatNumber(page + 1)} of {formatNumber(pages)}</span>
              <PageButton label="Next page" disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)}><ChevronRight size={14} /></PageButton>
              <PageButton label="Last page" disabled={page >= pages - 1} onClick={() => setPage(pages - 1)}><ChevronsRight size={14} /></PageButton>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

interface HeaderProps {
  column: DatasetColumn;
  meaning: string | null;
  first: boolean;
  sort: Sort | null;
  onSort: (c: string) => void;
}

function HeaderCell({ column: c, meaning, first, sort, onSort }: HeaderProps) {
  const active = sort?.column === c.name ? sort.order : null;
  const Icon = active === 'asc' ? ArrowUp : active === 'desc' ? ArrowDown : ArrowUpDown;
  return (
    <th scope="col" aria-sort={active === 'asc' ? 'ascending' : active === 'desc' ? 'descending' : 'none'}
      className={clsx('sticky top-0 border-b bg-surface p-0 font-normal', first ? 'left-0 z-30 border-r' : 'z-20',
        c.kind === 'number' ? 'text-right' : 'text-left')}>
      <button type="button" onClick={() => onSort(c.name)} title={`${c.name} (${c.type})${meaning ? `: ${meaning}` : ''}\nClick to sort.`}
        className={clsx('focus-ring flex w-full items-center gap-1 whitespace-nowrap px-2.5 py-1.5 hover:bg-bg', c.kind === 'number' && 'flex-row-reverse')}>
        <span className="flex flex-col">
          <span className="num text-[12px] font-semibold text-ink">{c.name}</span>
          <span className="text-[10px] text-muted">{c.type}</span>
        </span>
        <Icon size={12} className={active ? 'text-ink' : 'text-line'} aria-hidden="true" />
      </button>
    </th>
  );
}

function Cell({ value, column, first }: { value: unknown; column: DatasetColumn; first: boolean }) {
  const isNull = value === null || value === undefined;
  const right = column.kind === 'number';
  return (
    <td title={rawCell(value)}
      className={clsx('max-w-[260px] truncate whitespace-nowrap border-b px-2.5 py-1.5 group-hover:bg-bg',
        first ? 'sticky left-0 z-10 border-r bg-surface' : '',
        right ? 'num text-right' : column.kind === 'text' || column.kind === 'other' ? '' : 'num',
        isNull ? 'text-muted' : 'text-ink')}>
      {formatCell(value, column.kind)}
    </td>
  );
}

function PageButton({ label, disabled, onClick, children }: { label: string; disabled: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} disabled={disabled} onClick={onClick}
      className="focus-ring inline-flex h-7 w-7 items-center justify-center rounded-control border text-ink hover:bg-bg disabled:opacity-40 disabled:hover:bg-transparent">
      {children}
    </button>
  );
}
