import { CartesianGrid, ComposedChart, ErrorBar, Line, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card } from '../../components/Card';
import { ErrorState } from '../../components/ErrorState';
import { axisProps, axisTick, chartColors, gridProps } from '../../lib/chart';
import { formatNumber } from '../../lib/format';
import { usePropagationCurve } from '../../lib/queries';
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

/** Pass-through by planned ground-time band: measured dots with 95% whiskers, the smoothed curve, and the threshold. */
export function CurveChart() {
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
    <Card title="The pass-through curve">
      <div className="px-4 pb-4">
        <p className="text-[13px] text-ink">
          Below about {t === null ? '63' : Math.round(t)} minutes of planned ground time almost all inbound delay is passed on; above it, extra minutes start to absorb delay.
        </p>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
          <MeasuredLegend />
          <LegendItem color={chartColors.amber} label="Smoothed curve (used by the engine)" />
        </div>
        <div className="mt-2 h-[360px]">
          {isError && !data ? <ErrorState error={error} onRetry={() => void refetch()} retrying={isFetching} /> : !data ? <span className="skeleton block h-full" /> : (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={rows} margin={{ top: 24, right: 12, bottom: 22, left: -4 }}>
                <CartesianGrid {...gridProps} />
                {tBand && (
                  <>
                    <ReferenceArea x1={labels[0]} x2={tBand} fill={chartColors.tarmac} fillOpacity={0.06} ifOverflow="hidden"
                      label={{ value: 'Extra minutes absorb almost nothing', position: 'insideBottom', offset: 10, ...zoneLabel }} />
                    <ReferenceArea x1={tBand} x2={labels[labels.length - 1]} fill={chartColors.teal} fillOpacity={0.07} ifOverflow="hidden"
                      label={{ value: 'Extra minutes start to absorb delay', position: 'insideBottom', offset: 10, ...zoneLabel }} />
                  </>
                )}
                <XAxis dataKey="band" {...axisProps} interval="preserveStartEnd" minTickGap={6}
                  label={{ value: 'Planned ground time (min)', position: 'insideBottom', offset: -14, ...axisTick }} />
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
        <p className="mt-2 text-[11px] leading-snug text-muted">
          Learned on Jan to Sep 2025. The 'up to 30 min' band is small and unusual
          {rows[0]?.band === 'up to 30' && <> ({formatNumber(rows[0].turnarounds)} turnarounds, measured {formatNumber(rows[0].measured, 2)})</>}, so the
          smoothed curve treats it like the next band.
          The curve shows association, not proof of cause: a storm can delay both flights.
        </p>
      </div>
    </Card>
  );
}
