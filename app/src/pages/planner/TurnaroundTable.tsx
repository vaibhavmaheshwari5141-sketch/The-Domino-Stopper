import clsx from 'clsx';
import { ArrowDown, ArrowUp, ArrowUpDown, Check, ChevronLeft, ChevronRight, Link2, Timer } from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';
import { RiskChip } from '../../components/RiskChip';
import { Tooltip } from '../../components/Tooltip';
import type { PlannerRow } from '../../lib/api';
import { EMPTY, dayOffset, formatNumber, formatPercent, formatTimeUtc } from '../../lib/format';
import { ESTIMATE_HELP } from '../../../shared/kpis';
import { type SortField, flightNo, reasonInfo } from '../../../shared/planner';
import { PAGE_SIZE } from './usePlannerFilters';

type Group = 'key' | 'prediction' | 'optimisation' | 'turnaround' | 'backtest';

interface Column {
  key: string;
  label: ReactNode;
  tip: string;
  group: Group;
  sort?: SortField;
  /** Default direction when this column is first sorted. */
  firstOrder?: 'asc' | 'desc';
  align?: 'left' | 'right' | 'center';
  /** Width in px; required for the sticky key columns (their left offsets add up from it). */
  width?: number;
  /** Small coloured mark in the header: which engine the figure comes from. */
  accent?: 'teal' | 'amber';
  cell: (r: PlannerRow) => ReactNode;
}

const dash = (v: number | null | undefined, digits = 0) => (v ? formatNumber(v, digits) : EMPTY);
const MAIN_BUDGET = 5;

/** "Ten busiest | Morning" -> "Busiest · Morning" */
const segmentShort = (s: string | null) => (s ? s.replace('Ten busiest', 'Busiest').replace('Other airports', 'Other').replace(' | ', ' · ') : EMPTY);

function chainTip(r: PlannerRow): string {
  return r.chain_multiplier === null ? 'Protects later flights of this aircraft.'
    : `Protects later flights: 1 minute saved here is worth about ${formatNumber(r.chain_multiplier, 1)} minutes across the aircraft's day.`;
}

