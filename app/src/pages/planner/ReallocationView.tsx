import clsx from 'clsx';
import { ArrowLeftRight, SearchX } from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ErrorState } from '../../components/ErrorState';
import { RiskChip } from '../../components/RiskChip';
import { InfoTip, Tooltip } from '../../components/Tooltip';
import type { ReallocationResponse, ReallocationRow } from '../../lib/api';
import { formatDayLong, formatNumber, formatPercent, formatTimeUtc } from '../../lib/format';
import { ESTIMATE_HELP, MODE_HELP, VIEW_HELP } from '../../../shared/kpis';
import { FlightChain } from './FlightChain';

/** "+15 min" (receives, amber) or "−15 min" (gives, teal). */
export function ChangeChip({ minutes }: { minutes: number }) {
  const gives = minutes < 0;
  return (
    <span className={clsx('num inline-flex whitespace-nowrap rounded-full px-2 py-px text-[11px] font-semibold',
      gives ? 'bg-teal-soft text-teal' : 'bg-amber-soft text-amber')}>
      {gives ? '−' : '+'}{formatNumber(Math.abs(minutes))} min
    </span>
  );
}

function Tile({ label, value, sub, tip, estimate }: { label: string; value: ReactNode; sub?: string; tip: ReactNode; estimate?: boolean }) {
  return (
    <div className={clsx('flex min-w-0 flex-col rounded-card border px-3.5 py-2.5', estimate ? 'bg-bg' : 'bg-surface')}>
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-medium leading-tight text-muted">{label}</span>
        <InfoTip label={`About ${label}`} align="right">{tip}</InfoTip>
      </div>
      <span className="num mt-1 text-[20px] font-semibold leading-tight text-ink">{value}</span>
      {sub && <span className="mt-0.5 truncate text-[11px] text-muted">{sub}</span>}
    </div>
  );
}

const min = (v: number, digits = 1) => <>{formatNumber(v, digits)}<span className="text-[13px] font-normal text-muted"> min</span></>;

interface Props {
  data: ReallocationResponse | undefined;
  isError: boolean;
  error: unknown;
  retry: () => void;
  retrying: boolean;
  fetching: boolean;
  style?: CSSProperties;
  onClear: () => void;
}

