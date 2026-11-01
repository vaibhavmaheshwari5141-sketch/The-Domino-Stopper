import { Bar, BarChart, CartesianGrid, Cell, LabelList, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { HatchDefs } from '../../components/charts';
import { HATCH_ID, VIEW_COLOR, strategyColor } from '../../config/strategies';
import type { EngineKpiRow } from '../../lib/api';
import { axisProps, axisTick, chartColors, gridProps } from '../../lib/chart';
import { formatNumber } from '../../lib/format';
import { EVALUATOR_LABEL, type EvaluatorChoice } from '../../../shared/kpis';
import { ENGINE, HINDSIGHT, REALLOCATE, strategyDef, strategyOrder } from '../../../shared/simulator';
import { ChartTooltipBox, LegendItem } from '../overview/ChartTooltip';

interface Datum {
  name: string;
  id: string;
  label: string;
  curve: number | null;
  model: number | null;
}

/** One row per strategy with both views side by side. Rows of each view are picked by `evaluator`, never added up. */
function twoViewsData(rows: EngineKpiRow[], strategies?: string[]): Datum[] {
  const names = [...new Set(rows.map((r) => r.strategy))].filter((s) => !strategies || strategies.includes(s)).sort(strategyOrder);
  const pick = (name: string, evaluator: EngineKpiRow['evaluator']) =>
    rows.find((r) => r.strategy === name && r.evaluator === evaluator)?.prevented_per_100 ?? null;
  return names.map((name) => {
    const def = strategyDef(name);
    return { name, id: def.id, label: def.label, curve: pick(name, 'curve'), model: pick(name, 'response model') };
  });
}

/** Category label over one or two lines; the engine's in bold amber. */
function StrategyTick({ x = 0, y = 0, payload, highlight }: { x?: number; y?: number; payload?: { value: string }; highlight: string }) {
  const label = String(payload?.value ?? '');
  const cut = label.indexOf(' (') > 0 ? label.indexOf(' (') : label.indexOf(': ') > 0 ? label.indexOf(': ') + 1 : label.indexOf(' ');
  const lines = cut > 0 ? [label.slice(0, cut), label.slice(cut + 1).trim()] : [label];
  const hot = label === highlight;
  return (
    <text x={x} y={y + 10} textAnchor="middle" {...axisTick} fontWeight={hot ? 700 : 400} fill={hot ? chartColors.amber : axisTick.fill}>
      {lines.map((line, i) => <tspan key={i} x={x} dy={i === 0 ? 0 : 12}>{line}</tspan>)}
    </text>
  );
}

function ValueLabel({ x = 0, y = 0, width = 0, value }: { x?: number | string; y?: number | string; width?: number | string; value?: number | string | null }) {
  if (value === undefined || value === null || value === '') return null;
  return (
    <text x={Number(x) + Number(width) / 2} y={Number(y) - 4} textAnchor="middle" fontFamily="var(--font-mono)" fontSize={10} fill="var(--color-ink)">
      {formatNumber(Number(value), 1)}
    </text>
  );
}

interface Props {
  rows: EngineKpiRow[];
  evaluator: EvaluatorChoice;
  /** Strategies to show (stored names); all when absent. */
  strategies?: string[];
  /** Hide the value labels (small charts). */
  labels?: boolean;
}

/**
 * Delay prevented per 100 buffer minutes for each strategy: curve view (dark) and model view (amber) side by side, or
 * one view coloured by strategy. The Engine is highlighted; Hindsight is hatched, a ceiling only.
 */
export function TwoViewsBars({ rows, evaluator, strategies, labels = true }: Props) {
  const data = twoViewsData(rows, strategies);
  const engineLabel = strategyDef(ENGINE).label;
  const both = evaluator === 'both';
  const single = evaluator === 'curve' ? 'curve' : 'model';
  const fill = (d: Datum, view: 'curve' | 'model') =>
    d.name === HINDSIGHT ? `url(#${HATCH_ID})` : both ? VIEW_COLOR[view === 'curve' ? 'curve' : 'response model'] : strategyColor(d.id);

  if (!data.length) return <p className="flex h-full items-center justify-center text-[13px] text-muted">No strategy results for these settings.</p>;
  return (
    <div className="flex h-full min-h-0 flex-col">
      {both && (
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          <LegendItem color={VIEW_COLOR.curve} label={EVALUATOR_LABEL.curve} />
          <LegendItem color={VIEW_COLOR['response model']} label={EVALUATOR_LABEL['response model']} />
        </div>
      )}
      <div className="min-h-0 flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 16, right: 4, bottom: 0, left: -14 }} barGap={2} barCategoryGap="22%">
            <HatchDefs />
            <CartesianGrid {...gridProps} />
            {data.some((d) => d.name === ENGINE) && (
              <ReferenceArea x1={engineLabel} x2={engineLabel} fill="var(--color-amber-soft)" fillOpacity={0.6} ifOverflow="hidden" />
            )}
            <XAxis dataKey="label" {...axisProps} interval={0} height={32} tick={<StrategyTick highlight={engineLabel} />} />
            <YAxis {...axisProps} width={44} />
            <Tooltip cursor={{ fill: 'var(--color-bg)', fillOpacity: 0.5 }} content={({ active, payload }) => {
              const d = payload?.[0]?.payload as Datum | undefined;
              if (!active || !d) return null;
              const fmt = (v: number | null) => (v === null ? 'not computed' : formatNumber(v, 1));
              const rowsShown: [string, string][] = both || single === 'curve' ? [[EVALUATOR_LABEL.curve, fmt(d.curve)]] : [];
              if (both || single === 'model') rowsShown.push([EVALUATOR_LABEL['response model'], fmt(d.model)]);
              return (
                <ChartTooltipBox
                  title={<>{d.label}{d.name === REALLOCATE && <span className="block font-normal text-muted">per 100 minutes moved, none added</span>}
                    {d.name === HINDSIGHT && <span className="block font-normal text-muted">knows the real delays: a ceiling only</span>}</>}
                  rows={rowsShown}
                />
              );
            }} />
            {(both || single === 'curve') && (
              <Bar dataKey="curve" name={EVALUATOR_LABEL.curve} radius={[3, 3, 0, 0]} maxBarSize={both ? 24 : 48} isAnimationActive={false}>
                {data.map((d) => <Cell key={d.id} fill={fill(d, 'curve')} stroke={d.name === HINDSIGHT ? chartColors.amber : undefined} strokeDasharray={d.name === HINDSIGHT ? '4 3' : undefined} />)}
                {labels && <LabelList dataKey="curve" content={<ValueLabel />} />}
              </Bar>
            )}
            {(both || single === 'model') && (
              <Bar dataKey="model" name={EVALUATOR_LABEL['response model']} radius={[3, 3, 0, 0]} maxBarSize={both ? 24 : 48} isAnimationActive={false}>
                {data.map((d) => <Cell key={d.id} fill={fill(d, 'model')} stroke={d.name === HINDSIGHT ? chartColors.amber : undefined} strokeDasharray={d.name === HINDSIGHT ? '4 3' : undefined} />)}
                {labels && <LabelList dataKey="model" content={<ValueLabel />} />}
              </Bar>
            )}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