function columns(budget: number): Column[] {
  return [
    // Key figures: always visible (sticky on the left)
    { key: 'flight', label: 'Flight', group: 'key', width: 132,
      tip: 'Inbound flight, then the outbound flight that leaves after this turnaround.',
      cell: (r) => <span className="num whitespace-nowrap"><span className="text-muted">{flightNo(r.inbound_flight_no)} →</span> <span className="font-semibold">{flightNo(r.outbound_flight_no)}</span></span> },
    { key: 'airport', label: 'Airport', group: 'key', width: 124,
      tip: 'Where the aircraft came from, the turnaround airport (bold), and where it goes next.',
      cell: (r) => (
        <span className="whitespace-nowrap">
          <span className="text-muted">{r.inbound_from ?? '–'} ›</span> <span className="font-semibold text-ink">{r.airport}</span> <span className="text-muted">› {r.outbound_to ?? '–'}</span>
        </span>
      ) },
    { key: 'ground', label: 'Ground', group: 'key', sort: 'current_ground_min', firstOrder: 'asc', align: 'right', width: 80,
      tip: 'Planned ground time in the timetable, in minutes: from scheduled arrival to scheduled departure.',
      cell: (r) => (
        <span className="inline-flex items-center justify-end gap-1">
          {r.very_short_turn_flag && (
            <span title="Very short turn (under 20 min): usually an aircraft swap" className="text-warning"><Timer size={12} aria-label="Very short turn" /></span>
          )}
          <span className="num">{formatNumber(r.current_ground_min)}</span>
        </span>
      ) },
    { key: 'late', label: 'Late chance', group: 'key', accent: 'teal', sort: 'p_late15', firstOrder: 'desc', align: 'right', width: 100,
      tip: 'Prediction engine: chance that the outbound flight leaves 15 or more minutes late, from the timetable only.',
      cell: (r) => <span className="num">{formatPercent(r.p_late15, 0)}</span> },
    { key: 'extra', label: 'Buffer', group: 'key', accent: 'amber', sort: 'recommended_extra_min', firstOrder: 'desc', align: 'right', width: 98,
      tip: 'Recommended extra ground time from the optimisation engine, 0 to 30 minutes. The link icon marks turnarounds that protect later flights.',
      cell: (r) => (
        <span className="inline-flex items-center justify-end gap-1">
          {r.protects_later_flights && (
            <Tooltip content={chainTip(r)} align="left">
              <span tabIndex={0} className="focus-ring rounded text-teal"><Link2 size={13} aria-label="Protects later flights" /></span>
            </Tooltip>
          )}
          {r.recommended_extra_min > 0 ? <span className="num whitespace-nowrap font-semibold text-amber">+{r.recommended_extra_min} min</span> : <span className="text-muted">{EMPTY}</span>}
        </span>
      ) },
    { key: 'exp', label: 'Expected', group: 'key', accent: 'amber', sort: 'expected_absorbed_min', firstOrder: 'desc', align: 'right', width: 96,
      tip: "Expected delay minutes prevented across the aircraft's day: the midpoint of the curve view and the model view.",
      cell: (r) => <span className="num">{dash(r.expected_absorbed_min, 1)}</span> },

    { key: 'pred', label: 'Pred. inbound', group: 'prediction', sort: 'pred_inbound_delay_min', firstOrder: 'desc', align: 'right',
      tip: 'Predicted arrival delay of the inbound aircraft, in minutes. This is the delay that could be passed on.',
      cell: (r) => <span className="num">{formatNumber(r.pred_inbound_delay_min, 1)}</span> },
    { key: 'risk', label: 'Risk', group: 'prediction', align: 'center',
      tip: 'Risk band from the prediction engine: High, Medium or Low chance that the outbound flight leaves 15+ minutes late.',
      cell: (r) => <RiskChip band={r.risk_band} /> },

    { key: 'new', label: 'New ground', group: 'optimisation', align: 'right',
      tip: 'Planned ground time after adding the recommended minutes.',
      cell: (r) => <span className={clsx('num', r.recommended_extra_min === 0 && 'text-muted')}>{r.recommended_extra_min > 0 ? formatNumber(r.new_ground_min) : EMPTY}</span> },
    { key: 'rank', label: 'Rank', group: 'optimisation', sort: 'day_rank', firstOrder: 'asc', align: 'right',
      tip: "The engine's order of priority for the day: 1 is the turnaround where buffer does the most good. Empty when it gets no buffer.",
      cell: (r) => <span className="num">{r.day_rank ?? EMPTY}</span> },
    { key: 'reason', label: 'Reason', group: 'optimisation', width: 160,
      tip: 'Why the engine did or did not give buffer. Hover a reason for the full text.',
      cell: (r) => {
        const info = reasonInfo(r.reason_code);
        return (
          <Tooltip content={r.reason_code ?? 'No reason given'} align="right">
            <span tabIndex={0} className={clsx('focus-ring whitespace-nowrap rounded', info.added ? 'text-ink' : 'text-muted')}>{info.short}</span>
          </Tooltip>
        );
      } },
    { key: 'segment', label: 'Segment', group: 'optimisation',
      tip: 'The group whose pass-through curve the engine used: ten busiest or other airports, by time of day.',
      cell: (r) => <span className="whitespace-nowrap rounded bg-bg px-1.5 py-px text-[11px] text-muted" title={r.segment ?? undefined}>{segmentShort(r.segment)}</span> },

    { key: 'tail', label: 'Tail', group: 'turnaround', tip: "The aircraft's registration (tail number).",
      cell: (r) => <span className="num">{r.tail_number ?? EMPTY}</span> },
    { key: 'dep', label: <>Departs <span className="text-muted">UTC</span></>, group: 'turnaround', sort: 'sched_outbound_dep_utc', firstOrder: 'asc', align: 'right',
      tip: 'Scheduled departure of the outbound flight, in UTC. "+1" means the next day in UTC.',
      cell: (r) => {
        const next = dayOffset(r.flight_date, r.sched_outbound_dep_utc);
        return <span className="num">{formatTimeUtc(r.sched_outbound_dep_utc)}{next ? <sup className="ml-0.5 text-[9px] text-muted">+{next}</sup> : null}</span>;
      } },

    { key: 'actual', label: 'Actual inbound', group: 'backtest', align: 'right',
      tip: 'Real arrival delay of the inbound aircraft in 2026, in minutes (negative = early).',
      cell: (r) => <span className="num">{formatNumber(r.actual_inbound_delay_min)}</span> },
    { key: 'realised', label: 'Prevented, curve view', group: 'backtest', align: 'right',
      tip: `Minutes of delay the extra ground time would have prevented across the aircraft's day, curve view. ${ESTIMATE_HELP}`,
      cell: (r) => <span className="num">{dash(r.realised_absorbed_min, 1)}</span> },
    ...(budget === MAIN_BUDGET ? [{
      key: 'realised_resp', label: 'Prevented, model view', group: 'backtest' as const, align: 'right' as const,
      tip: `The same, model view (computed at the main budget only). ${ESTIMATE_HELP}`,
      cell: (r: PlannerRow) => <span className="num">{dash(r.realised_absorbed_resp_min, 1)}</span>,
    }] : []),
    { key: 'avoided', label: 'Late dep. avoided', group: 'backtest', align: 'center',
      tip: 'Ticked when the outbound flight really left 15+ minutes late and the extra ground time would have made it leave on time.',
      cell: (r) => (r.late_avoided_flag ? <Check size={15} className="mx-auto text-success" aria-label="Late departure avoided" /> : null) },
  ];
}

