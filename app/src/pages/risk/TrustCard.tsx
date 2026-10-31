import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card } from '../../components/Card';
import { ErrorState } from '../../components/ErrorState';
import type { ModelMetric } from '../../lib/api';
import { axisProps, axisTick, chartColors, gridProps } from '../../lib/chart';
import { EMPTY, formatNumber, formatPercent } from '../../lib/format';
import { useModelQuality } from '../../lib/queries';
import { ChartTooltipBox, LegendItem } from '../overview/ChartTooltip';

// Predictor names as stored -> plain labels
const PREDICTOR: Record<string, string> = {
  'LightGBM model': 'Forecast model (LightGBM)',
  'Baseline: airport and hour late-rate': 'Airport-and-hour rule',
  'Baseline: training late-rate': 'Naive (same chance for every flight)',
  'Baseline: training average': 'Naive (same delay for every flight)',
};

function metric(metrics: ModelMetric[], model: string, measure: string, predictor: string): number | null {
  return metrics.find((m) => m.model === model && m.period === 'test' && m.measure === measure && m.predictor === predictor)?.value ?? null;
}

/** "Can we trust the forecast?": decile calibration, model against baselines, and what drives the forecast. */
export function TrustCard() {
  const { data, isError, error, refetch, isFetching } = useModelQuality();
  if (isError && !data) return <Card title="Can we trust the forecast?"><div className="px-4 pb-4"><ErrorState error={error} onRetry={() => void refetch()} retrying={isFetching} /></div></Card>;

  const deciles = (data?.deciles ?? []).filter((d) => d.model === 'late_warning' && d.period === 'test').map((d) => ({ ...d, label: String(d.decile) }));
  const features = (data?.features ?? []).filter((f) => f.model === 'late_warning').slice(0, 6);
  const m = data?.metrics ?? [];
  const aucRows = ['LightGBM model', 'Baseline: airport and hour late-rate', 'Baseline: training late-rate'];
  const inboundRows = ['LightGBM model', 'Baseline: training average'];

  return (
    <Card title="Can we trust the forecast?">
      <div className="grid grid-cols-1 gap-6 px-4 pb-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <section aria-label="Predicted against observed by risk tenth">
          <h3 className="text-[13px] font-semibold text-ink">Late warning: predicted vs observed, by risk tenth</h3>
          <p className="mt-0.5 text-[13px] text-ink">{data ? data.decile_caption : <span className="skeleton inline-block h-4 w-2/3" />}</p>
          <div className="mt-2 flex gap-4">
            <LegendItem color={chartColors.amber} label="Predicted late share" />
            <LegendItem color={chartColors.tarmac} label="Observed late share" />
          </div>
          <div className="mt-2 h-56">
            {!data ? <span className="skeleton block h-full" /> : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={deciles} margin={{ top: 8, right: 8, bottom: 14, left: -8 }} barGap={1} barCategoryGap="20%">
                  <CartesianGrid {...gridProps} />
                  <XAxis dataKey="label" {...axisProps} label={{ value: 'Risk tenth (1 = safest, 10 = riskiest)', position: 'insideBottom', offset: -10, ...axisTick }} />
                  <YAxis {...axisProps} width={44} tickFormatter={(v: number) => formatPercent(v, 0)} />
                  <Tooltip cursor={{ fill: 'var(--color-bg)' }} content={({ active, payload }) => {
                    const d = payload?.[0]?.payload as (typeof deciles)[number] | undefined;
                    return active && d ? (
                      <ChartTooltipBox title={`Risk tenth ${d.decile}`} rows={[
                        ['Predicted late share', formatPercent(d.predicted)],
                        ['Observed late share', formatPercent(d.observed)],
                        ['Turnarounds', formatNumber(d.turnarounds)],
                      ]} />
                    ) : null;
                  }} />
                  <Bar dataKey="predicted" fill={chartColors.amber} radius={[2, 2, 0, 0]} isAnimationActive={false} />
                  <Bar dataKey="observed" fill={chartColors.tarmac} radius={[2, 2, 0, 0]} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </section>

        <div className="space-y-5">
          <section aria-label="Model against simple rules">
            <h3 className="text-[13px] font-semibold text-ink">Model against simple rules (test months)</h3>
            {!data ? <span className="skeleton mt-2 block h-32" /> : (
              <table className="mt-2 w-full text-[12px]">
                <thead>
                  <tr className="border-b text-left text-muted">
                    <th scope="col" className="py-1.5 font-medium">Late warning</th>
                    <th scope="col" className="py-1.5 text-right font-medium">AUC</th>
                  </tr>
                </thead>
                <tbody>
                  {aucRows.map((p) => (
                    <tr key={p} className={p === 'LightGBM model' ? 'font-semibold' : undefined}>
                      <td className="py-1">{PREDICTOR[p] ?? p}</td>
                      <td className="num py-1 text-right">{formatNumber(metric(m, 'late_warning', 'AUC', p), 3)}</td>
                    </tr>
                  ))}
                </tbody>
                <thead>
                  <tr className="border-b text-left text-muted">
                    <th scope="col" className="pb-1.5 pt-3 font-medium">Inbound risk</th>
                    <th scope="col" className="pb-1.5 pt-3 text-right font-medium">RMSE · rank corr.</th>
                  </tr>
                </thead>
                <tbody>
                  {inboundRows.map((p) => {
                    const rmse = metric(m, 'inbound_risk', 'RMSE', p);
                    const rc = metric(m, 'inbound_risk', 'RankCorrelation', p);
                    return (
                      <tr key={p} className={p === 'LightGBM model' ? 'font-semibold' : undefined}>
                        <td className="py-1">{PREDICTOR[p] ?? p}</td>
                        <td className="num py-1 text-right">{rmse === null ? EMPTY : `${formatNumber(rmse, 1)} min`} · {formatNumber(rc, 2)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
            <p className="mt-2 text-[11px] leading-relaxed text-muted">
              AUC is the chance that a late flight is ranked above an on-time one. 0.5 is a coin toss. RMSE is the typical error in minutes
              (lower is better); rank correlation says how well the order of delays is predicted (0 = none, 1 = perfect).
            </p>
          </section>

          <section aria-label="What drives the forecast">
            <h3 className="text-[13px] font-semibold text-ink">What drives the forecast</h3>
            {!data ? <span className="skeleton mt-2 block h-36" /> : (
              <ul className="mt-2 space-y-1.5">
                {features.map((f) => (
                  <li key={f.feature} className="text-[12px]">
                    <div className="flex justify-between gap-2">
                      <span className="truncate text-ink">{f.feature_label}</span>
                      <span className="num shrink-0 text-muted">{formatPercent(f.importance_pct / 100)}</span>
                    </div>
                    <span className="mt-0.5 block h-1.5 overflow-hidden rounded-full bg-bg" aria-hidden="true">
                      <span className="block h-full rounded-full bg-teal" style={{ width: `${Math.min(100, (f.importance_pct / (features[0]?.importance_pct || 1)) * 100)}%` }} />
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-[11px] text-muted">Share of the late-warning model's decisions that rely on each input (top 6).</p>
          </section>
        </div>
      </div>
    </Card>
  );
}
