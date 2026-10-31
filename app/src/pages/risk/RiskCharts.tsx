import { Bar, BarChart, CartesianGrid, LabelList, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card } from '../../components/Card';
import { WrappedTick } from '../../components/charts';
import { ErrorState } from '../../components/ErrorState';
import { axisProps, chartColors, gridProps } from '../../lib/chart';
import { formatMinutes, formatMonth, formatMonthShort, formatNumber, formatPercent } from '../../lib/format';
import { useRiskByGroundTime, useRiskTrend } from '../../lib/queries';
import { ChartTooltipBox, LegendItem } from '../overview/ChartTooltip';

const scopeText = (airport: string | null) => (airport ? `${airport}, Jan–Aug 2026` : 'All airports, Jan–Aug 2026');

/** Average late chance by planned ground-time band. */
export function GroundTimeChart({ airport }: { airport: string | null }) {
  const { data, isError, error, refetch, isFetching } = useRiskByGroundTime(airport);
  return (
    <Card title="Risk by planned ground time">
      <div className="px-4 pb-4">
        <p className="text-[12px] text-muted">Average late chance by planned ground time · {scopeText(airport)}</p>
        <div className="mt-2 h-60">
          {isError && !data ? <ErrorState error={error} onRetry={() => void refetch()} retrying={isFetching} /> : !data ? <span className="skeleton block h-full" /> : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 18, right: 8, bottom: 0, left: -8 }} barCategoryGap="22%">
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="band" {...axisProps} interval={0} height={32} tick={<WrappedTick />} />
                <YAxis {...axisProps} width={44} tickFormatter={(v: number) => formatPercent(v, 0)} />
                <Tooltip cursor={{ fill: 'var(--color-bg)' }} content={({ active, payload }) => {
                  const r = payload?.[0]?.payload as (typeof data)[number] | undefined;
                  return active && r ? (
                    <ChartTooltipBox title={`Planned ground ${r.band}`} rows={[
                      ['Late chance (predicted)', formatPercent(r.avg_late_chance)],
                      ['Late share (actual)', formatPercent(r.actual_late_share)],
                      ['Predicted inbound delay', formatMinutes(r.avg_pred_inbound_delay_min, 1)],
                      ['Turnarounds', formatNumber(r.turnarounds)],
                    ]} />
                  ) : null;
                }} />
                <Bar dataKey="avg_late_chance" fill={chartColors.teal} radius={[3, 3, 0, 0]} maxBarSize={48} isAnimationActive={false}>
                  <LabelList dataKey="avg_late_chance" position="top" formatter={(v: unknown) => formatPercent(v as number)}
                    style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fill: 'var(--color-ink)' }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
        <p className="mt-1 text-[11px] text-muted">Short stops have no room to recover, so a late arrival leads straight to a late departure.</p>
      </div>
    </Card>
  );
}

/** Predicted late chance against the actual late share, by month. */
export function ForecastTrend({ airport }: { airport: string | null }) {
  const { data, isError, error, refetch, isFetching } = useRiskTrend(airport);
  return (
    <Card title="Forecast vs reality by month">
      <div className="px-4 pb-4">
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          <LegendItem color={chartColors.amber} label="Predicted late chance" />
          <LegendItem color={chartColors.tarmac} label="Actual late share" />
          <span className="text-[12px] text-muted">· {scopeText(airport)}</span>
        </div>
        <div className="mt-2 h-60">
          {isError && !data ? <ErrorState error={error} onRetry={() => void refetch()} retrying={isFetching} /> : !data ? <span className="skeleton block h-full" /> : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 12, right: 16, bottom: 0, left: -8 }}>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="year_month" {...axisProps} tickFormatter={(v: string) => formatMonthShort(v)} />
                <YAxis {...axisProps} width={44} domain={[0, 'auto']} tickFormatter={(v: number) => formatPercent(v, 0)} />
                <Tooltip cursor={{ stroke: chartColors.line }} content={({ active, payload }) => {
                  const r = payload?.[0]?.payload as (typeof data)[number] | undefined;
                  return active && r ? (
                    <ChartTooltipBox title={formatMonth(r.year_month)} rows={[
                      ['Predicted late chance', formatPercent(r.avg_late_chance)],
                      ['Actual late share', formatPercent(r.actual_late_share)],
                      ['Turnarounds', formatNumber(r.turnarounds)],
                    ]} />
                  ) : null;
                }} />
                <Line type="monotone" dataKey="avg_late_chance" stroke={chartColors.amber} strokeWidth={2.5} dot={{ r: 3, fill: chartColors.amber }} isAnimationActive={false} />
                <Line type="monotone" dataKey="actual_late_share" stroke={chartColors.tarmac} strokeWidth={2} dot={{ r: 3, fill: chartColors.tarmac }} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
        <p className="mt-1 text-[11px] text-muted">When the lines sit together, the forecast is well calibrated.</p>
      </div>
    </Card>
  );
}
