import { Info, Trophy } from 'lucide-react';
import type { ReactNode } from 'react';
import { ErrorState } from '../../components/ErrorState';
import { InfoTip } from '../../components/Tooltip';
import { ApiError, type AirportProfile } from '../../lib/api';
import { formatCompact, formatMinutes, formatNumber, formatPercent } from '../../lib/format';
import { useAirportProfile } from '../../lib/queries';

function Tile({ label, value, network, tip }: { label: string; value: ReactNode; network: ReactNode; tip: string }) {
  return (
    <div className="flex min-w-0 flex-col rounded-card border bg-surface px-3.5 py-2.5">
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-medium leading-tight text-muted">{label}</span>
        <InfoTip label={`About ${label}`} align="right">{tip}</InfoTip>
      </div>
      <span className="num mt-1 text-[22px] font-semibold leading-tight text-ink">{value}</span>
      <span className="mt-0.5 text-[11px] text-muted">{network}</span>
    </div>
  );
}

const NOT_ENOUGH = <span className="text-[14px] font-normal text-muted">Not enough data</span>;

/** Header ("DFW · Dallas/Fort Worth, TX", Top 10, rank) and the six KPI tiles with the network beside each. */
export function AirportOverview({ code }: { code: string }) {
  const { data, isPending, isError, error, refetch, isFetching } = useAirportProfile(code);

  if (isError && !data) {
    return error instanceof ApiError && error.status === 404 ? (
      <p className="flex items-center gap-2 rounded-card border bg-surface p-4 text-[13px] text-ink">
        <Info size={16} className="text-teal" aria-hidden="true" /> {code} is not one of the airports in the data. Pick an airport from the list.
      </p>
    ) : <ErrorState title={`Could not load ${code}`} error={error} onRetry={() => void refetch()} retrying={isFetching} />;
  }
  if (isPending || !data) {
    return (
      <div className="space-y-3">
        <span className="skeleton block h-8 w-80" />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-6">{Array.from({ length: 6 }, (_, i) => <span key={i} className="skeleton block h-[84px] rounded-card" />)}</div>
      </div>
    );
  }
  return <ProfileView p={data} />;
}

function ProfileView({ p }: { p: AirportProfile }) {
  const a = p.airport;
  const n = p.network;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 className="text-[20px] font-semibold text-navy"><span className="num">{a.airport}</span> · {a.city}</h2>
        {a.is_top10 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-soft px-2 py-0.5 text-[11px] font-semibold text-amber">
            <Trophy size={12} aria-hidden="true" /> Top 10
          </span>
        )}
        <span className="num text-[13px] text-muted">
          #{formatNumber(p.ranks.departures)} of {formatNumber(p.ranks.airports)} by departures
          {p.ranks.late_rate !== null && <> · #{formatNumber(p.ranks.late_rate)} of {formatNumber(p.ranks.late_rate_airports)} by late rate</>}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-6">
        <Tile label="Departures" value={formatCompact(a.departures)}
          network={<>network average {formatCompact(n.avg_departures_per_airport)} per airport</>}
          tip={`${formatNumber(a.departures)} scheduled departures, Jan 2025 to Aug 2026.`} />
        <Tile label="Departure late rate" value={formatPercent(a.dep_late15_rate)} network={<>network {formatPercent(n.dep_late15_rate)}</>}
          tip="Share of operated departures that left 15 or more minutes late." />
        <Tile label="Average arrival delay" value={formatMinutes(a.avg_arr_delay_min, 1)} network={<>network {formatMinutes(n.avg_arr_delay_min, 1)}</>}
          tip="Average arrival delay of flights landing here (early arrivals count as negative)." />
        <Tile label="Median planned ground time" value={formatMinutes(a.median_ground_min)} network={<>network median {formatMinutes(n.median_ground_min)}</>}
          tip="Typical planned time between an aircraft's scheduled arrival and its next scheduled departure here." />
        <Tile label="Short-turn share" value={formatPercent(a.short_turn_share)} network={<>network {formatPercent(n.short_turn_share)}</>}
          tip="Share of turnarounds with 55 minutes or less of planned ground time." />
        <Tile label="Pass-through" value={a.pass_through === null ? NOT_ENOUGH : formatNumber(a.pass_through, 2)}
          network={<>network {n.pass_through === null ? 'not enough data' : formatNumber(n.pass_through, 2)}</>}
          tip="Pass-through = minutes of outbound delay for each minute of inbound delay. 1.0 means all of it is passed on. Measured only in months with at least 200 late inbound flights." />
      </div>
    </div>
  );
}
