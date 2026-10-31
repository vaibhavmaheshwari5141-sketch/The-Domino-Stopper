import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { StrategyResult } from '../../lib/api';
import { WrappedTick } from '../../components/charts';
import { axisProps, chartColors, gridProps } from '../../lib/chart';
import { formatNumber } from '../../lib/format';
import { ChartTooltipBox, LegendItem } from './ChartTooltip';

// gold_sim_strategy names -> chart labels, in display order. Unknown strategies are appended with their own name.
const LABELS: [string, string][] = [
  ['Spread evenly', 'Spread evenly'],
  ['Shortest first', 'Shortest first'],
  ['Riskiest first', 'Riskiest first'],
  ['Engine (our method)', 'Engine'],
  ['Hindsight (not possible)', 'Hindsight (ceiling)'],
];
const isEngine = (strategy: string) => strategy.startsWith('Engine');

interface Datum {
  label: string;
  normal: number | null;
  disruption: number | null;
  normalLabel: string;
  disruptionLabel: string;
}

function toData(rows: StrategyResult[]): Datum[] {
  const known = new Map(LABELS);
  const names = [...LABELS.map(([s]) => s).filter((s) => rows.some((r) => r.strategy === s)),
    ...new Set(rows.map((r) => r.strategy).filter((s) => !known.has(s)))];
  return names.map((strategy) => {
    const pick = (day: StrategyResult['day_type']) =>
      rows.find((r) => r.strategy === strategy && r.day_type === day)?.absorbed_per_100_added ?? null;
    const normal = pick('normal days');
    const disruption = pick('disruption days');
    return {
      label: known.get(strategy) ?? strategy,
      normal,
      disruption,
      normalLabel: isEngine(strategy) ? formatNumber(normal, 1) : '',
      disruptionLabel: isEngine(strategy) ? formatNumber(disruption, 1) : '',
    };
  });
}

/** Engine value label. `align="end"` right-aligns it to the bar so it does not run into the taller bar beside it. */
function ValueLabel({ x = 0, y = 0, width = 0, value, align = 'middle' }: {
  x?: number | string; y?: number | string; width?: number | string; value?: string | number; align?: 'middle' | 'end';
}) {
  if (value === undefined || value === '') return null;
  const left = Number(x);
  return (
    <text x={align === 'end' ? left + Number(width) : left + Number(width) / 2} y={Number(y) - 5} textAnchor={align}
      fontFamily="var(--font-mono)" fontSize={11} fill="var(--color-ink)">
      {value}
    </text>
  );
}

function StrategyTip({ active, payload, label }: { active?: boolean; payload?: { payload: Datum }[]; label?: string }) {
  const d = payload?.[0]?.payload;
  if (!active || !d) return null;
  return (
    <ChartTooltipBox
      title={label}
      rows={[['Normal days', formatNumber(d.normal, 1)], ['Disruption days', formatNumber(d.disruption, 1)]]}
    />
  );
}

export function StrategyChart({ rows, budget }: { rows: StrategyResult[]; budget: number }) {
  const data = toData(rows);
  return (
    <div className="flex min-h-0 min-w-0 flex-col">
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
        <div>
          <h3 className="text-[13px] font-semibold text-ink">Delay absorbed per 100 buffer minutes</h3>
          <p className="text-xs text-muted">{budget} extra min per turnaround</p>
        </div>
        <div className="flex gap-3 pt-0.5">
          <LegendItem color={chartColors.tarmac} label="Normal days" />
          <LegendItem color={chartColors.amber} label="Disruption days" />
        </div>
      </div>
      <div className="mt-2 min-h-0 flex-1">
        {data.length === 0 ? (
          <p className="flex h-full items-center justify-center text-sm text-muted">No strategy results for {budget} min.</p>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 18, right: 4, bottom: 0, left: -18 }} barGap={2} barCategoryGap="24%">
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="label" {...axisProps} interval={0} height={32} tick={<WrappedTick />} />
              <YAxis {...axisProps} width={44} />
              <Tooltip cursor={{ fill: 'var(--color-bg)' }} content={<StrategyTip />} />
              <Bar dataKey="normal" name="Normal days" fill={chartColors.tarmac} radius={[3, 3, 0, 0]} maxBarSize={26} isAnimationActive={false}>
                <LabelList dataKey="normalLabel" content={<ValueLabel align="end" />} />
              </Bar>
              <Bar dataKey="disruption" name="Disruption days" fill={chartColors.amber} radius={[3, 3, 0, 0]} maxBarSize={26} isAnimationActive={false}>
                <LabelList dataKey="disruptionLabel" content={<ValueLabel />} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
      <p className="mt-1 text-[11px] text-muted">Hindsight knows real delays and is shown only as a ceiling.</p>
    </div>
  );
}
