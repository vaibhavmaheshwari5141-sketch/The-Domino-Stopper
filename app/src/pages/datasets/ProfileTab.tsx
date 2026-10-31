import { Info } from 'lucide-react';
import { ErrorState } from '../../components/ErrorState';
import type { ColumnProfile } from '../../lib/api';
import { formatNumber, formatPercent } from '../../lib/format';
import { useDatasetProfile } from '../../lib/queries';
import { columnMeaning } from '../../config/datasetDocs';
import { formatCell, KIND_LABELS } from './cells';

/** Per column: how much is missing, and either the range or the most common values. */
export function ProfileTab({ name }: { name: string }) {
  const { data, error, isPending, isFetching, refetch } = useDatasetProfile(name, true);

  if (error) return <div className="p-3"><ErrorState title="Could not profile this table" error={error} onRetry={() => void refetch()} retrying={isFetching} /></div>;
  if (isPending) {
    return (
      <div className="grid gap-2 p-3 wide:grid-cols-2" aria-busy="true">
        <p className="text-[12px] text-muted wide:col-span-2">Profiling every column. Big tables take a few seconds.</p>
        {Array.from({ length: 8 }, (_, i) => <span key={i} className="skeleton block h-28" />)}
      </div>
    );
  }

  return (
    <div className="h-[60vh] overflow-auto p-3 fit:h-auto fit:min-h-0 fit:flex-1">
      <p className="mb-2 flex items-start gap-1.5 text-[12px] text-muted">
        <Info size={14} className="mt-px shrink-0" aria-hidden="true" />
        {data.note ?? `Based on all ${formatNumber(data.rows)} rows.`}
      </p>
      <ul className="grid gap-2 wide:grid-cols-2">
        {data.columns.map((c) => <ColumnCard key={c.name} column={c} meaning={columnMeaning(name, c.name)} profiled={data.profiled_rows} />)}
      </ul>
    </div>
  );
}

function Bar({ share, tone }: { share: number; tone: string }) {
  return (
    <span className="block h-1.5 flex-1 overflow-hidden rounded-full bg-bg" aria-hidden="true">
      <span className={`block h-full rounded-full ${tone}`} style={{ width: `${Math.min(100, Math.max(share > 0 ? 1 : 0, share * 100))}%` }} />
    </span>
  );
}

function ColumnCard({ column: c, meaning, profiled }: { column: ColumnProfile; meaning: string | null; profiled: number }) {
  const nullShare = c.null_share ?? 0;
  return (
    <li className="rounded-control border p-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="num min-w-0 truncate text-[13px] font-semibold text-ink" title={c.name}>{c.name}</span>
        <span className="num shrink-0 text-[11px] text-muted" title={KIND_LABELS[c.kind]}>{c.type}</span>
      </div>
      {meaning && <p className="mt-0.5 line-clamp-2 text-[11.5px] leading-snug text-muted" title={meaning}>{meaning}</p>}

      <div className="mt-2 flex items-center gap-2 text-[12px]" title={`${formatNumber(c.nulls)} null values`}>
        <span className="w-24 shrink-0 text-muted">Missing (null)</span>
        <Bar share={nullShare} tone={nullShare >= 0.5 ? 'bg-critical' : nullShare > 0 ? 'bg-warning' : 'bg-success'} />
        <span className="num w-14 shrink-0 text-right text-ink">{formatPercent(c.null_share)}</span>
      </div>

      {c.min !== undefined ? (
        <div className="mt-1.5 flex items-center gap-2 text-[12px]">
          <span className="w-24 shrink-0 text-muted">Range</span>
          <span className="num min-w-0 truncate text-ink" title={`${String(c.min)} to ${String(c.max)}`}>
            {c.min === null ? 'No values' : `${formatCell(c.min, c.kind)} to ${formatCell(c.max, c.kind)}`}
          </span>
        </div>
      ) : (
        <>
          <div className="mt-1.5 flex items-center gap-2 text-[12px]">
            <span className="w-24 shrink-0 text-muted">Distinct values</span>
            <span className="num text-ink">{formatNumber(c.distinct)}</span>
            {c.distinct !== undefined && c.distinct > 0 && c.distinct === profiled - c.nulls && <span className="text-muted">(every value different)</span>}
          </div>
          {c.top && c.top.length > 0 && (
            <ul className="mt-1.5 space-y-1" aria-label={`Most common values of ${c.name}`}>
              {c.top.map((t) => {
                const share = profiled ? t.count / profiled : 0;
                return (
                  <li key={t.value} className="flex items-center gap-2 text-[12px]" title={`${t.value}: ${formatNumber(t.count)} rows (${formatPercent(share, 2)})`}>
                    <span className="num w-24 shrink-0 truncate text-ink">{t.value}</span>
                    <Bar share={share} tone="bg-teal" />
                    {/* Below 0.1% a percentage reads as zero, so show the row count */}
                    <span className="num w-14 shrink-0 text-right text-muted">{share >= 0.001 ? formatPercent(share) : `${formatNumber(t.count)} rows`}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </li>
  );
}
