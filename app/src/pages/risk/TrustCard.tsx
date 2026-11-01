import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card } from '../../components/Card';
import { ErrorState } from '../../components/ErrorState';
import type { ModelMetric } from '../../lib/api';
import { axisProps, axisTick, chartColors, gridProps } from '../../lib/chart';
import { EMPTY, formatNumber, formatPercent } from '../../lib/format';
import { useModelQuality } from '../../lib/queries';
import { ChartTooltipBox, LegendItem } from '../overview/ChartTooltip';

// gold_model_metrics predictors: version 2 is stored as "LightGBM model", version 1 as "LightGBM v1"
const V2 = 'LightGBM model';
const V1 = 'LightGBM v1';
/** The simple rule each model is compared with. */
const RULE: Record<string, { predictor: string; label: string }> = {
  late_warning: { predictor: 'Baseline: airport and hour late-rate', label: 'Airport-and-hour rule' },
  inbound_risk: { predictor: 'Baseline: training average', label: 'Same delay for every flight' },
};

/** Measures shown, in order. `better` says which way is better, for the bold winner. */
const MEASURES: { model: string; measure: string; label: string; better: 'high' | 'low'; fmt: (v: number | null) => string }[] = [
  { model: 'late_warning', measure: 'AUC', label: 'AUC (main score)', better: 'high', fmt: (v) => formatNumber(v, 3) },
  { model: 'late_warning', measure: 'AUC_all_turnarounds', label: 'AUC, all turnarounds', better: 'high', fmt: (v) => formatNumber(v, 3) },
  { model: 'late_warning', measure: 'Top20Capture', label: 'Late flights in the riskiest 20%', better: 'high', fmt: (v) => formatPercent(v, 1) },
  { model: 'late_warning', measure: 'MaxMonthlyCalibrationGapPP', label: 'Largest monthly calibration gap', better: 'low', fmt: (v) => (v === null ? EMPTY : `${formatNumber(v, 2)} pp`) },
  { model: 'late_warning', measure: 'Brier', label: 'Brier score', better: 'low', fmt: (v) => formatNumber(v, 4) },
  { model: 'inbound_risk', measure: 'RMSE', label: 'Inbound delay error (RMSE)', better: 'low', fmt: (v) => (v === null ? EMPTY : `${formatNumber(v, 2)} min`) },
  { model: 'inbound_risk', measure: 'RankCorrelation', label: 'Inbound delay rank correlation', better: 'high', fmt: (v) => formatNumber(v, 3) },
];

/** The four inputs added in prediction engine v2. */
const NEW_IN_V2 = new Set(['dep_count_hr', 'route_in_late', 'route_out_late', 'route_in_apos']);
const FEATURES_SHOWN = 8;

function metric(metrics: ModelMetric[], model: string, measure: string, predictor: string): number | null {
  return metrics.find((m) => m.model === model && m.period === 'test' && m.measure === measure && m.predictor === predictor)?.value ?? null;
}

/** "Can we trust the forecast?": decile calibration, model against baselines, and what drives the forecast. */
export function TrustCard() {
  const { data, isError, error, refetch, isFetching } = useModelQuality();
  if (isError && !data) return <Card title="Can we trust the forecast?"><div className="px-4 pb-4"><ErrorState error={error} onRetry={() => void refetch()} retrying={isFetching} /></div></Card>;

  const deciles = (data?.deciles ?? []).filter((d) => d.model === 'late_warning' && d.period === 'test').map((d) => ({ ...d, label: String(d.decile) }));
  const features = (data?.features ?? []).filter((f) => f.model === 'late_warning').slice(0, FEATURES_SHOWN);
  const m = data?.metrics ?? [];

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
          <section aria-label="Model quality, version 1 and version 2">
            <h3 className="text-[13px] font-semibold text-ink">Model quality: v1 and v2 (test months)</h3>
            {!data ? <span className="skeleton mt-2 block h-32" /> : (
              <table className="mt-2 w-full text-[12px]">
                <thead>
                  <tr className="border-b text-left text-muted">
                    <th scope="col" className="py-1.5 font-medium">Measure</th>
                    <th scope="col" className="py-1.5 text-right font-medium">Simple rule</th>
                    <th scope="col" className="py-1.5 text-right font-medium">v1</th>
                    <th scope="col" className="py-1.5 text-right font-medium">v2</th>
                  </tr>
                </thead>
                <tbody>
                  {MEASURES.map((x, i) => {
                    const v1 = metric(m, x.model, x.measure, V1);
                    const v2 = metric(m, x.model, x.measure, V2);
                    const rule = metric(m, x.model, x.measure, RULE[x.model].predictor);
                    const v2Better = v1 !== null && v2 !== null && (x.better === 'high' ? v2 > v1 : v2 < v1);
                    const header = i === 0 || MEASURES[i - 1].model !== x.model;
                    return (
                      <tr key={`${x.model}-${x.measure}`} className={header && i > 0 ? 'border-t' : undefined}>
                        <td className="py-1">
                          {header && <span className="label block pt-1 text-[10px]">{x.model === 'late_warning' ? 'Late warning' : 'Inbound risk'} · rule: {RULE[x.model].label}</span>}
                          {x.label}
                        </td>
                        <td className="num py-1 text-right text-muted">{x.fmt(rule)}</td>
                        <td className="num py-1 text-right">{x.fmt(v1)}</td>
                        <td className={v2Better ? 'num py-1 text-right font-semibold text-teal' : 'num py-1 text-right font-semibold'}>{x.fmt(v2)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
            <p className="mt-2 text-[11px] leading-relaxed text-muted">
              Very short turns (under 20 min) are excluded from the main scores; they are mostly aircraft swaps. v2 values in teal beat v1.
              AUC is the chance that a late flight is ranked above an on-time one (0.5 is a coin toss). The calibration gap is the largest
              difference in any month between predicted and real late share. Brier and RMSE: lower is better.
            </p>
          </section>

          <section aria-label="What drives the forecast">
            <h3 className="text-[13px] font-semibold text-ink">What drives the forecast</h3>
            {!data ? <span className="skeleton mt-2 block h-36" /> : (
              <ul className="mt-2 space-y-1.5">
                {features.map((f) => (
                  <li key={f.feature} className="text-[12px]">
                    <div className="flex justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-1.5">
                        <span className="truncate text-ink">{f.feature_label}</span>
                        {NEW_IN_V2.has(f.feature) && <span className="shrink-0 rounded-full bg-teal-soft px-1.5 text-[10px] font-semibold text-teal">new in v2</span>}
                      </span>
                      <span className="num shrink-0 text-muted">{formatPercent(f.importance_pct / 100)}</span>
                    </div>
                    <span className="mt-0.5 block h-1.5 overflow-hidden rounded-full bg-bg" aria-hidden="true">
                      <span className="block h-full rounded-full bg-teal" style={{ width: `${Math.min(100, (f.importance_pct / (features[0]?.importance_pct || 1)) * 100)}%` }} />
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-[11px] text-muted">Share of the late-warning model's decisions that rely on each input (top {FEATURES_SHOWN}).</p>
          </section>
        </div>
      </div>
    </Card>
  );
}
