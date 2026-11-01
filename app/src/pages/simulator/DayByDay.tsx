import { Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card } from '../../components/Card';
import { ErrorState } from '../../components/ErrorState';
import { SegmentedControl } from '../../components/SegmentedControl';
import { HATCH_ID, strategyColor } from '../../config/strategies';
import { HatchDefs } from '../../components/charts';
import { axisProps, chartColors, gridProps } from '../../lib/chart';
import { formatCompact, formatDate, formatMonth, formatMonthShort, formatNumber } from '../../lib/format';
import { useSimDaily } from '../../lib/queries';
import { EVEN, strategyDef, strategyOrder } from '../../../shared/simulator';
import { ChartTooltipBox, LegendItem } from '../overview/ChartTooltip';
import type { DailyView } from './useSimulatorState';

interface Props {
  budget: number;
  selected: string[];
  /** Always shown next to Spread evenly: the Engine of the selected mode. */
  focus: string;
  view: DailyView;
  onView: (view: DailyView) => void;
}

const DAY_MS = 86_400_000;
const ts = (iso: string) => Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);

/**
 * Daily (or monthly) delay prevented over the replay, curve view (gold_sim_daily), with disruption days shaded. The
 * Engine of the selected mode and Spread evenly always show.
 */
export function DayByDay({ budget, selected, focus, view, onView }: Props) {
  const names = [...new Set([focus, EVEN, ...selected])].sort(strategyOrder);
  const strategies = names.map((n) => strategyDef(n));
  const idOf = (name: string) => strategies.find((s) => s.name === name)?.id;
  const { data, isError, error, refetch, isFetching } = useSimDaily(budget, names);

  // Daily: one point per day with a key per strategy id. Monthly: one point per month.
  const byDay = new Map<string, Record<string, number | string | boolean | null>>();
  for (const d of data?.daily ?? []) {
    const id = idOf(d.strategy);
    if (!id) continue;
    const point = byDay.get(d.flight_date) ?? { t: ts(d.flight_date), date: d.flight_date, disruption: d.is_disruption_day };
    point[id] = d.absorbed_min;
    byDay.set(d.flight_date, point);
  }
  const daily = [...byDay.values()];
  const disruptionDays = daily.filter((d) => d.disruption).map((d) => d.t as number);
  // One tick on the first day of each month in the data
  const monthTicks = [...new Set(daily.map((d) => String(d.date).slice(0, 7)))].map((ym) => ts(`${ym}-01`));
  const byMonth = new Map<string, Record<string, number | string>>();
  for (const m of data?.monthly ?? []) {
    const id = idOf(m.strategy);
    if (!id) continue;
    const point = byMonth.get(m.year_month) ?? { month: m.year_month, disruption_days: m.disruption_days };
    point[id] = m.absorbed_min;
    byMonth.set(m.year_month, point);
  }
  const monthly = [...byMonth.values()];

  return (
    <Card
      title={<>Day by day <span className="font-normal text-muted">· curve view</span></>}
      aside={<SegmentedControl label="View" value={view} onChange={onView} options={[{ value: 'daily', label: 'Daily' }, { value: 'monthly', label: 'Monthly totals' }]} />}
    >
      <div className="px-4 pb-4">
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {strategies.map((s) => <LegendItem key={s.id} color={strategyColor(s.id)} label={s.id === 'hindsight' && view === 'daily' ? `${s.label}, dashed` : s.label} />)}
          {view === 'daily' && <LegendItem color="var(--color-amber-soft)" label="Disruption day" />}
        </div>
        <div className="mt-2 h-64">
          {isError && !data ? <ErrorState error={error} onRetry={() => void refetch()} retrying={isFetching} /> : !data ? <span className="skeleton block h-full" /> : (
            <ResponsiveContainer width="100%" height="100%">
              {view === 'daily' ? (
                <LineChart data={daily} margin={{ top: 8, right: 12, bottom: 0, left: -4 }}>
                  <CartesianGrid {...gridProps} />
                  {disruptionDays.map((t) => (
                    <ReferenceArea key={t} x1={t - DAY_MS / 2} x2={t + DAY_MS / 2} fill="var(--color-amber-soft)" fillOpacity={1} stroke="none" ifOverflow="hidden" />
                  ))}
                  <XAxis dataKey="t" type="number" scale="time" domain={['dataMin', 'dataMax']} {...axisProps}
                    ticks={monthTicks} tickFormatter={(v: number) => formatMonthShort(new Date(v))} />
                  <YAxis {...axisProps} width={48} tickFormatter={(v: number) => formatCompact(v)} />
                  <Tooltip cursor={{ stroke: chartColors.line }} content={({ active, payload }) => {
                    const p = payload?.[0]?.payload as Record<string, number | string | boolean | null> | undefined;
                    return active && p ? (
                      <ChartTooltipBox title={`${formatDate(String(p.date))}${p.disruption ? ' · disruption day' : ''}`}
                        rows={strategies.map((s) => [s.label, `${formatNumber(p[s.id] as number | null)} min`])} />
                    ) : null;
                  }} />
                  {strategies.map((s) => (
                    <Line key={s.id} type="linear" dataKey={s.id} stroke={strategyColor(s.id)} dot={false} isAnimationActive={false}
                      strokeWidth={s.id === 'engine' ? 2 : 1.25} strokeDasharray={s.id === 'hindsight' ? '4 3' : undefined} />
                  ))}
                </LineChart>
              ) : (
                <BarChart data={monthly} margin={{ top: 8, right: 12, bottom: 0, left: -4 }} barGap={1} barCategoryGap="22%">
                  <HatchDefs />
                  <CartesianGrid {...gridProps} />
                  <XAxis dataKey="month" {...axisProps} tickFormatter={(v: string) => formatMonthShort(v)} />
                  <YAxis {...axisProps} width={48} tickFormatter={(v: number) => formatCompact(v)} />
                  <Tooltip cursor={{ fill: 'var(--color-bg)' }} content={({ active, payload }) => {
                    const p = payload?.[0]?.payload as Record<string, number | string> | undefined;
                    return active && p ? (
                      <ChartTooltipBox title={`${formatMonth(String(p.month))} · ${p.disruption_days} disruption day${p.disruption_days === 1 ? '' : 's'}`}
                        rows={strategies.map((s) => [s.label, `${formatNumber(p[s.id] as number)} min`])} />
                    ) : null;
                  }} />
                  {strategies.map((s) => (
                    <Bar key={s.id} dataKey={s.id} fill={s.id === 'hindsight' ? `url(#${HATCH_ID})` : strategyColor(s.id)} radius={[2, 2, 0, 0]} isAnimationActive={false} />
                  ))}
                </BarChart>
              )}
            </ResponsiveContainer>
          )}
        </div>
        <p className="mt-1 text-[11px] text-muted">
          Delay prevented across each aircraft's day (minutes, curve view) {view === 'daily' ? 'each day' : 'each month'}, at {budget} min per
          turnaround. The Engine and Spread evenly are always shown.
        </p>
      </div>
    </Card>
  );
}
