import { CartesianGrid, Line, LineChart, ReferenceArea, ReferenceDot, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { axisProps, chartColors, gridProps } from '../../lib/chart';
import { formatNumber, formatPercent } from '../../lib/format';
import { type CurvePoint, passThroughAt } from '../../../shared/planner';
import { ChartTooltipBox, LegendItem } from '../overview/ChartTooltip';

interface Props {
  curve: CurvePoint[];
  current: number | null;
  next: number | null;        // null or equal to current when no buffer is added
}

const X_MAX = 300;

/** Share of inbound delay passed on by planned ground time, with the current and the new ground time marked. */
export function PassThroughChart({ curve, current, next }: Props) {
  if (!curve.length || current === null) return <p className="text-[12px] text-muted">The pass-through curve is not available.</p>;
  const clamp = (g: number) => Math.min(X_MAX, Math.max(0, g));
  const cur = clamp(current);
  const nxt = next !== null && next > current ? clamp(next) : null;
  const yCur = passThroughAt(curve, current) ?? 0;
  const yNext = nxt !== null ? passThroughAt(curve, next) ?? 0 : null;

  return (
    <div>
      <div className="h-44">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={curve.filter((c) => c.ground_min <= X_MAX)} margin={{ top: 10, right: 12, bottom: 0, left: -4 }}>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="ground_min" type="number" domain={[0, X_MAX]} ticks={[0, 60, 120, 180, 240, 300]} {...axisProps}
              tickFormatter={(v: number) => `${v}`} />
            <YAxis domain={[0, 1]} ticks={[0, 0.25, 0.5, 0.75, 1]} width={44} {...axisProps} tickFormatter={(v: number) => formatPercent(v, 0)} />
            <Tooltip
              cursor={{ stroke: chartColors.line }}
              content={({ active, payload }) => {
                const p = payload?.[0]?.payload as CurvePoint | undefined;
                return active && p ? <ChartTooltipBox title={`${formatNumber(p.ground_min)} min ground time`} rows={[['Delay passed on', formatPercent(p.pass_through, 0)]]} /> : null;
              }}
            />
            {nxt !== null && yNext !== null && (
              <ReferenceArea x1={cur} x2={nxt} y1={yNext} y2={yCur} fill="var(--color-amber-soft)" fillOpacity={0.9} stroke="none" ifOverflow="extendDomain" />
            )}
            <Line type="monotone" dataKey="pass_through" stroke={chartColors.tarmac} strokeWidth={2} dot={false} isAnimationActive={false} />
            <ReferenceDot x={cur} y={yCur} r={5} fill={chartColors.tarmac} stroke={chartColors.surface} strokeWidth={2} ifOverflow="extendDomain" />
            {nxt !== null && yNext !== null && (
              <ReferenceDot x={nxt} y={yNext} r={5} fill={chartColors.amber} stroke={chartColors.surface} strokeWidth={2} ifOverflow="extendDomain" />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 pl-1">
        <LegendItem color={chartColors.tarmac} label={`Now: ${formatNumber(current)} min, ${formatPercent(yCur, 0)} passed on`} dot />
        {nxt !== null && yNext !== null && (
          <LegendItem color={chartColors.amber} label={`With buffer: ${formatNumber(next)} min, ${formatPercent(yNext, 0)} passed on`} dot />
        )}
      </div>
      <p className="mt-1 pl-1 text-[11px] text-muted">Planned ground time (min) on the x-axis.{current > X_MAX ? ' Ground times over 300 min are shown at the edge.' : ''}</p>
    </div>
  );
}