/** Reallocate mode: the day's summary, then every aircraft that moves minutes, with the stops that give and receive. */
export function ReallocationView({ data, isError, error, retry, retrying, fetching, style, onClear }: Props) {
  const location = useLocation();
  if (isError && !data) return <ErrorState title="Could not load the reallocation plan" error={error} onRetry={retry} retrying={retrying} />;
  const s = data?.summary;
  const tails = new Map<string, ReallocationRow[]>();
  for (const r of data?.rows ?? []) tails.set(r.tail_number, [...(tails.get(r.tail_number) ?? []), r]);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="mb-2 flex items-center gap-2">
          <h2 className="text-sm font-semibold text-ink">
            {data ? formatDayLong(data.date) : '…'}
            <span className="font-normal text-muted"> · {data?.airport ?? 'All airports'} · reallocate at {data?.budget ?? 5} min per turnaround</span>
          </h2>
        </div>
        {!s ? (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 wide:grid-cols-6">{Array.from({ length: 6 }, (_, i) => <span key={i} className="skeleton block h-[78px] rounded-card" />)}</div>
        ) : (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 wide:grid-cols-6">
            <Tile label="Aircraft" value={formatNumber(s.aircraft)} sub={`${formatNumber(s.receiving)} stops receive, ${formatNumber(s.giving)} give`}
              tip={MODE_HELP.reallocate} />
            <Tile label="Minutes moved" value={min(s.minutes_moved, 0)} sub="from long sits to risky stops" tip="Minutes taken from long sits (over 150 min, never below 120) and given to risky stops of the same aircraft." />
            <Tile label="Net added" value={min(s.net_added_min, 0)} sub="nothing added to the schedule" tip="Minutes received minus minutes given. Reallocation only moves minutes, so this is always 0." />
            <Tile label="Expected delay prevented" value={min(s.expected_prevented_min)} sub="midpoint of the two views"
              tip="Expected change in delay prevented: gains at the stops that receive minus losses at the stops that give (midpoint of the curve view and the model view)." />
            <Tile estimate label="Prevented, curve view" value={min(s.realised_prevented_min)} sub="estimated with real 2026 delays"
              tip={<><span className="mb-1 block">{VIEW_HELP.curve}</span>{ESTIMATE_HELP}</>} />
            <Tile estimate label="Prevented, model view" value={min(s.realised_prevented_resp_min)} sub="estimated with real 2026 delays"
              tip={<><span className="mb-1 block">{VIEW_HELP.model}</span>{ESTIMATE_HELP}</>} />
          </div>
        )}
      </div>

      <div className="isolate flex min-h-0 flex-col rounded-card border bg-surface" style={style}>
        <div className={clsx('min-h-0 flex-1 overflow-auto rounded-card transition-opacity', fetching && data && 'opacity-60')}>
          {data && data.rows.length === 0 ? (
            <div className="flex flex-col items-center gap-3 px-4 py-16 text-center">
              <SearchX size={28} className="text-muted" aria-hidden="true" />
              <p className="text-sm font-medium text-ink">No reallocation on this day for these filters</p>
              <button type="button" onClick={onClear} className="focus-ring h-8 rounded-control border bg-surface px-3 text-[13px] font-medium text-ink hover:bg-bg">
                Clear filters
              </button>
            </div>
          ) : (
            <table className="w-full min-w-[980px] border-separate border-spacing-0 text-[12px]">
              <thead>
                <tr className="text-left text-muted">
                  {['Stop', 'Departs UTC', 'Risk', 'Late chance', 'Change', 'Ground time', 'Expected change', 'Prevented, curve view', 'Prevented, model view'].map((h, i) => (
                    <th key={h} scope="col" className={clsx('sticky top-0 z-20 h-9 border-b px-2 font-medium', i >= 6 ? 'bg-bg text-right' : 'bg-surface', i === 1 || i === 3 || i === 5 ? 'text-right' : '', i === 2 || i === 4 ? 'text-center' : '')}>
                      {i === 6 ? <Tooltip content="Expected minutes of delay prevented (midpoint of the two views); negative where a stop gives minutes away." align="right"><span tabIndex={0} className="focus-ring cursor-help rounded">{h}</span></Tooltip>
                        : i >= 7 ? <Tooltip content={ESTIMATE_HELP} align="right"><span tabIndex={0} className="focus-ring cursor-help rounded">{h}</span></Tooltip> : h}
                    </th>
                  ))}
                </tr>
              </thead>
              {!data ? (
                <tbody>{Array.from({ length: 10 }, (_, i) => <tr key={i}><td colSpan={9} className="border-b px-2 py-2.5"><span className="skeleton block h-3" /></td></tr>)}</tbody>
              ) : [...tails].map(([tail, rows]) => {
                const moved = rows.filter((r) => r.change_min > 0).reduce((t, r) => t + r.change_min, 0);
                const expected = rows.reduce((t, r) => t + (r.expected_change_min ?? 0), 0);
                return (
                  <tbody key={tail}>
                    <tr>
                      <th scope="rowgroup" colSpan={9} className="border-b bg-bg px-2 py-1.5 text-left font-normal">
                        <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
                          <span className="num text-[13px] font-semibold text-ink">{tail}</span>
                          <span className="inline-flex items-center gap-1 text-muted"><ArrowLeftRight size={12} aria-hidden="true" />{formatNumber(moved)} min moved · expected {formatNumber(expected, 1)} min prevented</span>
                          <Link to={`/aircraft-day?${new URLSearchParams({ tail, date: data.date, budget: String(data.budget), plan: 'realloc', from: location.search.replace(/^\?/, '') })}`}
                            className="focus-ring rounded text-teal hover:underline">Open aircraft day</Link>
                        </span>
                      </th>
                    </tr>
                    {rows.map((r) => (
                      <tr key={r.turn_id} className="hover:bg-bg">
                        <td className="border-b px-2 py-1.5"><FlightChain inboundFlight={r.inbound_flight_no} from={r.inbound_from} airport={r.airport} outboundFlight={r.outbound_flight_no} to={r.outbound_to} /></td>
                        <td className="num border-b px-2 py-1.5 text-right">{formatTimeUtc(r.sched_outbound_dep_utc)}</td>
                        <td className="border-b px-2 py-1.5 text-center"><RiskChip band={r.risk_band} /></td>
                        <td className="num border-b px-2 py-1.5 text-right">{formatPercent(r.p_late15, 0)}</td>
                        <td className="border-b px-2 py-1.5 text-center"><ChangeChip minutes={r.change_min} /></td>
                        <td className="num border-b px-2 py-1.5 text-right whitespace-nowrap">{formatNumber(r.current_ground_min)} → <span className="font-semibold">{formatNumber(r.new_ground_min)}</span> min</td>
                        <td className={clsx('num border-b bg-bg px-2 py-1.5 text-right', (r.expected_change_min ?? 0) < 0 && 'text-teal')}>{formatNumber(r.expected_change_min, 1)}</td>
                        <td className="num border-b bg-bg px-2 py-1.5 text-right">{formatNumber(r.realised_absorbed_min, 1)}</td>
                        <td className="num border-b bg-bg px-2 py-1.5 text-right">{formatNumber(r.realised_absorbed_resp_min, 1)}</td>
                      </tr>
                    ))}
                  </tbody>
                );
              })}
            </table>
          )}
        </div>
      </div>
      <p className="text-[11px] text-muted">
        <span className="font-semibold text-amber">+ min</span>: the stop receives minutes. <span className="font-semibold text-teal">− min</span>: a long sit gives them.
        Negative expected values at giving stops are real: the long sit gives up a little protection so a riskier stop gains more. {ESTIMATE_HELP}
      </p>
    </div>
  );
}