const GROUPS: { group: Group; label: string; tip?: string; className: string }[] = [
  { group: 'key', label: 'Key figures', className: 'border-t-navy text-ink' },
  { group: 'prediction', label: 'Prediction engine', className: 'border-t-teal text-teal' },
  { group: 'optimisation', label: 'Optimisation engine', className: 'border-t-amber text-amber' },
  { group: 'turnaround', label: 'Turnaround', className: 'border-t-line' },
  { group: 'backtest', label: 'Estimated with real 2026 delays', className: 'border-t-muted bg-bg', tip: ESTIMATE_HELP },
];

interface Props {
  rows: PlannerRow[] | undefined;
  total: number;
  page: number;
  budget: number;
  sort: SortField;
  order: 'asc' | 'desc';
  selected: string | null;
  fetching: boolean;
  onSort: (sort: SortField, order: 'asc' | 'desc') => void;
  onPage: (page: number) => void;
  onOpen: (turnId: string) => void;
  style?: CSSProperties;
  empty: ReactNode;
}

export function TurnaroundTable({ rows, total, page, budget, sort, order, selected, fetching, onSort, onPage, onOpen, style, empty }: Props) {
  const cols = columns(budget);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const first = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const last = Math.min(total, page * PAGE_SIZE);
  // The key columns stay on the left while the rest scrolls sideways
  const keyCols = cols.filter((c) => c.group === 'key');
  const offsets = new Map(keyCols.map((c, i) => [c.key, keyCols.slice(0, i).reduce((s, k) => s + (k.width ?? 0), 0)]));
  const keyWidth = keyCols.reduce((s, c) => s + (c.width ?? 0), 0);
  const lastKey = keyCols[keyCols.length - 1]?.key;
  const cellStyle = (c: Column): CSSProperties => (c.group === 'key'
    ? { position: 'sticky', left: offsets.get(c.key), minWidth: c.width, maxWidth: c.width, width: c.width }
    : { minWidth: c.width });
  const edge = (c: Column) => c.key === lastKey && 'shadow-[inset_-1px_0_0_var(--color-line),4px_0_6px_-4px_rgb(20_32_48/0.15)]';

  return (
    <div className="isolate flex min-h-0 flex-col rounded-card border bg-surface" style={style}>
      <div className={clsx('min-h-0 flex-1 overflow-auto rounded-t-card transition-opacity', fetching && rows && 'opacity-60')}>
        {rows && rows.length === 0 ? empty : (
        <table className="w-full min-w-[1420px] border-separate border-spacing-0 text-[12px]">
          <thead>
            <tr>
              {GROUPS.map((g) => {
                const span = cols.filter((c) => c.group === g.group).length;
                const label = <span className="label text-[10px] text-current">{g.label}</span>;
                const sticky = g.group === 'key';
                return (
                  <th key={g.group} colSpan={span} scope="colgroup"
                    style={sticky ? { position: 'sticky', left: 0, minWidth: keyWidth } : undefined}
                    className={clsx('sticky top-0 h-7 border-b border-t-2 bg-surface px-2 text-left font-normal', sticky ? 'z-40' : 'z-20', g.className)}>
                    {g.tip ? (
                      <Tooltip content={g.tip} align="right"><span tabIndex={0} className="focus-ring cursor-help rounded">{label}</span></Tooltip>
                    ) : label}
                  </th>
                );
              })}
            </tr>
            <tr>
              {cols.map((c) => {
                const active = c.sort === sort;
                const next = active ? (order === 'asc' ? 'desc' : 'asc') : (c.firstOrder ?? 'asc');
                const Arrow = !active ? ArrowUpDown : order === 'asc' ? ArrowUp : ArrowDown;
                const content = (
                  <span className={clsx('inline-flex items-center gap-1 whitespace-nowrap', active && 'text-ink')}>
                    {c.accent && <span className={clsx('h-1.5 w-1.5 rounded-full', c.accent === 'teal' ? 'bg-teal' : 'bg-amber')} aria-hidden="true" />}
                    {c.label}
                  </span>
                );
                return (
                  <th
                    key={c.key}
                    scope="col"
                    aria-sort={active ? (order === 'asc' ? 'ascending' : 'descending') : undefined}
                    style={cellStyle(c)}
                    className={clsx(
                      'sticky top-7 h-9 border-b px-2 font-medium text-muted',
                      c.group === 'backtest' ? 'bg-bg' : 'bg-surface',
                      c.group === 'key' ? 'z-30' : 'z-20',
                      edge(c),
                      c.align === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : 'text-left',
                    )}
                  >
                    <Tooltip content={c.tip} align={c.group === 'backtest' || c.key === 'reason' ? 'right' : 'left'}>
                      {c.sort ? (
                        <button type="button" onClick={() => onSort(c.sort!, next)}
                          className={clsx('focus-ring inline-flex items-center gap-1 rounded hover:text-ink', c.align === 'right' && 'flex-row-reverse')}>
                          {content}
                          <Arrow size={12} className={active ? 'text-amber' : 'text-line'} aria-hidden="true" />
                        </button>
                      ) : (
                        <span tabIndex={0} className="focus-ring cursor-help rounded">{content}</span>
                      )}
                    </Tooltip>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {!rows
              ? Array.from({ length: 12 }, (_, i) => (
                <tr key={i}>
                  {cols.map((c) => <td key={c.key} style={cellStyle(c)} className="border-b bg-surface px-2 py-2.5"><span className="skeleton block h-3" /></td>)}
                </tr>
              ))
              : rows.map((r) => {
                const isSelected = r.turn_id === selected;
                return (
                  <tr key={r.turn_id} onClick={() => onOpen(r.turn_id)} className="group cursor-pointer">
                    {cols.map((c) => (
                      <td
                        key={c.key}
                        style={cellStyle(c)}
                        className={clsx(
                          'border-b px-2 py-2 text-ink',
                          isSelected ? 'bg-amber-soft' : c.group === 'backtest' ? 'bg-bg' : 'bg-surface group-hover:bg-bg',
                          c.group === 'key' && 'z-10',
                          edge(c),
                          c.align === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : 'text-left',
                        )}
                      >
                        {c.key === 'flight' ? (
                          <button type="button" onClick={(e) => { e.stopPropagation(); onOpen(r.turn_id); }}
                            aria-label={`Open details for ${r.tail_number ?? r.turn_id}`}
                            className="focus-ring w-full rounded text-left">
                            {c.cell(r)}
                          </button>
                        ) : c.cell(r)}
                      </td>
                    ))}
                  </tr>
                );
              })}
          </tbody>
        </table>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 border-t px-3 py-2 text-[12px] text-muted">
        <span className="num">{total > 0 ? `${formatNumber(first)}–${formatNumber(last)} of ${formatNumber(total)} turnarounds` : '0 turnarounds'}</span>
        <div className="flex items-center gap-2">
          <span className="num">Page {formatNumber(page)} of {formatNumber(pages)}</span>
          <button type="button" aria-label="Previous page" disabled={page <= 1} onClick={() => onPage(page - 1)}
            className="focus-ring flex h-7 w-7 items-center justify-center rounded-control border bg-surface text-ink hover:bg-bg disabled:opacity-40">
            <ChevronLeft size={15} aria-hidden="true" />
          </button>
          <button type="button" aria-label="Next page" disabled={page >= pages} onClick={() => onPage(page + 1)}
            className="focus-ring flex h-7 w-7 items-center justify-center rounded-control border bg-surface text-ink hover:bg-bg disabled:opacity-40">
            <ChevronRight size={15} aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}
