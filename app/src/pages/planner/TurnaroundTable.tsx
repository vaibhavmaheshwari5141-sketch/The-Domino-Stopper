import clsx from 'clsx';
import { ArrowDown, ArrowUp, ArrowUpDown, Check, ChevronLeft, ChevronRight, Timer } from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';
import { RiskChip } from '../../components/RiskChip';
import { Tooltip } from '../../components/Tooltip';
import type { PlannerRow } from '../../lib/api';
import { EMPTY, dayOffset, formatNumber, formatPercent, formatTimeUtc } from '../../lib/format';
import { type SortField, reasonInfo } from '../../../shared/planner';
import { FlightChain } from './FlightChain';
import { PAGE_SIZE } from './usePlannerFilters';

type Group = 'turnaround' | 'prediction' | 'optimisation' | 'backtest';

interface Column {
  key: string;
  label: ReactNode;
  tip: string;
  group: Group;
  sort?: SortField;
  /** Default direction when this column is first sorted. */
  firstOrder?: 'asc' | 'desc';
  align?: 'left' | 'right' | 'center';
  sticky?: string;                 // left offset for columns that stay visible when scrolling sideways
  width?: string;
  cell: (r: PlannerRow) => ReactNode;
}

const dash = (v: number | null | undefined, digits = 0) => (v ? formatNumber(v, digits) : EMPTY);

const COLUMNS: Column[] = [
  { key: 'rank', label: 'Rank', group: 'turnaround', sort: 'day_rank', firstOrder: 'asc', align: 'right', sticky: '0px', width: '52px',
    tip: "The engine's order of priority for the day: 1 is the turnaround where buffer does the most good. Empty when it gets no buffer.",
    cell: (r) => <span className="num">{r.day_rank ?? EMPTY}</span> },
  { key: 'chain', label: 'Flight chain', group: 'turnaround', sticky: '52px', width: '224px',
    tip: 'Inbound flight and origin, the turnaround airport (bold), then the outbound flight and destination.',
    cell: (r) => (
      <span className="flex items-center gap-1.5">
        <FlightChain inboundFlight={r.inbound_flight_no} from={r.inbound_from} airport={r.airport} outboundFlight={r.outbound_flight_no} to={r.outbound_to} />
        {r.very_short_turn_flag && (
          <span title="Very short turn (under 20 min): often an aircraft swap or a timetable quirk" className="text-warning">
            <Timer size={13} aria-label="Very short turn" />
          </span>
        )}
      </span>
    ) },
  { key: 'tail', label: 'Tail', group: 'turnaround', tip: "The aircraft's registration (tail number).",
    cell: (r) => <span className="num">{r.tail_number ?? EMPTY}</span> },
  { key: 'dep', label: <>Departs <span className="text-muted">UTC</span></>, group: 'turnaround', sort: 'sched_outbound_dep_utc', firstOrder: 'asc', align: 'right',
    tip: 'Scheduled departure of the outbound flight, in UTC. "+1" means the next day in UTC.',
    cell: (r) => {
      const next = dayOffset(r.flight_date, r.sched_outbound_dep_utc);
      return <span className="num">{formatTimeUtc(r.sched_outbound_dep_utc)}{next ? <sup className="ml-0.5 text-[9px] text-muted">+{next}</sup> : null}</span>;
    } },
  { key: 'ground', label: 'Ground', group: 'turnaround', sort: 'current_ground_min', firstOrder: 'asc', align: 'right',
    tip: 'Planned ground time in the timetable, in minutes: from scheduled arrival to scheduled departure.',
    cell: (r) => <span className="num">{formatNumber(r.current_ground_min)}</span> },

  { key: 'risk', label: 'Risk', group: 'prediction', align: 'center',
    tip: 'Risk band from the prediction engine: High, Medium or Low chance that the outbound flight leaves 15+ minutes late.',
    cell: (r) => <RiskChip band={r.risk_band} /> },
  { key: 'late', label: 'Late chance', group: 'prediction', sort: 'p_late15', firstOrder: 'desc', align: 'right',
    tip: 'Predicted chance that the outbound flight leaves 15 or more minutes late, from the timetable only.',
    cell: (r) => <span className="num">{formatPercent(r.p_late15, 0)}</span> },
  { key: 'pred', label: 'Pred. inbound', group: 'prediction', sort: 'pred_inbound_delay_min', firstOrder: 'desc', align: 'right',
    tip: 'Predicted arrival delay of the inbound aircraft, in minutes. This is the delay that could be passed on.',
    cell: (r) => <span className="num">{formatNumber(r.pred_inbound_delay_min, 1)}</span> },

  { key: 'extra', label: 'Extra', group: 'optimisation', sort: 'recommended_extra_min', firstOrder: 'desc', align: 'right',
    tip: 'Extra ground time the optimisation engine recommends, from 0 to 30 minutes.',
    cell: (r) => (r.recommended_extra_min > 0 ? <span className="num whitespace-nowrap font-semibold text-amber">+{r.recommended_extra_min} min</span> : <span className="text-muted">{EMPTY}</span>) },
  { key: 'new', label: 'New ground', group: 'optimisation', align: 'right',
    tip: 'Planned ground time after adding the recommended minutes.',
    cell: (r) => <span className={clsx('num', r.recommended_extra_min === 0 && 'text-muted')}>{r.recommended_extra_min > 0 ? formatNumber(r.new_ground_min) : EMPTY}</span> },
  { key: 'exp', label: 'Exp. absorbed', group: 'optimisation', sort: 'expected_absorbed_min', firstOrder: 'desc', align: 'right',
    tip: 'Minutes of knock-on delay the extra ground time is expected to stop, from the prediction and the pass-through curve.',
    cell: (r) => <span className="num">{dash(r.expected_absorbed_min, 1)}</span> },
  { key: 'reason', label: 'Reason', group: 'optimisation', width: '150px',
    tip: 'Why the engine did or did not give buffer. Hover a reason for the full text.',
    cell: (r) => {
      const info = reasonInfo(r.reason_code);
      return (
        <Tooltip content={r.reason_code ?? 'No reason given'} align="right">
          <span tabIndex={0} className={clsx('focus-ring whitespace-nowrap rounded', info.added ? 'text-ink' : 'text-muted')}>{info.short}</span>
        </Tooltip>
      );
    } },

  { key: 'actual', label: 'Actual inbound', group: 'backtest', align: 'right',
    tip: 'Real arrival delay of the inbound aircraft in 2026, in minutes (negative = early).',
    cell: (r) => <span className="num">{formatNumber(r.actual_inbound_delay_min)}</span> },
  { key: 'realised', label: 'Realised absorbed', group: 'backtest', align: 'right',
    tip: 'Minutes of knock-on delay the extra ground time would really have stopped, with the real 2026 delays.',
    cell: (r) => <span className="num">{dash(r.realised_absorbed_min, 1)}</span> },
  { key: 'avoided', label: 'Late dep. avoided', group: 'backtest', align: 'center',
    tip: 'Ticked when the outbound flight really left 15+ minutes late and the extra ground time would have made it leave on time.',
    cell: (r) => (r.late_avoided_flag ? <Check size={15} className="mx-auto text-success" aria-label="Late departure avoided" /> : null) },
];

