import clsx from 'clsx';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { CartesianGrid, LabelList, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from 'recharts';
import { Card } from '../../components/Card';
import { ErrorState } from '../../components/ErrorState';
import type { AirportStats, ScatterAirport } from '../../lib/api';
import { axisProps, axisTick, chartColors, gridProps } from '../../lib/chart';
import { formatCompact, formatMinutes, formatNumber, formatPercent } from '../../lib/format';
import { useAirportList, useNetworkScatter } from '../../lib/queries';
import { ChartTooltipBox, LegendItem } from '../overview/ChartTooltip';
import type { RankColumn } from './useAirportState';

const PAGE = 25;
const GROUND_TICKS = [30, 45, 60, 90, 120, 180, 240, 360];

/** Network scatter: median ground time against average inbound delay, one bubble per airport. */
export function NetworkScatterCard({ onSelect }: { onSelect: (code: string) => void }) {
  const { data, isError, error, refetch, isFetching } = useNetworkScatter();
  const busy = data?.airports.filter((a) => a.is_top10) ?? [];
  const rest = data?.airports.filter((a) => !a.is_top10) ?? [];
  return (
    <Card title="Ground time against inbound delay">
      <div className="px-4 pb-4">
        <p className="min-h-[20px] text-[13px] text-ink">{data ? data.caption : <span className="skeleton inline-block h-4 w-3/4" />}</p>
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
          <LegendItem color={chartColors.amber} label="Ten busiest airports" dot />
          <LegendItem color={chartColors.tarmac} label="Other airports" dot />
          <span className="text-[11px] text-muted">Bubble size: turnarounds. Click a bubble to open the airport.</span>
        </div>
        <div className="mt-2 h-80">
          {isError && !data ? <ErrorState error={error} onRetry={() => void refetch()} retrying={isFetching} /> : !data ? <span className="skeleton block h-full" /> : (
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 12, right: 20, bottom: 18, left: 0 }}>
                <CartesianGrid {...gridProps} vertical />
                {/* Log scale: a few small airports sit at 200+ minutes and would squash the rest into one corner */}
                <XAxis type="number" dataKey="median_ground_min" name="Median ground time" {...axisProps} scale="log" domain={[GROUND_TICKS[0], GROUND_TICKS.at(-1)!]}
                  ticks={GROUND_TICKS} allowDataOverflow tickFormatter={(v: number) => `${Math.round(v)}`}
                  label={{ value: 'Median planned ground time (min, log scale)', position: 'insideBottom', offset: -10, ...axisTick }} />
                <YAxis type="number" dataKey="avg_inbound_delay_min" name="Average inbound delay" {...axisProps} width={48}
                  tickFormatter={(v: number) => `${Math.round(v)}`}
                  label={{ value: 'Avg inbound delay (min)', angle: -90, position: 'insideLeft', offset: 14, ...axisTick, style: { textAnchor: 'middle' } }} />
                <ZAxis type="number" dataKey="turnarounds" range={[30, 900]} />
                <Tooltip cursor={{ strokeDasharray: '3 3' }} content={({ active, payload }) => {
                  const a = payload?.[0]?.payload as ScatterAirport | undefined;
                  return active && a ? (
                    <ChartTooltipBox title={`${a.airport} · ${a.city ?? ''}`} rows={[
                      ['Median planned ground time', formatMinutes(a.median_ground_min)],
                      ['Average inbound delay', formatMinutes(a.avg_inbound_delay_min, 1)],
                      ['Turnarounds', formatNumber(a.turnarounds)],
                    ]} />
                  ) : null;
                }} />
                <Scatter data={rest} fill={chartColors.tarmac} fillOpacity={0.45} isAnimationActive={false}
                  onClick={(p: unknown) => onSelect((p as { payload?: ScatterAirport }).payload?.airport ?? '')} className="cursor-pointer" />
                <Scatter data={busy} fill={chartColors.amber} fillOpacity={0.85} isAnimationActive={false}
                  onClick={(p: unknown) => onSelect((p as { payload?: ScatterAirport }).payload?.airport ?? '')} className="cursor-pointer">
                  <LabelList dataKey="airport" position="top" offset={8} style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600, fill: 'var(--color-ink)' }} />
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          )}
        </div>
        <p className="mt-1 text-[11px] text-muted">Airports with at least {formatNumber(data?.min_turnarounds ?? 1000)} turnarounds, Jan 2025 to Aug 2026.</p>
      </div>
    </Card>
  );
}

