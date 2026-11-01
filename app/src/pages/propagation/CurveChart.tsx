import {
  CartesianGrid, ComposedChart, ErrorBar, Line, LineChart, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { Card } from '../../components/Card';
import { ErrorState } from '../../components/ErrorState';
import { SegmentedControl } from '../../components/SegmentedControl';
import { axisProps, axisTick, chartColors, gridProps } from '../../lib/chart';
import { formatNumber } from '../../lib/format';
import { usePropagationCurve, useSegmentCurves } from '../../lib/queries';
import { bandIndexFor } from '../../../shared/propagation';
import { ChartTooltipBox, LegendItem } from '../overview/ChartTooltip';

interface Row {
  band: string;
  turnarounds: number;
  measured: number | null;
  low: number | null;
  high: number | null;
  err: [number, number];
  smoothed: number | null;
}

const zoneLabel = { fontSize: 11, fill: chartColors.muted, fontFamily: 'var(--font-sans)' } as const;

/** Whisker drawn from the measured value to each end of its 95% range. */
function MeasuredLegend() {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-muted">
      <svg width="12" height="12" aria-hidden="true"><line x1="6" y1="1" x2="6" y2="11" stroke={chartColors.muted} /><circle cx="6" cy="6" r="3" fill={chartColors.muted} /></svg>
      Measured, with 95% range
    </span>
  );
}

/** Every band label, slanted so long ones ("181-240", "over 240") never collide or get dropped. */
function BandTick({ x = 0, y = 0, payload }: { x?: number; y?: number; payload?: { value: string } }) {
  return (
    <text x={x} y={y + 4} textAnchor="end" transform={`rotate(-30 ${x} ${y + 4})`} {...axisTick}>
      {String(payload?.value ?? '').replace('-', '–')}
    </text>
  );
}

/** Line style of a v2 segment: airport type sets the colour, time of day the dash. */
function segmentStyle(segment: string): { stroke: string; dash?: string; width: number } {
  if (!segment.includes('|')) return { stroke: chartColors.tarmac, width: 3 };
  const stroke = segment.startsWith('Ten busiest') ? chartColors.amber : chartColors.teal;
  const dash = segment.includes('Afternoon') ? '7 4' : segment.includes('Evening') ? '2 3' : undefined;
  return { stroke, dash, width: 2 };
}

function SegmentLegendItem({ segment }: { segment: string }) {
  const s = segmentStyle(segment);
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-muted">
      <svg width="22" height="8" aria-hidden="true"><line x1="1" y1="4" x2="21" y2="4" stroke={s.stroke} strokeWidth={s.width} strokeDasharray={s.dash} /></svg>
      {segment.replace(' | ', ', ')}
    </span>
  );
}