const GROUPS: { group: Group; label: string; tip?: string; className: string }[] = [
  { group: 'turnaround', label: 'Turnaround', className: 'border-t-line' },
  { group: 'prediction', label: 'Prediction engine', className: 'border-t-teal text-teal' },
  { group: 'optimisation', label: 'Optimisation engine', className: 'border-t-amber text-amber' },
  { group: 'backtest', label: 'Backtest (what really happened)', className: 'border-t-muted bg-bg', tip: 'Uses the real delays from 2026. Not known when the plan is made.' },
];

interface Props {
  rows: PlannerRow[] | undefined;
  total: number;
  page: number;
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

export function TurnaroundTable({ rows, total, page, sort, order, selected, fetching, onSort, onPage, onOpen, style, empty }: Props) {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const first = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const last = Math.min(total, page * PAGE_SIZE);
  const stickyCell = (c: Column) => (c.sticky ? { position: 'sticky' as const, left: c.sticky, minWidth: c.width, maxWidth: c.width } : { minWidth: c.width });

  return (
    <div className="isolate flex min-h-0 flex-col rounded-card border bg-surface" style={style}>
      <div className={clsx('min-h-0 flex-1 overflow-auto rounded-t-card transition-opacity', fetching && rows && 'opacity-60')}>
        {rows && rows.length === 0 ? empty : (
        <table className="w-full min-w-[1120px] border-separate border-spacing-0 text-[12px]">
          <thead>
            <tr>
              {GROUPS.map((g) => {
                const span = COLUMNS.filter((c) => c.group === g.group).length;
                const label = <span className="label text-[10px] text-current">{g.label}</span>;
                return (
                  <th key={g.group} colSpan={span} scope="colgroup"
                    className={clsx('sticky top-0 z-20 h-7 border-b border-t-2 bg-surface px-2 text-left font-normal', g.className)}>
                    {g.tip ? (
                      <Tooltip content={g.tip} align="right"><span tabIndex={0} className="focus-ring cursor-help rounded">{label}</span></Tooltip>
                    ) : label}
                  </th>
                );
              })}
            </tr>
            <tr>
              {COLUMNS.map((c) => {
                const active = c.sort === sort;
                const next = active ? (order === 'asc' ? 'desc' : 'asc') : (c.firstOrder ?? 'asc');
                const Arrow = !active ? ArrowUpDown : order === 'asc' ? ArrowUp : ArrowDown;
                const content = <span className={clsx('whitespace-nowrap', active && 'text-ink')}>{c.label}</span>;
                return (
                  <th
                    key={c.key}
                    scope="col"
                    aria-sort={active ? (order === 'asc' ? 'ascending' : 'descending') : undefined}
                    style={stickyCell(c)}
                    className={clsx(
                      'sticky top-7 z-20 h-9 border-b px-2 font-medium text-muted',
                      c.group === 'backtest' ? 'bg-bg' : 'bg-surface',
                      c.sticky && 'z-30',
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
                  {COLUMNS.map((c) => <td key={c.key} className="border-b px-2 py-2.5"><span className="skeleton block h-3" /></td>)}
                </tr>
              ))
              : rows.map((r) => {
                const isSelected = r.turn_id === selected;
                return (
                  <tr key={r.turn_id} onClick={() => onOpen(r.turn_id)} className="group cursor-pointer">
                    {COLUMNS.map((c) => (
                      <td
                        key={c.key}
                        style={stickyCell(c)}
                        className={clsx(
                          'border-b px-2 py-2 text-ink',
                          isSelected ? 'bg-amber-soft' : c.group === 'backtest' ? 'bg-bg' : 'bg-surface group-hover:bg-bg',
                          c.sticky && 'z-10',
                          c.align === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : 'text-left',
                        )}
                      >
                        {c.key === 'chain' ? (
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