const COLUMNS: { key: RankColumn; label: string; format: (a: AirportStats) => string; tip: string }[] = [
  { key: 'departures', label: 'Departures', format: (a) => formatNumber(a.departures), tip: 'Scheduled departures, Jan 2025 to Aug 2026' },
  { key: 'dep_late15_rate', label: 'Late rate', format: (a) => formatPercent(a.dep_late15_rate), tip: 'Departures that left 15+ minutes late' },
  { key: 'avg_arr_delay_min', label: 'Avg arrival delay', format: (a) => formatMinutes(a.avg_arr_delay_min, 1), tip: 'Average arrival delay of flights landing here' },
  { key: 'median_ground_min', label: 'Median ground', format: (a) => formatMinutes(a.median_ground_min), tip: 'Median planned ground time' },
  { key: 'short_turn_share', label: 'Short turns', format: (a) => formatPercent(a.short_turn_share), tip: 'Turnarounds with 55 minutes or less of ground time' },
  { key: 'propagated_delay_min', label: 'Delay passed on', format: (a) => `${formatCompact(a.propagated_delay_min)} min`, tip: 'Inbound delay passed on to the next flight, all months' },
];

interface RankProps {
  sort: RankColumn;
  order: 'asc' | 'desc';
  page: number;
  onSort: (sort: RankColumn, order: 'asc' | 'desc') => void;
  onPage: (page: number) => void;
  onSelect: (code: string) => void;
}

/** Every airport, sortable by each measure, 25 to a page; click a row to open the airport. */
export function RankingTable({ sort, order, page, onSort, onPage, onSelect }: RankProps) {
  const { data, isError, error, refetch, isFetching } = useAirportList('', 'departures', false);
  const rows = [...(data?.airports ?? [])].sort((a, b) => {
    const x = a[sort] ?? -Infinity;
    const y = b[sort] ?? -Infinity;
    return (order === 'asc' ? x - y : y - x) || a.airport.localeCompare(b.airport);
  });
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const current = Math.min(page, pages);
  const shown = rows.slice((current - 1) * PAGE, current * PAGE);

  return (
    <Card title="Ranking">
      <div className="overflow-x-auto px-4 pb-3">
        {isError && !data ? <ErrorState error={error} onRetry={() => void refetch()} retrying={isFetching} /> : !data ? <span className="skeleton block h-80" /> : (
          <table className="w-full min-w-[820px] text-[12px]">
            <thead>
              <tr className="border-b text-left text-muted">
                <th scope="col" className="py-2 pr-2 font-medium">Airport</th>
                {COLUMNS.map((c) => {
                  const active = c.key === sort;
                  const Arrow = !active ? ArrowUpDown : order === 'asc' ? ArrowUp : ArrowDown;
                  return (
                    <th key={c.key} scope="col" aria-sort={active ? (order === 'asc' ? 'ascending' : 'descending') : undefined} className="px-2 py-2 text-right font-medium">
                      <button type="button" title={c.tip} onClick={() => onSort(c.key, active && order === 'desc' ? 'asc' : 'desc')}
                        className={clsx('focus-ring inline-flex flex-row-reverse items-center gap-1 rounded hover:text-ink', active && 'text-ink')}>
                        {c.label}<Arrow size={12} className={active ? 'text-amber' : 'text-line'} aria-hidden="true" />
                      </button>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {shown.map((a) => (
                <tr key={a.airport} onClick={() => onSelect(a.airport)} className="cursor-pointer border-b last:border-0 hover:bg-bg">
                  <th scope="row" className="py-1.5 pr-2 text-left font-normal">
                    <button type="button" onClick={(e) => { e.stopPropagation(); onSelect(a.airport); }} className="focus-ring rounded text-left">
                      <span className="num font-bold text-ink">{a.airport}</span>
                      <span className="ml-2 text-muted">{a.city}</span>
                      {a.is_top10 && <span className="ml-2 rounded-full bg-amber-soft px-1.5 text-[10px] font-semibold text-amber">Top 10</span>}
                    </button>
                  </th>
                  {COLUMNS.map((c) => <td key={c.key} className={clsx('num px-2 py-1.5 text-right', c.key === sort && 'font-semibold')}>{c.format(a)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {data && (
        <div className="flex items-center justify-between gap-3 border-t px-4 py-2 text-[12px] text-muted">
          <span className="num">{formatNumber((current - 1) * PAGE + 1)}–{formatNumber(Math.min(rows.length, current * PAGE))} of {formatNumber(rows.length)} airports</span>
          <div className="flex items-center gap-2">
            <span className="num">Page {current} of {pages}</span>
            <button type="button" aria-label="Previous page" disabled={current <= 1} onClick={() => onPage(current - 1)}
              className="focus-ring flex h-7 w-7 items-center justify-center rounded-control border bg-surface text-ink hover:bg-bg disabled:opacity-40">
              <ChevronLeft size={15} aria-hidden="true" />
            </button>
            <button type="button" aria-label="Next page" disabled={current >= pages} onClick={() => onPage(current + 1)}
              className="focus-ring flex h-7 w-7 items-center justify-center rounded-control border bg-surface text-ink hover:bg-bg disabled:opacity-40">
              <ChevronRight size={15} aria-hidden="true" />
            </button>
          </div>
        </div>
      )}
    </Card>
  );
}
