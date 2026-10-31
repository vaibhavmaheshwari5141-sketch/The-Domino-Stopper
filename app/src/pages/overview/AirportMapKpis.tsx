import clsx from 'clsx';
import { formatCompact, formatMinutes, formatNumber, formatPercent } from '../../lib/format';
import type { MapTotals } from './airportMapFilters';

interface Props {
  totals: MapTotals;
  totalAirports: number;
  budget: number;
  planPeriod: string | null;
  updating: boolean;
}

/** KPI tiles for the airports on the focused map; they follow every filter. */
export function AirportMapKpis({ totals: k, totalAirports, budget, planPeriod, updating }: Props) {
  const noPlan = k.absorbed_min === null;
  const tiles: { label: string; value: string; sub: string; accent?: boolean }[] = [
    { label: 'Airports shown', value: formatNumber(k.airports), sub: `of ${totalAirports} · ${formatNumber(k.high)} high impact` },
    { label: 'Departures', value: formatCompact(k.departures), sub: 'scheduled in the period' },
    { label: 'Late departures', value: formatPercent(k.late_departure_rate), sub: '15+ min late, weighted by flights' },
    { label: 'Knock-on delay', value: `${formatCompact(k.knock_on_min)} min`, sub: `${formatMinutes(k.knock_on_per_turn_min, 1)} per turnaround` },
    {
      label: 'Delay absorbed by engine', accent: true,
      value: noPlan ? '–' : `${formatCompact(k.absorbed_min)} min`,
      sub: noPlan ? 'no engine plan in this period' : `from ${formatCompact(k.buffer_min)} min of buffer at ${budget} min`,
    },
    {
      label: 'Late departures avoided', accent: true,
      value: noPlan ? '–' : formatNumber(k.late_avoided),
      sub: noPlan ? 'engine plan covers the test period' : (planPeriod ?? 'engine plan'),
    },
  ];
  return (
    <div className={clsx('grid grid-cols-2 gap-2 transition-opacity md:grid-cols-3 wide:grid-cols-6', updating && 'opacity-60')} aria-live="polite">
      {tiles.map((t) => (
        <div key={t.label} className={clsx('min-w-0 rounded-card border bg-surface px-3 py-2', t.accent && 'border-amber')}>
          <p className="truncate text-[12px] font-medium text-muted">{t.label}</p>
          <p className={clsx('num text-xl font-semibold leading-tight', t.accent ? 'text-amber' : 'text-ink')}>{t.value}</p>
          <p className="truncate text-[11px] text-muted" title={t.sub}>{t.sub}</p>
        </div>
      ))}
    </div>
  );
}