/** Engine v2: one smoothed curve per segment (training period). */
function SegmentCurvesChart({ threshold }: { threshold: number | null }) {
  const { data, isError, error, refetch, isFetching } = useSegmentCurves();
  if (isError && !data) return <ErrorState error={error} onRetry={() => void refetch()} retrying={isFetching} />;
  if (!data) return <span className="skeleton block h-full" />;
  // One point per ground time with a key per segment
  const byGround = new Map<number, Record<string, number>>();
  data.segments.forEach((s, i) => s.points.forEach((p) => {
    const row = byGround.get(p.ground_min) ?? { ground: p.ground_min };
    row[`s${i}`] = p.pass_through;
    byGround.set(p.ground_min, row);
  }));
  const rows = [...byGround.values()].sort((a, b) => a.ground - b.ground);
  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap gap-x-4 gap-y-1">{data.segments.map((s) => <SegmentLegendItem key={s.segment} segment={s.segment} />)}</div>
      <div className="min-h-0 flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 20, right: 12, bottom: 22, left: -4 }}>
            <CartesianGrid {...gridProps} />
            <XAxis type="number" dataKey="ground" domain={[0, 300]} ticks={[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300]} {...axisProps}
              label={{ value: 'Planned ground time (min)', position: 'insideBottom', offset: -14, ...axisTick }} />
            <YAxis {...axisProps} width={44} domain={[0, 1.1]} ticks={[0, 0.25, 0.5, 0.75, 1]} tickFormatter={(v: number) => formatNumber(v, 2)} />
            <ReferenceLine y={1} stroke={chartColors.muted} strokeDasharray="5 4" label={{ value: 'all delay passed on', position: 'insideTopRight', ...zoneLabel }} />
            {threshold !== null && (
              <ReferenceLine x={threshold} stroke="var(--color-ink)" strokeWidth={1.5} strokeDasharray="3 3"
                label={{ value: `~${Math.round(threshold)} min`, position: 'top', fill: 'var(--color-ink)', fontSize: 12, fontWeight: 600, fontFamily: 'var(--font-mono)' }} />
            )}
            <Tooltip cursor={{ stroke: chartColors.line }} content={({ active, payload, label }) => (active && payload?.length ? (
              <ChartTooltipBox title={`${label} min of ground time`}
                rows={data.segments.map((s, i) => [s.segment.replace(' | ', ', '), formatNumber((payload[0].payload as Record<string, number>)[`s${i}`], 2)])} />
            ) : null)} />
            {data.segments.map((s, i) => {
              const st = segmentStyle(s.segment);
              return <Line key={s.segment} dataKey={`s${i}`} name={s.segment} type="linear" stroke={st.stroke} strokeWidth={st.width} strokeDasharray={st.dash} dot={false} isAnimationActive={false} />;
            })}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/** Pass-through by planned ground-time band: measured dots with 95% whiskers, the smoothed curve, and the threshold. */
export function CurveChart({ curves, onCurves }: { curves: 'v1' | 'v2'; onCurves: (c: 'v1' | 'v2') => void }) {
  const { data, isError, error, refetch, isFetching } = usePropagationCurve();
  const rows: Row[] = (data?.bands ?? []).map((b) => ({
    band: b.sg_band,
    turnarounds: b.turnarounds,
    measured: b.pass_through,
    low: b.ci95_low,
    high: b.ci95_high,
    err: [b.pass_through !== null && b.ci95_low !== null ? b.pass_through - b.ci95_low : 0, b.pass_through !== null && b.ci95_high !== null ? b.ci95_high - b.pass_through : 0],
    smoothed: b.pass_through_smoothed,
  }));
  const labels = rows.map((r) => r.band);
  const t = data?.threshold_min ?? null;
  const tIndex = t === null ? -1 : bandIndexFor(labels, t);
  const tBand = tIndex >= 0 ? labels[tIndex] : null;

  return (
    <Card
      title="The pass-through curve"
      aside={
        <SegmentedControl label="Curve" value={curves} onChange={onCurves}
          options={[{ value: 'v1', label: 'Single curve (v1)' }, { value: 'v2', label: 'Segment curves (v2)' }]} />
      }
    >
      <div className="px-4 pb-4">
        <p className="text-[13px] text-ink">
          Below about {t === null ? '63' : Math.round(t)} minutes of planned ground time almost all inbound delay is passed on; above it, extra minutes start to absorb delay.
          {curves === 'v2' && ' Engine v2 uses a separate curve for each airport type and time of day.'}
        </p>
        {curves === 'v1' && (
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
            <MeasuredLegend />
            <LegendItem color={chartColors.amber} label="Smoothed curve (used by engine v1)" />
          </div>
        )}
        <div className="mt-2 h-[380px]">
          {curves === 'v2' ? <SegmentCurvesChart threshold={t} /> : isError && !data ? <ErrorState error={error} onRetry={() => void refetch()} retrying={isFetching} /> : !data ? <span className="skeleton block h-full" /> : (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={rows} margin={{ top: 24, right: 12, bottom: 34, left: -4 }}>
                <CartesianGrid {...gridProps} />
                {tBand && (
                  <>
                    <ReferenceArea x1={labels[0]} x2={tBand} fill={chartColors.tarmac} fillOpacity={0.06} ifOverflow="hidden"
                      label={{ value: 'Extra minutes absorb almost nothing', position: 'insideBottom', offset: 10, ...zoneLabel }} />
                    <ReferenceArea x1={tBand} x2={labels[labels.length - 1]} fill={chartColors.teal} fillOpacity={0.07} ifOverflow="hidden"
                      label={{ value: 'Extra minutes start to absorb delay', position: 'insideBottom', offset: 10, ...zoneLabel }} />
                  </>
                )}
                <XAxis dataKey="band" {...axisProps} interval={0} height={44} tick={<BandTick />}
                  label={{ value: 'Planned ground time (min)', position: 'insideBottom', offset: -26, ...axisTick }} />
                <YAxis {...axisProps} width={44} domain={[0, 1.1]} ticks={[0, 0.25, 0.5, 0.75, 1]} tickFormatter={(v: number) => formatNumber(v, 2)} />
                <ReferenceLine y={1} stroke={chartColors.muted} strokeDasharray="5 4"
                  label={{ value: 'all delay passed on', position: 'insideTopRight', ...zoneLabel }} />
                {tBand && (
                  <ReferenceLine x={tBand} stroke="var(--color-ink)" strokeWidth={1.5} strokeDasharray="3 3"
                    label={{ value: `~${Math.round(t!)} min`, position: 'top', fill: 'var(--color-ink)', fontSize: 12, fontWeight: 600, fontFamily: 'var(--font-mono)' }} />
                )}
                <Tooltip cursor={{ fill: 'var(--color-bg)', fillOpacity: 0.6 }} content={({ active, payload }) => {
                  const r = payload?.[0]?.payload as Row | undefined;
                  return active && r ? (
                    <ChartTooltipBox title={`${r.band} min`} rows={[
                      ['Turnarounds', formatNumber(r.turnarounds)],
                      ['Measured pass-through', `${formatNumber(r.measured, 2)} (${formatNumber(r.low, 2)}–${formatNumber(r.high, 2)})`],
                      ['Smoothed', formatNumber(r.smoothed, 2)],
                    ]} />
                  ) : null;
                }} />
                <Line dataKey="measured" stroke="none" isAnimationActive={false} legendType="none"
                  dot={{ r: 3.5, fill: chartColors.muted, stroke: chartColors.surface, strokeWidth: 1 }} activeDot={{ r: 5, fill: chartColors.muted }}>
                  <ErrorBar dataKey="err" width={4} stroke={chartColors.muted} strokeOpacity={0.7} direction="y" />
                </Line>
                <Line dataKey="smoothed" type="monotone" stroke={chartColors.amber} strokeWidth={3} dot={false} isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>
        {curves === 'v2' ? (
          <p className="mt-2 text-[11px] leading-snug text-muted">
            Smoothed curves learned on Jan to Sep 2025, one per segment: the ten busiest or other airports, by time of day (morning, afternoon,
            evening), and one for all turnarounds. The curves show association, not proof of cause: a storm can delay both flights.
          </p>
        ) : <p className="mt-2 text-[11px] leading-snug text-muted">
          Learned on Jan to Sep 2025. The 'up to 30 min' band is small and unusual
          {rows[0]?.band === 'up to 30' && <> ({formatNumber(rows[0].turnarounds)} turnarounds, measured {formatNumber(rows[0].measured, 2)})</>}, so the
          smoothed curve treats it like the next band.
          The curve shows association, not proof of cause: a storm can delay both flights.
        </p>}
      </div>
    </Card>
  );
}
