// Risk insights on the Buffer Planner: clickable High / Medium / Low tiles and charts for the current filters.
// The tiles set the same risk filter as the chips in the controls bar, so the charts and the table below follow them.
// Every chart covers all turnarounds that match the filters, not just the table's page.
import clsx from 'clsx';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { type ReactNode, useMemo, useState } from 'react';
import {
  Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis,
} from 'recharts';
import { WrappedTick } from '../../components/charts';
import { ErrorState } from '../../components/ErrorState';
import { InfoTip } from '../../components/Tooltip';
import { RISK_DOT } from '../../config/risk';
import type { PlannerInsightBand, PlannerInsightGroup, PlannerInsightPoint, PlannerInsights } from '../../lib/api';
import { axisProps, axisTick, chartColors, gridProps } from '../../lib/chart';
import { formatMinutes, formatNumber, formatPercent } from '../../lib/format';
import { usePlannerInsights } from '../../lib/queries';
import { readJson, writeJson } from '../../lib/storage';
import { RISK_BANDS, type RiskBand, flightNo, reasonInfo } from '../../../shared/planner';
import { ChartTooltipBox, LegendItem } from '../overview/ChartTooltip';
import { type PlannerFilters, apiParams } from './usePlannerFilters';

const OPEN_KEY = 'ds_planner_insights_open';
const BAND_COLOR: Record<string, string> = {
  High: 'var(--color-critical)', Medium: 'var(--color-warning)', Low: 'var(--color-success)',
};
const NO_BUFFER = 'var(--color-line)';
const ELIGIBLE = [20, 150] as const;          // the engine only adds buffer to stops planned at 20 to 150 minutes

// Segments: "Ten busiest | Morning" -> axis "Busiest (AM)" (two lines, WrappedTick) and tooltip "Ten busiest · Morning"
const SEGMENT_ORDER = ['Ten busiest', 'Other airports'].flatMap((a) => ['Morning', 'Afternoon', 'Evening'].map((t) => `${a} | ${t}`));
const segmentShort = (s: string) => (s.includes(' | ') ? `${s.replace(' | ', ' (')})` : s)
  .replace('Ten busiest', 'Busiest').replace('Other airports', 'Other').replace('Morning', 'AM').replace('Afternoon', 'PM').replace('Evening', 'Eve');
const segmentRank = (s: string) => { const i = SEGMENT_ORDER.indexOf(s); return i < 0 ? SEGMENT_ORDER.length : i; };
const hourLabel = (h: string) => `${h.padStart(2, '0')}:00`;

interface Props {
  filters: PlannerFilters;
  update: (patch: Partial<PlannerFilters>) => void;
  onOpen: (turnId: string) => void;
}

export function RiskInsights({ filters, update, onOpen }: Props) {
  const [open, setOpen] = useState(() => readJson<boolean>('local', OPEN_KEY) ?? true);
  const toggle = () => setOpen((o) => { writeJson('local', OPEN_KEY, !o); return !o; });
  const params = useMemo(() => {
    const { sort: _sort, order: _order, ...rest } = apiParams(filters, false);
    return rest;
  }, [filters]);
  const { data, isError, error, refetch, isFetching } = usePlannerInsights(params);

  const pick = (band: 'all' | RiskBand) => update({ risk: band === filters.risk ? 'all' : band });

  return (
    <section className="rounded-card border bg-surface" aria-label="Risk insights">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 pb-2 pt-3">
        <h2 className="text-sm font-semibold text-ink">Risk insights</h2>
        <span className="text-[12px] text-muted">
          Click a risk group to see only those flights in the charts and the table. Click it again to see all.
        </span>
        {isFetching && data && <span className="text-[11px] text-muted">Updating…</span>}
        <button type="button" onClick={toggle} aria-expanded={open}
          className="focus-ring ml-auto inline-flex h-7 items-center gap-1 rounded-control border px-2.5 text-[12px] font-medium text-ink hover:bg-bg">
          {open ? <ChevronUp size={14} aria-hidden="true" /> : <ChevronDown size={14} aria-hidden="true" />}
          {open ? 'Hide charts' : 'Show charts'}
        </button>
      </header>

      {isError && !data ? (
        <div className="px-4 pb-4"><ErrorState title="Could not load the risk insights" error={error} onRetry={() => void refetch()} retrying={isFetching} /></div>
      ) : (
        <>
          <BandTiles data={data} selected={filters.risk} onPick={pick} />
          {open && <Charts data={data} selected={filters.risk} onOpen={onOpen} onAirport={(airport) => update({ airport })} />}
        </>
      )}
    </section>
  );
}

