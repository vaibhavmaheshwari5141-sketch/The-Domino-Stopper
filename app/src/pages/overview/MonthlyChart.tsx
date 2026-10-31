import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { MonthlyNetwork } from '../../lib/api';
import { axisProps, chartColors, gridProps } from '../../lib/chart';
import { formatMinutes, formatMonth, formatMonthShort, formatNumber, formatPercent } from '../../lib/format';
import { ChartTooltipBox, LegendItem } from './ChartTooltip';

interface DotProps {
  cx?: number;
  cy?: number;
  index?: number;
  payload?: MonthlyNetwork;
}

/** Amber dot on months with disruption days; nothing on the others. */
function DisruptionDot({ cx, cy, index, payload }: DotProps) {
  if (!payload?.disruption_days || cx === undefined || cy === undefined) return <g key={index} />;
  return <circle key={index} cx={cx} cy={cy} r={4} fill={chartColors.amber} stroke={chartColors.surface} strokeWidth={1.5} />;
}

function MonthTip({ active, payload }: { active?: boolean; payload?: { payload: MonthlyNetwork }[] }) {
  const m = payload?.[0]?.payload;
  if (!active || !m) return null;
  return (
    <ChartTooltipBox
      title={formatMonth(m.year_month)}
      rows={[
        ['Late-arrival rate', formatPercent(m.late_arrival_rate)],
        ['Average arrival delay', formatMinutes(m.avg_arrival_delay_min, 1)],
        ['Disruption days', formatNumber(m.disruption_days)],
      ]}
    />
  );
}

export function MonthlyChart({ rows }: { rows: MonthlyNetwork[] }) {
  return (
    <div className="flex min-h-0 min-w-0 flex-col">
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
        <div>
          <h3 className="text-[13px] font-semibold text-ink">Late-arrival rate by month</h3>
          <p className="text-xs text-muted">Arrived 15+ min late, share of operated flights</p>
        </div>
        <div className="flex gap-3 pt-0.5">
          <LegendItem color={chartColors.tarmac} label="Late-arrival rate" />
          <LegendItem color={chartColors.amber} label="Month with disruption days" dot />
        </div>
      </div>
      <div className="mt-2 min-h-0 flex-1">
        {rows.length === 0 ? (
          <p className="flex h-full items-center justify-center text-sm text-muted">No monthly data.</p>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={rows} margin={{ top: 12, right: 20, bottom: 0, left: -12 }}>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="year_month" {...axisProps} tickFormatter={formatMonthShort} minTickGap={18} interval="preserveStartEnd" />
              <YAxis {...axisProps} width={44} tickFormatter={(v: number) => formatPercent(v, 0)} domain={[0, 'auto']} />
              <Tooltip cursor={{ stroke: chartColors.line }} content={<MonthTip />} />
              <Line
                type="monotone"
                dataKey="late_arrival_rate"
                stroke={chartColors.tarmac}
                strokeWidth={2}
                dot={DisruptionDot}
                activeDot={{ r: 4, fill: chartColors.tarmac }}
                connectNulls
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
