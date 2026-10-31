import clsx from 'clsx';
import { CalendarClock } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card } from '../../components/Card';
import { ErrorState } from '../../components/ErrorState';
import { SegmentedControl } from '../../components/SegmentedControl';
import { axisProps, chartColors, gridProps } from '../../lib/chart';
import { formatCompact, formatMonth, formatMonthShort, formatNumber, formatPercent } from '../../lib/format';
import { useAirportBuffer } from '../../lib/queries';
import { PLANNER_BUDGETS, type PlannerBudget } from '../../../shared/planner';
import { ChartTooltipBox, LegendItem } from '../overview/ChartTooltip';

function Stat({ label, value, backtest }: { label: string; value: ReactNode; backtest?: boolean }) {
  return (
    <div className={clsx('rounded-control px-2.5 py-1.5', backtest ? 'bg-bg' : 'border')}>
      <dt className="text-[11px] text-muted">{label}</dt>
      <dd className="num text-[15px] font-semibold text-ink">{value}</dd>
    </div>
  );
}

/** Buffer the engine plans at this airport in the test months, at a chosen budget. */
export function BufferCard({ code, budget, onBudget }: { code: string; budget: PlannerBudget; onBudget: (b: PlannerBudget) => void }) {
  const { data, isError, error, refetch, isFetching } = useAirportBuffer(code, budget);
  const t = data?.totals;
  return (
    <Card title="Buffer planned here" aside={
      <SegmentedControl label="Buffer budget, minutes per turnaround" value={budget} onChange={onBudget}
        options={PLANNER_BUDGETS.map((b) => ({ value: b, label: <span className="num">{b} min</span> }))} />
    }>
      <div className="px-4 pb-4">
        {isError && !data ? <ErrorState error={error} onRetry={() => void refetch()} retrying={isFetching} /> : !data || !t ? <span className="skeleton block h-72" /> : (
          <>
            <dl className="grid grid-cols-2 gap-2 md:grid-cols-5">
              <Stat label="Buffer minutes" value={formatNumber(t.buffer_min)} />
              <Stat label="Turnarounds with buffer" value={<>{formatPercent(t.share_with_buffer)} <span className="text-[11px] font-normal text-muted">of {formatCompact(t.turnarounds)}</span></>} />
              <Stat label="Expected absorbed" value={<>{formatNumber(t.expected_absorbed_min)} <span className="text-[11px] font-normal text-muted">min</span></>} />
              <Stat backtest label="Backtest: absorbed" value={<>{formatNumber(t.realised_absorbed_min)} <span className="text-[11px] font-normal text-muted">min</span></>} />
              <Stat backtest label="Backtest: late dep. avoided" value={formatNumber(t.late_departures_avoided)} />
            </dl>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
              <LegendItem color={chartColors.amber} label="Buffer minutes" />
              <LegendItem color={chartColors.teal} label="Expected absorbed (right axis)" />
              <LegendItem color={chartColors.tarmac} label="Backtest absorbed (right axis)" />
            </div>
            <div className="mt-2 h-56">
              {data.months.length === 0 ? <p className="flex h-full items-center justify-center text-[13px] text-muted">No buffer planned here in the test months.</p> : (
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={data.months} margin={{ top: 8, right: 4, bottom: 0, left: -4 }}>
                    <CartesianGrid {...gridProps} />
                    <XAxis dataKey="year_month" {...axisProps} tickFormatter={(v: string) => formatMonthShort(v)} />
                    <YAxis yAxisId="left" {...axisProps} width={48} tickFormatter={(v: number) => formatCompact(v)} />
                    <YAxis yAxisId="right" orientation="right" {...axisProps} width={44} tickFormatter={(v: number) => formatCompact(v)} />
                    <Tooltip cursor={{ fill: 'var(--color-bg)' }} content={({ active, payload }) => {
                      const m = payload?.[0]?.payload as (typeof data.months)[number] | undefined;
                      return active && m ? (
                        <ChartTooltipBox title={formatMonth(m.year_month)} rows={[
                          ['Buffer minutes', formatNumber(m.buffer_min)],
                          ['Turnarounds with buffer', `${formatNumber(m.turnarounds_with_buffer)} (${formatPercent(m.share_with_buffer)})`],
                          ['Expected absorbed', `${formatNumber(m.expected_absorbed_min)} min`],
                          ['Backtest absorbed', `${formatNumber(m.realised_absorbed_min)} min`],
                          ['Late departures avoided', formatNumber(m.late_departures_avoided)],
                        ]} />
                      ) : null;
                    }} />
                    <Bar yAxisId="left" dataKey="buffer_min" fill={chartColors.amber} radius={[2, 2, 0, 0]} maxBarSize={44} isAnimationActive={false} />
                    <Line yAxisId="right" type="monotone" dataKey="expected_absorbed_min" stroke={chartColors.teal} strokeWidth={2} dot={{ r: 2.5, fill: chartColors.teal }} isAnimationActive={false} />
                    <Line yAxisId="right" type="monotone" dataKey="realised_absorbed_min" stroke={chartColors.tarmac} strokeWidth={2} strokeDasharray="5 4" dot={{ r: 2.5, fill: chartColors.tarmac }} isAnimationActive={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              )}
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-[11px] text-muted">Test months (Jan to Aug 2026) at {budget} min per turnaround. Backtest figures use the real 2026 delays.</p>
              <Link to={`/buffer-planner?${new URLSearchParams({ date: '2026-03-15', airport: code, ...(budget !== 5 ? { budget: String(budget) } : {}) })}`}
                className="focus-ring inline-flex h-8 items-center gap-1.5 rounded-control border bg-surface px-3 text-[13px] font-medium text-ink hover:bg-bg">
                <CalendarClock size={15} className="text-muted" aria-hidden="true" /> Open in Buffer Planner
              </Link>
            </div>
          </>
        )}
      </div>
    </Card>
  );
}