// ---- tiles ---------------------------------------------------------------------------------------------------------

function BandTiles({ data, selected, onPick }: {
  data: PlannerInsights | undefined; selected: 'all' | RiskBand; onPick: (b: 'all' | RiskBand) => void;
}) {
  if (!data) {
    return <div className="grid grid-cols-2 gap-3 px-4 pb-3 wide:grid-cols-4">{Array.from({ length: 4 }, (_, i) => <span key={i} className="skeleton block h-[92px] rounded-card" />)}</div>;
  }
  const total = data.bands.reduce((s, b) => s + b.turnarounds, 0);
  const sum = (k: 'with_buffer' | 'buffer_min' | 'expected_absorbed_min') => data.bands.reduce((s, b) => s + (b[k] ?? 0), 0);
  const avgLate = total ? data.bands.reduce((s, b) => s + (b.avg_p_late15 ?? 0) * b.turnarounds, 0) / total : null;
  const tiles: { band: 'all' | RiskBand; turnarounds: number; with_buffer: number; buffer_min: number; expected: number | null; avg: number | null }[] = [
    { band: 'all', turnarounds: total, with_buffer: sum('with_buffer'), buffer_min: sum('buffer_min'), expected: sum('expected_absorbed_min'), avg: avgLate },
    ...RISK_BANDS.map((band) => {
      const b = data.bands.find((x) => x.risk_band === band);
      return { band, turnarounds: b?.turnarounds ?? 0, with_buffer: b?.with_buffer ?? 0, buffer_min: b?.buffer_min ?? 0, expected: b?.expected_absorbed_min ?? null, avg: b?.avg_p_late15 ?? null };
    }),
  ];

  return (
    <div role="radiogroup" aria-label="Show risk group" className="grid grid-cols-2 gap-3 px-4 pb-3 wide:grid-cols-4">
      {tiles.map((t) => {
        const active = selected === t.band;
        return (
          <button key={t.band} type="button" role="radio" aria-checked={active} onClick={() => onPick(t.band)}
            className={clsx('focus-ring flex min-w-0 flex-col rounded-card border px-3.5 py-2.5 text-left transition-colors',
              active ? 'border-navy bg-bg ring-1 ring-navy' : 'bg-surface hover:bg-bg')}>
            <span className="flex items-center gap-1.5 text-xs font-semibold text-ink">
              {t.band !== 'all' && <span className={clsx('h-2 w-2 rounded-full', RISK_DOT[t.band])} aria-hidden="true" />}
              {t.band === 'all' ? 'All risk groups' : `${t.band} risk`}
              {t.band !== 'all' && <span className="font-normal text-muted">· {formatPercent(total ? t.turnarounds / total : null, 0)}</span>}
            </span>
            <span className="num mt-1 text-[20px] font-semibold leading-tight text-ink">
              {formatNumber(t.turnarounds)}<span className="text-[12px] font-normal text-muted"> flights</span>
            </span>
            <span className="mt-0.5 truncate text-[11px] text-muted">
              {formatNumber(t.with_buffer)} get buffer · {formatNumber(t.buffer_min)} min · avg late chance {formatPercent(t.avg, 0)}
            </span>
            <span className="truncate text-[11px] text-muted">Expected delay prevented {formatMinutes(t.expected, 0)}</span>
          </button>
        );
      })}
    </div>
  );
}

// ---- charts --------------------------------------------------------------------------------------------------------

