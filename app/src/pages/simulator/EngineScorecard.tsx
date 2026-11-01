import { Card } from '../../components/Card';
import { ErrorState } from '../../components/ErrorState';
import { Money } from '../../components/Money';
import { StatusChip } from '../../components/StatusChip';
import type { KpiCatalogRow } from '../../lib/api';
import { EMPTY, formatNumber, formatPercent } from '../../lib/format';
import { useKpiCatalog } from '../../lib/queries';
import { VIEW_HELP } from '../../../shared/kpis';

/** A catalogue value in its own unit, read from the KPI name (the table stores plain numbers). */
function KpiValue({ row, value }: { row: KpiCatalogRow; value: number | null }) {
  const n = row.kpi_name;
  if (value === null) return <span className="text-muted">{EMPTY}</span>;
  if (n.includes('usd')) return <Money value={value} />;
  if (n === 'budget_respected') return <span>{value === 1 ? 'Always' : 'Not always'}</span>;
  if (n.endsWith('_pp') || n.includes('_pp_')) return <span className="num">{formatNumber(value, 2)} pp</span>;
  if (n.includes('auc') || n.includes('correlation')) return <span className="num">{formatNumber(value, 3)}</span>;
  if (n.includes('rmse')) return <span className="num">{formatNumber(value, 2)} min</span>;
  if (n.includes('share') || n.includes('capture') || n.includes('robustness')) return <span className="num">{formatPercent(value, 1)}</span>;
  return <span className="num">{formatNumber(value, 1)}</span>;
}

/** gold_kpi_catalog: each KPI with its target, the v1 and v2 values, and whether v2 meets the target. */
export function EngineScorecard() {
  const { data, isError, error, refetch, isFetching } = useKpiCatalog();
  return (
    <Card title="Engine scorecard">
      <div className="overflow-x-auto px-4 pb-4">
        <p className="mb-3 rounded-control border-l-2 border-amber bg-amber-soft px-3 py-2 text-[13px] text-ink">
          Version 2 trades a little on the curve view for much more on the model view and passes every guardrail.
        </p>
        {isError && !data ? <ErrorState error={error} onRetry={() => void refetch()} retrying={isFetching} /> : !data ? <span className="skeleton block h-80" /> : (
          <table className="w-full min-w-[720px] text-[12px]">
            <thead>
              <tr className="border-b text-left text-muted">
                <th scope="col" className="py-2 pr-3 font-medium">KPI</th>
                <th scope="col" className="px-3 py-2 font-medium">Target</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">v1</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">v2</th>
                <th scope="col" className="py-2 pl-3 text-right font-medium">Target met (v2)</th>
              </tr>
            </thead>
            {data.groups.map((g) => (
              <tbody key={g.engine}>
                <tr><th scope="rowgroup" colSpan={5} className="pb-1 pt-4 text-left text-[13px] font-semibold text-ink">{g.engine}</th></tr>
                {g.levels.map((l) => l.rows.map((r, i) => (
                  <tr key={r.kpi_name} className="border-b last:border-0">
                    <th scope="row" className="py-1.5 pr-3 text-left font-normal text-ink">
                      {i === 0 && <span className="label mb-0.5 block text-[10px]">{l.level}</span>}
                      <span className={l.level === 'Main' ? 'font-semibold' : undefined}>{r.kpi_label}</span>
                    </th>
                    <td className="px-3 py-1.5 text-muted">{r.target ?? EMPTY}</td>
                    <td className="px-3 py-1.5 text-right text-muted"><KpiValue row={r} value={r.value_v1} /></td>
                    <td className="px-3 py-1.5 text-right font-semibold text-ink"><KpiValue row={r} value={r.value_v2} /></td>
                    <td className="py-1.5 pl-3 text-right"><StatusChip ok={r.target_met} /></td>
                  </tr>
                )))}
              </tbody>
            ))}
          </table>
        )}
        <p className="mt-3 text-[11px] leading-relaxed text-muted">
          {VIEW_HELP.curve} {VIEW_HELP.model} Negative net values are real results: adding buffer costs more than the delay it prevents at the default costs.
        </p>
      </div>
    </Card>
  );
}
