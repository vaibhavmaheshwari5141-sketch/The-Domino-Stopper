import { Bar, CartesianGrid, ComposedChart, LabelList, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card } from '../../components/Card';
import { ErrorState } from '../../components/ErrorState';
import { SegmentedControl } from '../../components/SegmentedControl';
import type { DelayByLeg, LegPeriod } from '../../lib/api';
import { axisProps, axisTick, chartColors, gridProps } from '../../lib/chart';
import { formatMinutes, formatNumber, formatPercent } from '../../lib/format';
import { usePropagationByLeg } from '../../lib/queries';
import { ChartTooltipBox, LegendItem } from '../overview/ChartTooltip';

const PERIODS: { value: LegPeriod; label: string }[] = [
  { value: 'all', label: 'All' }, { value: 'train', label: 'Train' }, { value: 'validate', label: 'Validate' }, { value: 'test', label: 'Test' },
];

/** Average departure delay by flight of the aircraft's day, with the 15+ min late rate as a line. */
export function LegChart({ period, onPeriod }: { period: LegPeriod; onPeriod: (p: LegPeriod) => void }) {
  const { data, isError, error, refetch, isFetching } = usePropagationByLeg(period);
  return (
    <Card title="Delay snowballs through the day" aside={<SegmentedControl label="Period" value={period} onChange={onPeriod} options={PERIODS} />}>
      <div className="px-4 pb-4">
        <p className="min-h-[40px] text-[13px] text-ink">{data ? data.caption : <span className="skeleton inline-block h-4 w-3/4" />}</p>
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
          <LegendItem color={chartColors.tarmac} label="Average departure delay (min)" />
          <LegendItem color={chartColors.amber} label="Late 15+ min (right axis)" />
        </div>
        <div className="mt-2 h-64">
          {isError && !data ? <ErrorState error={error} onRetry={() => void refetch()} retrying={isFetching} /> : !data ? <span className="skeleton block h-full" /> : (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data.legs} margin={{ top: 18, right: 4, bottom: 14, left: -8 }}>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="leg_label" {...axisProps}
                  label={{ value: 'Flight of the aircraft’s day', position: 'insideBottom', offset: -10, ...axisTick }} />
                <YAxis yAxisId="min" {...axisProps} width={40} />
                <YAxis yAxisId="rate" orientation="right" {...axisProps} width={44} domain={[0, 'auto']} tickFormatter={(v: number) => formatPercent(v, 0)} />
                <Tooltip cursor={{ fill: 'var(--color-bg)' }} content={({ active, payload }) => {
                  const l = payload?.[0]?.payload as DelayByLeg | undefined;
                  return active && l ? (
                    <ChartTooltipBox title={`Flight ${l.leg_label} of the day`} rows={[
                      ['Average departure delay', formatMinutes(l.avg_dep_delay_min, 1)],
                      ['Median departure delay', formatMinutes(l.median_dep_delay_min)],
                      ['Late 15+ min', formatPercent(l.dep_late15_rate)],
                      ['Flights', formatNumber(l.flights)],
                    ]} />
                  ) : null;
                }} />
                <Bar yAxisId="min" dataKey="avg_dep_delay_min" fill={chartColors.tarmac} radius={[2, 2, 0, 0]} maxBarSize={56} isAnimationActive={false}>
                  {/* Inside the bar, so the late-rate dots never sit on a label */}
                  <LabelList dataKey="avg_dep_delay_min" position="insideTop" offset={6} formatter={(v: unknown) => formatNumber(v as number, 1)}
                    style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600, fill: 'var(--color-surface)' }} />
                </Bar>
                <Line yAxisId="rate" dataKey="dep_late15_rate" stroke={chartColors.amber} strokeWidth={2} dot={{ r: 3, fill: chartColors.amber }} isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>
        <p className="mt-1 text-[11px] text-muted">Departures by their place in the aircraft’s day; 6+ groups the sixth flight and later.</p>
      </div>
    </Card>
  );
}
