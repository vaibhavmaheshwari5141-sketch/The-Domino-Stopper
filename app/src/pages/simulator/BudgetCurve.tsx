import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card } from '../../components/Card';
import { SegmentedControl } from '../../components/SegmentedControl';
import { STRATEGY_COLOR } from '../../config/strategies';
import type { SimStrategyRow } from '../../lib/api';
import { axisProps, chartColors, gridProps } from '../../lib/chart';
import { formatCompact, formatNumber } from '../../lib/format';
import { PLANNER_BUDGETS } from '../../../shared/planner';
import { STRATEGIES } from '../../../shared/simulator';
import { ChartTooltipBox } from '../overview/ChartTooltip';
import type { Metric } from './useSimulatorState';

interface Props {
  rows: SimStrategyRow[] | undefined;
  selected: string[];
  budget: number;
  metric: Metric;
  onMetric: (m: Metric) => void;
}

export function BudgetCurve({ rows, selected, budget, metric, onMetric }: Props) {
  const strategies = STRATEGIES.filter((s) => selected.includes(s.name));
  // One point per budget, one key per strategy id
  const data = PLANNER_BUDGETS.map((b) => {
    const point: Record<string, number | null> = { budget: b };
    for (const s of strategies) {
      const r = rows?.find((x) => x.strategy === s.name && x.budget_scenario === b);
      point[s.id] = r ? (metric === 'per100' ? r.absorbed_per_100_added : r.absorbed_min) : null;
    }
    return point;
  });
  const fmt = (v: number | null) => (metric === 'per100' ? formatNumber(v, 1) : `${formatCompact(v)} min`);

  return (
    <Card
      title="How the budget changes the result"
      aside={
        <SegmentedControl label="Measure" value={metric} onChange={onMetric}
          options={[{ value: 'per100', label: 'Per 100 buffer min' }, { value: 'total', label: 'Total absorbed' }]} />
      }
    >
      <div className="h-64 px-2">
        {!rows ? <span className="skeleton block h-full" /> : strategies.length === 0 ? (
          <p className="flex h-full items-center justify-center text-[13px] text-muted">Select at least one strategy.</p>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 12, right: 28, bottom: 0, left: metric === 'total' ? 0 : -12 }}>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="budget" type="number" domain={[2, 15]} ticks={[...PLANNER_BUDGETS]} {...axisProps}
                tickFormatter={(v: number) => `${v} min`} />
              <YAxis {...axisProps} width={metric === 'total' ? 52 : 44} tickFormatter={(v: number) => (metric === 'per100' ? `${v}` : formatCompact(v))} />
              <ReferenceLine x={budget} stroke={chartColors.amber} strokeDasharray="4 4"
                label={{ value: 'selected', position: 'insideTopRight', fontSize: 10, fill: chartColors.amber, fontFamily: 'var(--font-mono)' }} />
              <Tooltip cursor={{ stroke: chartColors.line }} content={({ active, payload, label }) => (active && payload?.length ? (
                <ChartTooltipBox title={`${label} min per turnaround`}
                  rows={strategies.map((s) => [s.label, fmt((payload[0].payload as Record<string, number | null>)[s.id])])} />
              ) : null)} />
              {strategies.map((s) => (
                <Line key={s.id} type="monotone" dataKey={s.id} name={s.label} isAnimationActive={false}
                  stroke={STRATEGY_COLOR[s.id]} strokeWidth={s.id === 'engine' ? 3.5 : s.id === 'hindsight' ? 1.5 : 2}
                  strokeDasharray={s.id === 'hindsight' ? '5 4' : undefined}
                  dot={{ r: s.id === 'engine' ? 4 : 3, fill: STRATEGY_COLOR[s.id], strokeWidth: 0 }} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
      <p className="px-4 pb-3 pt-1 text-[11px] text-muted">The first minutes are worth the most; each extra minute absorbs less.</p>
    </Card>
  );
}
