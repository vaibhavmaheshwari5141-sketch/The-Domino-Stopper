import { CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card } from '../../components/Card';
import type { AircraftDay } from '../../lib/api';
import { axisProps, chartColors, gridProps } from '../../lib/chart';
import { formatNumber } from '../../lib/format';
import { flightNo } from '../../../shared/planner';
import { ChartTooltipBox, LegendItem } from '../overview/ChartTooltip';
import { formatDelay } from './delay';

interface Point {
  label: string;
  route: string;
  actualDep: number | null;      // actual departure delay of the flight
  predInbound: number | null;    // predicted inbound delay at the stop this flight lands at
  buffer: number;                // extra minutes the engine adds at that stop
  stop: string | null;
}

interface DotProps {
  cx?: number;
  cy?: number;
  index?: number;
  payload?: Point;
}

/** Amber diamond where the engine adds buffer, a small dot elsewhere. */
function PredDot({ cx, cy, index, payload }: DotProps) {
  if (cx === undefined || cy === undefined || payload?.predInbound == null) return <g key={index} />;
  if (payload.buffer > 0) {
    return <path key={index} d={`M${cx},${cy - 6} L${cx + 6},${cy} L${cx},${cy + 6} L${cx - 6},${cy} Z`} fill={chartColors.amber} stroke={chartColors.surface} strokeWidth={1.5} />;
  }
  return <circle key={index} cx={cx} cy={cy} r={2.5} fill={chartColors.amber} />;
}

function Tip({ active, payload }: { active?: boolean; payload?: { payload: Point }[] }) {
  const p = payload?.[0]?.payload;
  if (!active || !p) return null;
  return (
    <ChartTooltipBox
      title={`${p.label} · ${p.route}`}
      rows={[
        ['Actual departure delay', formatDelay(p.actualDep)],
        [`Predicted inbound delay${p.stop ? ` at ${p.stop}` : ''}`, p.predInbound === null ? '–' : `${formatNumber(p.predInbound, 1)} min`],
        ['Buffer added there', p.buffer > 0 ? `+${p.buffer} min` : '–'],
      ]}
    />
  );
}

export function DelayChart({ day }: { day: AircraftDay }) {
  const data: Point[] = day.flights.map((f) => {
    const stop = f.arrives_turn !== null ? day.turnarounds[f.arrives_turn] : null;
    return {
      label: flightNo(f.flight_no),
      route: `${f.from ?? '–'} → ${f.to ?? '–'}`,
      actualDep: f.dep_delay_min,
      predInbound: stop?.pred_inbound_delay_min ?? null,
      buffer: stop?.recommended_extra_min ?? 0,
      stop: stop?.airport ?? null,
    };
  });

  return (
    <Card title="Delay through the day">
      <div className="flex flex-wrap gap-x-3 gap-y-1 px-4 pb-1">
        <LegendItem color={chartColors.tarmac} label="Actual departure delay" />
        <LegendItem color={chartColors.amber} label="Predicted inbound delay" />
        <span className="inline-flex items-center gap-1 text-[11px] text-muted">
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M5,0 L10,5 L5,10 L0,5 Z" fill="var(--color-amber)" /></svg>
          buffer added
        </span>
      </div>
      <div className="h-56 px-2">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 20, bottom: 0, left: -8 }}>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="label" {...axisProps} interval={0} tickFormatter={(v: string) => v.replace(/^AA/, '')} />
            <YAxis {...axisProps} width={44} tickFormatter={(v: number) => `${v}`} />
            <ReferenceLine y={15} stroke={chartColors.line} strokeDasharray="4 3"
              label={{ value: '15 min late', position: 'insideTopLeft', fontSize: 10, fill: chartColors.muted, fontFamily: 'var(--font-mono)' }} />
            <ReferenceLine y={0} stroke={chartColors.line} />
            <Tooltip content={<Tip />} cursor={{ stroke: chartColors.line }} />
            <Line type="linear" dataKey="actualDep" stroke={chartColors.tarmac} strokeWidth={2} dot={{ r: 3, fill: chartColors.tarmac }} connectNulls={false} isAnimationActive={false} />
            <Line type="linear" dataKey="predInbound" stroke={chartColors.amber} strokeWidth={2} strokeDasharray="5 4" dot={PredDot} activeDot={false} connectNulls isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <p className="px-4 pb-3 pt-1 text-[11px] text-muted">
        Minutes, by flight number in order. Predicted inbound delay is shown at the flight that lands at the stop. Actual delays are from the 2026 replay.
      </p>
    </Card>
  );
}
