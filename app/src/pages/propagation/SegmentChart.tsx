import { Bar, BarChart, CartesianGrid, ErrorBar, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card } from '../../components/Card';
import { ErrorState } from '../../components/ErrorState';
import { SegmentedControl } from '../../components/SegmentedControl';
import { axisProps, chartColors, gridProps } from '../../lib/chart';
import { formatNumber } from '../../lib/format';
import { usePropagationSegments } from '../../lib/queries';
import { ChartTooltipBox, LegendItem } from '../overview/ChartTooltip';
import { SEGMENT_CHOICES, type SegmentChoice } from './usePropagationState';

const COLORS = [chartColors.tarmac, chartColors.amber, chartColors.teal, chartColors.muted];

type Row = { band: string } & Record<string, unknown>;

/** Pass-through for Short / Medium / Long turnarounds, one bar per segment, with 95% whiskers. */
export function SegmentChart({ seg, onSeg }: { seg: SegmentChoice; onSeg: (s: SegmentChoice) => void }) {
  const { data, isError, error, refetch, isFetching } = usePropagationSegments(seg);
  const segments = data?.segments ?? [];
  // One row per band; segment i in keys s{i} (value), e{i} (whisker) and n{i} / lo{i} / hi{i} (tooltip)
  const rows: Row[] = (data?.bands ?? []).map((band) => {
    const row: Row = { band };
    segments.forEach((s, i) => {
      const r = data!.rows.find((x) => x.segment === s && x.sg_band === band);
      if (!r || r.pass_through === null) return;
      Object.assign(row, {
        [`s${i}`]: r.pass_through,
        [`e${i}`]: [r.ci95_low === null ? 0 : r.pass_through - r.ci95_low, r.ci95_high === null ? 0 : r.ci95_high - r.pass_through],
        [`n${i}`]: r.turnarounds, [`lo${i}`]: r.ci95_low, [`hi${i}`]: r.ci95_high,
      });
    });
    return row;
  });

  return (
    <Card title="Does the curve hold everywhere?" aside={
      <SegmentedControl label="Split by" value={seg} onChange={onSeg} options={SEGMENT_CHOICES.map((s) => ({ value: s, label: s }))} />
    }>
      <div className="px-4 pb-4">
        <p className="min-h-[40px] text-[13px] text-ink">{data ? data.caption : <span className="skeleton inline-block h-4 w-3/4" />}</p>
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
          {segments.map((s, i) => <LegendItem key={s} color={COLORS[i % COLORS.length]} label={s} />)}
        </div>
        <div className="mt-2 h-64">
          {isError && !data ? <ErrorState error={error} onRetry={() => void refetch()} retrying={isFetching} /> : !data ? <span className="skeleton block h-full" /> : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: -8 }} barCategoryGap="22%">
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="band" {...axisProps} interval={0} />
                <YAxis {...axisProps} width={44} domain={[0, 1.1]} ticks={[0, 0.25, 0.5, 0.75, 1]} tickFormatter={(v: number) => formatNumber(v, 2)} />
                <ReferenceLine y={1} stroke={chartColors.muted} strokeDasharray="5 4" />
                <Tooltip cursor={{ fill: 'var(--color-bg)' }} content={({ active, payload }) => {
                  const r = payload?.[0]?.payload as Row | undefined;
                  return active && r ? (
                    <ChartTooltipBox title={`${r.band} min`} rows={segments.flatMap((s, i): [string, string][] => (r[`s${i}`] === undefined ? [] : [[
                      s,
                      `${formatNumber(r[`s${i}`] as number, 2)} (${formatNumber(r[`lo${i}`] as number | null, 2)}–${formatNumber(r[`hi${i}`] as number | null, 2)}) · ${formatNumber(r[`n${i}`] as number)} turns`,
                    ]]))} />
                  ) : null;
                }} />
                {segments.map((s, i) => (
                  <Bar key={s} dataKey={`s${i}`} name={s} fill={COLORS[i % COLORS.length]} radius={[2, 2, 0, 0]} maxBarSize={40} isAnimationActive={false}>
                    <ErrorBar dataKey={`e${i}`} width={4} stroke="var(--color-ink)" strokeOpacity={0.55} direction="y" />
                  </Bar>
                ))}
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
        <p className="mt-1 text-[11px] text-muted">All periods, Jan 2025 to Aug 2026. Whiskers show the 95% range.</p>
      </div>
    </Card>
  );
}
