import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card } from '../../components/Card';
import { SegmentedControl } from '../../components/SegmentedControl';
import { strategyColor } from '../../config/strategies';
import type { EngineKpiRow } from '../../lib/api';
import { axisProps, chartColors, gridProps } from '../../lib/chart';
import { formatCompact, formatNumber } from '../../lib/format';
import { EVALUATOR_LABEL, type Evaluator, type EvaluatorChoice } from '../../../shared/kpis';
import { PLANNER_BUDGETS } from '../../../shared/planner';
import { strategyDef } from '../../../shared/simulator';
import { ChartTooltipBox } from '../overview/ChartTooltip';
import type { Metric } from './useSimulatorState';

interface Props {
  /** gold_engine_kpis for every budget (one day type, both views). */
  rows: EngineKpiRow[] | undefined;
  selected: string[];
  budget: number;
  evaluator: EvaluatorChoice;
  metric: Metric;
  onMetric: (m: Metric) => void;
}

/** One line per strategy and view: solid = curve view, dashed = model view. Each line reads one view only. */
export function BudgetCurve({ rows, selected, budget, evaluator, metric, onMetric }: Props) {
  const views: Evaluator[] = evaluator === 'both' ? ['curve', 'response model'] : [evaluator];
  const key = (id: string, view: Evaluator) => `${id}|${view === 'curve' ? 'c' : 'm'}`;
  const lines = selected.flatMap((name) => views.map((view) => ({ name, view, def: strategyDef(name), key: key(strategyDef(name).id, view) })))
    // A strategy without the model view at any budget other than the main one draws no model line
    .filter((l) => rows?.some((r) => r.strategy === l.name && r.evaluator === l.view));
  const data = PLANNER_BUDGETS.map((b) => {
    const point: Record<string, number | null> = { budget: b };
    for (const l of lines) {
      const r = rows?.find((x) => x.strategy === l.name && x.evaluator === l.view && x.budget_scenario === b);
      point[l.key] = r ? (metric === 'per100' ? r.prevented_per_100 : r.prevented_min) : null;
    }
    return point;
  });
  const fmt = (v: number | null) => (v === null ? 'not computed' : metric === 'per100' ? formatNumber(v, 1) : `${formatCompact(v)} min`);

  return (
    <Card
      title="How the budget changes the result"
      aside={
        <SegmentedControl label="Measure" value={metric} onChange={onMetric}
          options={[{ value: 'per100', label: 'Per 100 buffer min' }, { value: 'total', label: 'Total prevented' }]} />
      }
    >
      <div className="h-64 px-2">
        {!rows ? <span className="skeleton block h-full" /> : lines.length === 0 ? (
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
                  rows={lines.map((l) => [`${l.def.label}, ${EVALUATOR_LABEL[l.view].toLowerCase()}`, fmt((payload[0].payload as Record<string, number | null>)[l.key])])} />
              ) : null)} />
              {lines.map((l) => {
                const engine = l.def.id === 'engine';
                return (
                  <Line key={l.key} type="monotone" dataKey={l.key} name={`${l.def.label}, ${EVALUATOR_LABEL[l.view]}`} isAnimationActive={false} connectNulls
                    stroke={strategyColor(l.def.id)} strokeWidth={engine ? 3.5 : l.def.id === 'hindsight' ? 1.5 : 2}
                    strokeDasharray={l.view === 'response model' ? '6 4' : undefined} strokeOpacity={l.def.id === 'hindsight' ? 0.7 : 1}
                    dot={{ r: engine ? 4 : 3, fill: strategyColor(l.def.id), strokeWidth: 0 }} />
                );
              })}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
      <p className="px-4 pb-3 pt-1 text-[11px] text-muted">
        {evaluator === 'both' ? 'Solid lines: curve view. Dashed lines: model view (computed at every budget only for Spread evenly, Engine and Reallocate). '
          : `${EVALUATOR_LABEL[evaluator]}. `}
        The first minutes are worth the most; each extra minute prevents less.
      </p>
    </Card>
  );
}
