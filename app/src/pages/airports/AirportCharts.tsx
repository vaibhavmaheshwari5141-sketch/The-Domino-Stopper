import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card } from '../../components/Card';
import { ErrorState } from '../../components/ErrorState';
import { SegmentedControl } from '../../components/SegmentedControl';
import { axisProps, chartColors, gridProps } from '../../lib/chart';
import { formatCompact, formatMinutes, formatMonth, formatMonthShort, formatNumber, formatPercent } from '../../lib/format';
import { useAirportHourly, useAirportMonthly } from '../../lib/queries';
import { ChartTooltipBox, LegendItem } from '../overview/ChartTooltip';

/** Departure and arrival late rate (or average delay) by month, with departures as light bars on a second axis. */
export function MonthChart({ code, metric, onMetric }: { code: string; metric: 'rate' | 'minutes'; onMetric: (m: 'rate' | 'minutes') => void }) {
  const { data, isError, error, refetch, isFetching } = useAirportMonthly(code);
  const rate = metric === 'rate';
  const fmt = (v: number | null) => (rate ? formatPercent(v) : formatMinutes(v, 1));
  return (
    <Card title="Month by month" aside={
      <SegmentedControl label="Measure" value={metric} onChange={onMetric} options={[{ value: 'rate', label: 'Late rate' }, { value: 'minutes', label: 'Average delay' }]} />
    }>
      <div className="px-4 pb-4">
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          <LegendItem color={chartColors.tarmac} label={rate ? 'Departures late 15+ min' : 'Average departure delay'} />
          <LegendItem color={chartColors.teal} label={rate ? 'Arrivals late 15+ min' : 'Average arrival delay'} />
          <LegendItem color={chartColors.line} label="Departures (right axis)" />
        </div>
        <div className="mt-2 h-64">
          {isError && !data ? <ErrorState error={error} onRetry={() => void refetch()} retrying={isFetching} /> : !data ? <span className="skeleton block h-full" /> : (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: -8 }}>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="year_month" {...axisProps} tickFormatter={(v: string) => formatMonthShort(v)} minTickGap={12} />
                <YAxis yAxisId="left" {...axisProps} width={44} tickFormatter={(v: number) => (rate ? formatPercent(v, 0) : `${v}`)} />
                <YAxis yAxisId="right" orientation="right" {...axisProps} width={44} tickFormatter={(v: number) => formatCompact(v)} />
                <Tooltip cursor={{ fill: 'var(--color-bg)' }} content={({ active, payload }) => {
                  const m = payload?.[0]?.payload as (typeof data)[number] | undefined;
                  return active && m ? (
                    <ChartTooltipBox title={formatMonth(m.year_month)} rows={[
                      [rate ? 'Departures late' : 'Avg departure delay', fmt(rate ? m.dep_late15_rate : m.avg_dep_delay_min)],
                      [rate ? 'Arrivals late' : 'Avg arrival delay', fmt(rate ? m.arr_late15_rate : m.avg_arr_delay_min)],
                      ['Departures', formatNumber(m.scheduled_departures)],
                    ]} />
                  ) : null;
                }} />
                <Bar yAxisId="right" dataKey="scheduled_departures" fill={chartColors.line} fillOpacity={0.6} radius={[2, 2, 0, 0]} isAnimationActive={false} />
                <Line yAxisId="left" type="monotone" dataKey={rate ? 'dep_late15_rate' : 'avg_dep_delay_min'} stroke={chartColors.tarmac} strokeWidth={2} dot={false} isAnimationActive={false} />
                <Line yAxisId="left" type="monotone" dataKey={rate ? 'arr_late15_rate' : 'avg_arr_delay_min'} stroke={chartColors.teal} strokeWidth={2} dot={false} isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>
        <p className="mt-1 text-[11px] text-muted">Jan 2025 to Aug 2026.</p>
      </div>
    </Card>
  );
}

/** Departure late rate by hour for this airport, with the network average by hour as a dashed line. */
export function HourChart({ code }: { code: string }) {
  const { data, isError, error, refetch, isFetching } = useAirportHourly(code);
  return (
    <Card title="When in the day">
      <div className="px-4 pb-4">
        <p className="min-h-[20px] text-[13px] text-ink">{data ? data.caption : <span className="skeleton inline-block h-4 w-48" />}</p>
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
          <LegendItem color={chartColors.amber} label={`${code} departure late rate`} />
          <LegendItem color={chartColors.tarmac} label="Network average (dashed)" />
        </div>
        <div className="mt-2 h-64">
          {isError && !data ? <ErrorState error={error} onRetry={() => void refetch()} retrying={isFetching} /> : !data ? <span className="skeleton block h-full" /> : (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data.hours} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="dep_hour" {...axisProps} tickFormatter={(v: number) => String(v).padStart(2, '0')} interval={0} />
                <YAxis {...axisProps} width={44} tickFormatter={(v: number) => formatPercent(v, 0)} />
                <Tooltip cursor={{ fill: 'var(--color-bg)' }} content={({ active, payload }) => {
                  const h = payload?.[0]?.payload as (typeof data.hours)[number] | undefined;
                  return active && h ? (
                    <ChartTooltipBox title={`${String(h.dep_hour).padStart(2, '0')}:00 local`} rows={[
                      [`${code} late rate`, formatPercent(h.dep_late15_rate)],
                      ['Network late rate', formatPercent(h.network_dep_late15_rate)],
                      ['Departures', formatNumber(h.departures)],
                    ]} />
                  ) : null;
                }} />
                <Bar dataKey="dep_late15_rate" fill={chartColors.amber} radius={[2, 2, 0, 0]} isAnimationActive={false} />
                <Line type="monotone" dataKey="network_dep_late15_rate" stroke={chartColors.tarmac} strokeWidth={2} strokeDasharray="5 4" dot={false} isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>
        <p className="mt-1 text-[11px] text-muted">Local departure hour, all months. The peak only counts hours with at least 100 departures.</p>
      </div>
    </Card>
  );
}