function ChartCard({ title, tip, caption, legend, className, children }: {
  title: string; tip?: string; caption?: ReactNode; legend?: ReactNode; className?: string; children: ReactNode;
}) {
  return (
    <div className={clsx('flex min-w-0 flex-col rounded-card border bg-surface px-3.5 pb-3 pt-2.5', className)}>
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-[13px] font-semibold text-ink">{title}</h3>
        {tip && <InfoTip label={`About ${title}`} align="right">{tip}</InfoTip>}
      </div>
      {legend && <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">{legend}</div>}
      <div className="mt-1.5 h-56">{children}</div>
      {caption && <p className="mt-1 text-[11px] text-muted">{caption}</p>}
    </div>
  );
}

const groupRows = (rows: PlannerInsightGroup[], label: (k: string) => string = (k) => k) =>
  rows.map((g) => ({ ...g, label: label(g.key), without: g.turnarounds - g.with_buffer }));

function GroupTooltip({ title, g }: { title: string; g: PlannerInsightGroup }) {
  return (
    <ChartTooltipBox title={title} rows={[
      ['Flights', formatNumber(g.turnarounds)],
      ['Get buffer', `${formatNumber(g.with_buffer)} (${formatPercent(g.turnarounds ? g.with_buffer / g.turnarounds : null, 0)})`],
      ['Buffer given', formatMinutes(g.buffer_min)],
      ['Expected delay prevented', formatMinutes(g.expected_absorbed_min, 1)],
      ['Avg late chance', formatPercent(g.avg_p_late15, 0)],
    ]} />
  );
}

function Charts({ data, selected, onOpen, onAirport }: {
  data: PlannerInsights | undefined; selected: 'all' | RiskBand; onOpen: (turnId: string) => void; onAirport: (airport: string) => void;
}) {
  if (!data) {
    return <div className="grid gap-3 px-4 pb-4 md:grid-cols-2 wide:grid-cols-3">{Array.from({ length: 6 }, (_, i) => <span key={i} className="skeleton block h-72 rounded-card" />)}</div>;
  }
  const who = selected === 'all' ? 'flights' : `${selected.toLowerCase()}-risk flights`;
  const tint = selected === 'all' ? chartColors.amber : BAND_COLOR[selected];
  if (data.total === 0) {
    return <p className="px-4 pb-5 text-[13px] text-muted">No {who} match these filters.</p>;
  }
  const stackedLegend = <>
    <LegendItem color={tint} label="Get buffer" />
    <LegendItem color={NO_BUFFER} label="No buffer" />
  </>;
  const hours = groupRows(data.by_hour, hourLabel);
  const airports = groupRows(data.by_airport);
  const segments = groupRows([...data.by_segment].sort((a, b) => segmentRank(a.key) - segmentRank(b.key)), segmentShort);
  const buffers = data.by_buffer.map((b) => ({ ...b, label: b.extra_min === 0 ? 'None' : `+${b.extra_min}` }));
  const reasons = data.by_reason.map((r) => ({ ...r, ...reasonInfo(r.reason_code) }));

  return (
    <div className="grid gap-3 px-4 pb-4 md:grid-cols-2 wide:grid-cols-3">
      <FlightDots data={data} who={who} tint={tint} onOpen={onOpen} />

      <ChartCard title="When do they leave?" legend={stackedLegend}
        tip="Flights by planned departure hour (local time), split by whether the engine gives them extra minutes."
        caption={`Planned departure hour (local time) of ${selected === 'all' ? 'all flights' : `the ${who}`}.`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={hours} margin={{ top: 6, right: 4, bottom: 0, left: -6 }} barCategoryGap="12%">
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" tickFormatter={(v: string) => v.slice(0, 2)} />
            <YAxis {...axisProps} width={44} allowDecimals={false} />
            <Tooltip cursor={{ fill: 'var(--color-bg)' }} content={({ active, payload }) => {
              const g = payload?.[0]?.payload as (PlannerInsightGroup & { label: string }) | undefined;
              return active && g ? <GroupTooltip title={`Departing ${g.label}`} g={g} /> : null;
            }} />
            <Bar dataKey="with_buffer" stackId="s" fill={tint} isAnimationActive={false} />
            <Bar dataKey="without" stackId="s" fill={NO_BUFFER} radius={[2, 2, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Where are they?" legend={stackedLegend}
        tip="The ten airports with the most of these flights. Click a bar to show only that airport."
        caption="Top 10 airports. Click a bar to filter to that airport.">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={airports} layout="vertical" margin={{ top: 2, right: 8, bottom: 0, left: -12 }} barCategoryGap="18%">
            <CartesianGrid {...gridProps} horizontal={false} vertical />
            <XAxis type="number" {...axisProps} allowDecimals={false} />
            <YAxis type="category" dataKey="label" {...axisProps} width={46} interval={0} />
            <Tooltip cursor={{ fill: 'var(--color-bg)' }} content={({ active, payload }) => {
              const g = payload?.[0]?.payload as PlannerInsightGroup | undefined;
              return active && g ? <GroupTooltip title={g.key} g={g} /> : null;
            }} />
            <Bar dataKey="with_buffer" stackId="s" fill={tint} isAnimationActive={false} className="cursor-pointer"
              onClick={(p: unknown) => onAirport((p as { payload?: PlannerInsightGroup }).payload?.key ?? '')} />
            <Bar dataKey="without" stackId="s" fill={NO_BUFFER} radius={[0, 2, 2, 0]} isAnimationActive={false} className="cursor-pointer"
              onClick={(p: unknown) => onAirport((p as { payload?: PlannerInsightGroup }).payload?.key ?? '')} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="How much buffer do they get?"
        tip="How many of these flights get no extra minutes, +5, +10 and so on, up to the 30-minute limit per stop."
        caption={`${formatNumber(data.total - (data.by_buffer.find((b) => b.extra_min === 0)?.turnarounds ?? 0))} of ${formatNumber(data.total)} ${who} get extra minutes.`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={buffers} margin={{ top: 6, right: 4, bottom: 0, left: -6 }} barCategoryGap="20%">
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="label" {...axisProps} interval={0} />
            <YAxis {...axisProps} width={44} allowDecimals={false} />
            <Tooltip cursor={{ fill: 'var(--color-bg)' }} content={({ active, payload }) => {
              const b = payload?.[0]?.payload as (typeof buffers)[number] | undefined;
              return active && b ? <ChartTooltipBox title={b.extra_min === 0 ? 'No extra minutes' : `+${b.extra_min} min`}
                rows={[['Flights', formatNumber(b.turnarounds)], ['Share', formatPercent(b.turnarounds / data.total, 0)]]} /> : null;
            }} />
            <Bar dataKey="turnarounds" radius={[2, 2, 0, 0]} isAnimationActive={false}>
              {buffers.map((b) => <Cell key={b.extra_min} fill={b.extra_min === 0 ? NO_BUFFER : tint} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Why, or why not?" legend={<><LegendItem color={tint} label="Buffer added" /><LegendItem color={chartColors.muted} label="No buffer" /></>}
        tip="The engine's reason for each of these flights, as in the table's Reason column."
        caption="Reasons from the optimisation engine.">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={reasons} layout="vertical" margin={{ top: 2, right: 8, bottom: 0, left: 0 }} barCategoryGap="22%">
            <CartesianGrid {...gridProps} horizontal={false} vertical />
            <XAxis type="number" {...axisProps} allowDecimals={false} />
            <YAxis type="category" dataKey="short" {...axisProps} width={150} interval={0} tick={{ ...axisTick, fontSize: 10 }} />
            <Tooltip cursor={{ fill: 'var(--color-bg)' }} content={({ active, payload }) => {
              const r = payload?.[0]?.payload as (typeof reasons)[number] | undefined;
              return active && r ? <ChartTooltipBox title={r.short} rows={[['Flights', formatNumber(r.turnarounds)], ['Share', formatPercent(r.turnarounds / data.total, 0)]]} /> : null;
            }} />
            <Bar dataKey="turnarounds" radius={[0, 2, 2, 0]} isAnimationActive={false}>
              {reasons.map((r) => <Cell key={r.reason_code} fill={r.added ? tint : chartColors.muted} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="By airport type and time of day" legend={stackedLegend}
        tip="The engine's segments: the ten busiest airports or the others, by morning, afternoon and evening."
        caption="Ten busiest airports or others; AM = morning, PM = afternoon, Eve = evening.">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={segments} margin={{ top: 6, right: 4, bottom: 0, left: -6 }} barCategoryGap="18%">
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="label" {...axisProps} interval={0} height={34} tick={<WrappedTick />} />
            <YAxis {...axisProps} width={44} allowDecimals={false} />
            <Tooltip cursor={{ fill: 'var(--color-bg)' }} content={({ active, payload }) => {
              const g = payload?.[0]?.payload as (PlannerInsightGroup & { label: string }) | undefined;
              return active && g ? <GroupTooltip title={g.key.replace(' | ', ' · ')} g={g} /> : null;
            }} />
            <Bar dataKey="with_buffer" stackId="s" fill={tint} isAnimationActive={false} />
            <Bar dataKey="without" stackId="s" fill={NO_BUFFER} radius={[2, 2, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <BandCompare bands={data.bands} selected={selected} budget={data.budget} />
    </div>
  );
}

/** Late chance against planned ground time, one dot per flight; dot size is the extra minutes. Click opens the flight. */
function FlightDots({ data, who, tint, onOpen }: { data: PlannerInsights; who: string; tint: string; onOpen: (id: string) => void }) {
  const pts = data.points.filter((p) => p.p_late15 !== null && p.current_ground_min !== null)
    .map((p) => ({ ...p, x: Math.min(p.current_ground_min as number, 240), y: (p.p_late15 as number) * 100, z: Math.max(p.recommended_extra_min, 1) }));
  const given = pts.filter((p) => p.recommended_extra_min > 0);
  const none = pts.filter((p) => p.recommended_extra_min === 0);
  const click = (p: unknown) => { const id = (p as { payload?: PlannerInsightPoint }).payload?.turn_id; if (id) onOpen(id); };
  const shown = data.total > data.points.length ? `the ${formatNumber(data.points.length)} riskiest of ${formatNumber(data.total)} ${who}` : `all ${formatNumber(data.total)} ${who}`;
  return (
    <ChartCard className="md:col-span-2" title="Which flights? Late chance vs planned ground time"
      tip="Each dot is one flight. Higher means more likely to leave 15+ minutes late; further left means less time on the ground. Coloured dots get buffer (bigger = more minutes). The dashed lines mark the 20–150 minute range where the engine can add buffer."
      legend={<><LegendItem color={tint} label="Gets buffer (size = minutes)" dot /><LegendItem color={chartColors.muted} label="No buffer" dot />
        <span className="text-[11px] text-muted">Click a dot to open that flight.</span></>}
      caption={`Showing ${shown}. Ground times over 240 min are drawn at 240.`}>
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 8, right: 12, bottom: 14, left: -8 }}>
          <CartesianGrid {...gridProps} vertical />
          <XAxis type="number" dataKey="x" {...axisProps} domain={[0, 240]} ticks={[0, 20, 60, 100, 150, 200, 240]}
            label={{ value: 'Planned ground time (min)', position: 'insideBottom', offset: -8, ...axisTick }} />
          <YAxis type="number" dataKey="y" {...axisProps} width={48} domain={[0, 100]} ticks={[0, 25, 50, 75, 100]}
            tickFormatter={(v: number) => `${v}%`} />
          <ZAxis type="number" dataKey="z" range={[14, 160]} domain={[1, 30]} />
          {ELIGIBLE.map((x) => <ReferenceLine key={x} x={x} stroke={chartColors.muted} strokeDasharray="4 4" />)}
          <Tooltip cursor={{ strokeDasharray: '3 3' }} content={({ active, payload }) => {
            const p = payload?.[0]?.payload as PlannerInsightPoint | undefined;
            return active && p ? (
              <ChartTooltipBox title={`${p.inbound_from ?? '–'} → ${p.airport} → ${flightNo(p.outbound_flight_no)} ${p.outbound_to ?? '–'}`} rows={[
                ['Tail', p.tail_number ?? '–'],
                ['Risk group', p.risk_band ?? '–'],
                ['Late chance', formatPercent(p.p_late15, 0)],
                ['Planned ground time', formatMinutes(p.current_ground_min)],
                ['Extra minutes', p.recommended_extra_min ? `+${p.recommended_extra_min} min` : 'None'],
                ['Expected delay prevented', formatMinutes(p.expected_absorbed_min, 1)],
              ]} />
            ) : null;
          }} />
          <Scatter data={none} fill={chartColors.muted} fillOpacity={0.3} isAnimationActive={false} onClick={click} className="cursor-pointer" />
          <Scatter data={given} fill={tint} fillOpacity={0.75} isAnimationActive={false} onClick={click} className="cursor-pointer" />
        </ScatterChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

/** Every risk group side by side: forecast vs reality, and delay prevented expected vs with real 2026 delays. */
function BandCompare({ bands, selected, budget }: { bands: PlannerInsightBand[]; selected: 'all' | RiskBand; budget: number }) {
  const rows = RISK_BANDS.map((band) => {
    const b = bands.find((x) => x.risk_band === band);
    return { band, pred: b?.avg_pred_inbound_min ?? null, actual: b?.avg_actual_inbound_min ?? null,
      expected: b?.expected_absorbed_min ?? null, curve: b?.realised_absorbed_min ?? null, model: b?.realised_absorbed_resp_min ?? null };
  });
  const faded = (band: string) => (selected === 'all' || selected === band ? 1 : 0.3);
  return (
    <ChartCard className="wide:col-span-2" title="Forecast vs reality, by risk group"
      tip="Average inbound delay the model predicted against what really happened in 2026, for each risk group. The selected group is highlighted."
      legend={<><LegendItem color={chartColors.tarmac} label="Predicted inbound delay" /><LegendItem color={chartColors.amber} label="Real 2026 inbound delay" /></>}
      caption={budget === 5
        ? `Delay prevented (min): ${rows.map((r) => `${r.band} ${formatNumber(r.expected, 0)} expected, ${formatNumber(r.curve, 0)}–${formatNumber(r.model, 0)} with real delays`).join(' · ')}`
        : `Delay prevented (min, expected): ${rows.map((r) => `${r.band} ${formatNumber(r.expected, 0)}`).join(' · ')}`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 6, right: 4, bottom: 0, left: -6 }} barCategoryGap="24%">
          <CartesianGrid {...gridProps} />
          <XAxis dataKey="band" {...axisProps} interval={0} />
          <YAxis {...axisProps} width={44} tickFormatter={(v: number) => `${Math.round(v)}`} />
          <ReferenceLine y={0} stroke={chartColors.muted} />
          <Tooltip cursor={{ fill: 'var(--color-bg)' }} content={({ active, payload }) => {
            const r = payload?.[0]?.payload as (typeof rows)[number] | undefined;
            return active && r ? <ChartTooltipBox title={`${r.band} risk`} rows={[
              ['Predicted inbound delay', formatMinutes(r.pred, 1)],
              ['Real 2026 inbound delay', formatMinutes(r.actual, 1)],
              ['Delay prevented, expected', formatMinutes(r.expected, 0)],
              ['With real delays, curve view', formatMinutes(r.curve, 0)],
              ...(budget === 5 ? [['With real delays, model view', formatMinutes(r.model, 0)] as [string, string]] : []),
            ]} /> : null;
          }} />
          <Bar dataKey="pred" radius={[2, 2, 0, 0]} isAnimationActive={false}>
            {rows.map((r) => <Cell key={r.band} fill={chartColors.tarmac} fillOpacity={faded(r.band)} />)}
          </Bar>
          <Bar dataKey="actual" radius={[2, 2, 0, 0]} isAnimationActive={false}>
            {rows.map((r) => <Cell key={r.band} fill={chartColors.amber} fillOpacity={faded(r.band)} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
