import type { ReactNode } from 'react';
import { ErrorState } from '../../components/ErrorState';
import { InfoTip } from '../../components/Tooltip';
import { formatNumber } from '../../lib/format';
import { usePropagationKpis } from '../../lib/queries';

function Tile({ label, value, sub, tip }: { label: string; value: ReactNode; sub: ReactNode; tip: string }) {
  return (
    <div className="flex min-w-0 flex-col rounded-card border bg-surface px-4 py-3">
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-medium leading-tight text-muted">{label}</span>
        <InfoTip label={`About ${label}`} align="right">{tip}</InfoTip>
      </div>
      <span className="num mt-1 text-[24px] font-semibold leading-tight text-ink">{value}</span>
      <span className="mt-0.5 text-[12px] leading-snug text-muted">{sub}</span>
    </div>
  );
}

/** "0.28 means about a quarter is passed on" */
function passThroughTip(v: number | null | undefined): string {
  const base = 'For each minute the inbound flight is late, the next departure leaves this many minutes late on average.';
  if (v === null || v === undefined) return base;
  const share = v >= 0.95 ? 'almost all of it is passed on' : v >= 0.7 ? 'most of it is passed on'
    : v >= 0.4 ? 'about half is passed on' : v >= 0.2 ? 'about a quarter is passed on and the rest absorbed on the ground'
      : 'most of it is absorbed on the ground';
  return `${base} ${formatNumber(v, 2)} means ${share}.`;
}

export function PropagationTiles() {
  const { data, isError, error, refetch, isFetching } = usePropagationKpis();
  if (isError && !data) return <ErrorState title="Could not load the headline numbers" error={error} onRetry={() => void refetch()} retrying={isFetching} />;
  if (!data) {
    return <div className="grid grid-cols-2 gap-3 md:grid-cols-3 wide:grid-cols-5">{Array.from({ length: 5 }, (_, i) => <span key={i} className="skeleton block h-[88px] rounded-card" />)}</div>;
  }
  const k = data.kpis;
  const v = (name: keyof typeof k) => k[name]?.value ?? null;
  const threshold = v('absorption_threshold');
  const buildup = v('delay_buildup');
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 wide:grid-cols-5">
      <Tile label="Absorption threshold" value={threshold === null ? '–' : `~${Math.round(threshold)} min`}
        sub="below this, almost all inbound delay is passed on"
        tip={`Planned ground time below which almost all inbound delay is passed on to the next flight (${formatNumber(threshold, 1)} min). Above it, each extra minute starts to absorb delay. Learned on Jan to Sep 2025.`} />
      <Tile label="Pass-through on short turns" value={formatNumber(v('pass_through_short'), 2)} sub="planned ground time up to 55 min"
        tip={passThroughTip(v('pass_through_short'))} />
      <Tile label="Pass-through on medium turns" value={formatNumber(v('pass_through_medium'), 2)} sub="56 to 80 min"
        tip={passThroughTip(v('pass_through_medium'))} />
      <Tile label="Pass-through on long turns" value={formatNumber(v('pass_through_long'), 2)} sub="over 80 min"
        tip={passThroughTip(v('pass_through_long'))} />
      <Tile label="Delay build-up" value={buildup === null ? '–' : `+${formatNumber(buildup, 1)} min`} sub="4th-or-later flight of the day vs the 1st"
        tip="Average departure delay of an aircraft's 4th-or-later flight of the day, minus that of its first flight. Delay not absorbed early is carried along." />
    </div>
  );
}
