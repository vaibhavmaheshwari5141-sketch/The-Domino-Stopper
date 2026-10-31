import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card } from '../../components/Card';
import { HatchDefs, WrappedTick } from '../../components/charts';
import { HATCH_ID, STRATEGY_COLOR } from '../../config/strategies';
import type { SimStrategyRow } from '../../lib/api';
import { axisProps, chartColors, gridProps } from '../../lib/chart';
import { formatNumber } from '../../lib/format';
import { strategyDef } from '../../../shared/simulator';
import { ChartTooltipBox } from '../overview/ChartTooltip';

interface Datum {
  id: string;
  label: string;
  per100: number | null;
  absorbed: number | null;
}

/** Value on top of the bar; the Hindsight bar also says "ceiling". */
function BarLabel({ x = 0, y = 0, width = 0, value, index, data }: {
  x?: number | string; y?: number | string; width?: number | string; value?: number | string; index?: number; data: Datum[];
}) {
  if (value === undefined || value === null) return null;
  const d = index !== undefined ? data[index] : undefined;
  return (
    <text x={Number(x) + Number(width) / 2} y={Number(y) - 6} textAnchor="middle" fontFamily="var(--font-mono)" fontSize={11}
      fontWeight={d?.id === 'engine' ? 700 : 400} fill={d?.id === 'engine' ? 'var(--color-amber)' : 'var(--color-ink)'}>
      {formatNumber(Number(value), 1)}{d?.id === 'hindsight' ? ' · ceiling' : ''}
    </text>
  );
}

export function EfficiencyBars({ rows, selected }: { rows: SimStrategyRow[] | undefined; selected: string[] }) {
  const data: Datum[] = (rows ?? []).filter((r) => selected.includes(r.strategy)).map((r) => {
    const def = strategyDef(r.strategy);
    return { id: def?.id ?? r.strategy, label: def?.label ?? r.strategy, per100: r.absorbed_per_100_added, absorbed: r.absorbed_min };
  });

  return (
    <Card title="Delay absorbed per 100 buffer minutes">
      <div className="h-64 px-2">
        {!rows ? <span className="skeleton block h-full" /> : data.length === 0 ? (
          <p className="flex h-full items-center justify-center text-[13px] text-muted">Select at least one strategy.</p>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 22, right: 8, bottom: 0, left: -12 }} barCategoryGap="28%">
              <HatchDefs />
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="label" {...axisProps} interval={0} height={32} tick={<WrappedTick />} />
              <YAxis {...axisProps} width={44} />
              <Tooltip cursor={{ fill: 'var(--color-bg)' }} content={({ active, payload }) => {
                const d = payload?.[0]?.payload as Datum | undefined;
                return active && d ? <ChartTooltipBox title={d.label} rows={[['Per 100 buffer min', formatNumber(d.per100, 1)], ['Delay absorbed', `${formatNumber(d.absorbed)} min`]]} /> : null;
              }} />
              <Bar dataKey="per100" radius={[3, 3, 0, 0]} maxBarSize={56} isAnimationActive={false}>
                {data.map((d) => (
                  <Cell key={d.id} fill={d.id === 'hindsight' ? `url(#${HATCH_ID})` : STRATEGY_COLOR[d.id] ?? chartColors.muted}
                    stroke={d.id === 'hindsight' ? chartColors.amber : undefined} strokeDasharray={d.id === 'hindsight' ? '4 3' : undefined} />
                ))}
                <LabelList dataKey="per100" content={<BarLabel data={data} />} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
      <p className="px-4 pb-3 pt-1 text-[11px] text-muted">Same budget for every strategy. Hindsight knows the real delays and is shown only as a ceiling.</p>
    </Card>
  );
}
