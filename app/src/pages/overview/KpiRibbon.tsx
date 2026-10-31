import clsx from 'clsx';
import { InfoTip } from '../../components/Tooltip';
import type { Kpi, OverviewKpiName, OverviewResponse } from '../../lib/api';
import { EMPTY, formatCompact, formatMinutes, formatMultiplier, formatNumber, formatPercent } from '../../lib/format';

type Kpis = OverviewResponse['kpis'];

interface Tile {
  kpi: OverviewKpiName;
  label: string;
  value: (k: Kpis) => string;
  sub: (k: Kpis) => string;
  hero?: boolean;
}

const val = (k: Kpis, name: OverviewKpiName) => k[name]?.value ?? null;

const TILES: Tile[] = [
  {
    kpi: 'scheduled_flights', label: 'Flights analysed',
    value: (k) => formatCompact(val(k, 'scheduled_flights')),
    sub: (k) => k.scheduled_flights?.period?.replace(' - ', ' – ') ?? EMPTY,
  },
  { kpi: 'late_arrival_rate', label: 'Late-arrival rate', value: (k) => formatPercent(val(k, 'late_arrival_rate')), sub: () => '15+ min late' },
  {
    kpi: 'absorption_threshold', label: 'Absorption threshold',
    value: (k) => (val(k, 'absorption_threshold') === null ? EMPTY : `~${formatMinutes(val(k, 'absorption_threshold'))}`),
    sub: () => 'delay passes on below this',
  },
  {
    kpi: 'late_warning_auc', label: 'Late-warning AUC',
    value: (k) => formatNumber(val(k, 'late_warning_auc'), 2),
    sub: (k) => `baseline ${formatNumber(val(k, 'late_warning_auc_baseline'), 2)}`,
  },
  {
    kpi: 'engine_uplift_vs_even', label: 'Engine uplift', hero: true,
    value: (k) => formatMultiplier(val(k, 'engine_uplift_vs_even')),
    sub: (k) => `vs spreading evenly, 95% range ${formatNumber(val(k, 'engine_uplift_vs_even_ci_low'), 2)}–${formatNumber(val(k, 'engine_uplift_vs_even_ci_high'), 2)}`,
  },
  {
    kpi: 'engine_late_avoided_per_1000', label: 'Late departures avoided',
    value: (k) => formatNumber(val(k, 'engine_late_avoided_per_1000'), 1),
    sub: () => 'per 1,000 turnarounds',
  },
];

function About({ kpi, label, align }: { kpi: Kpi | null; label: string; align: 'left' | 'center' | 'right' }) {
  return (
    <InfoTip label={`About ${label}`} align={align}>
      <span className="block">{kpi?.definition ?? 'No definition available.'}</span>
      {kpi?.period && <span className="num mt-1 block text-muted">{kpi.period}</span>}
    </InfoTip>
  );
}

export function KpiRibbon({ kpis }: { kpis: Kpis | undefined }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 wide:grid-cols-6">
      {TILES.map((tile, i) => (
        <div
          key={tile.kpi}
          className={clsx('flex min-w-0 flex-col rounded-card border bg-surface px-4 py-3', tile.hero && 'border-amber')}
        >
          <div className="flex items-start justify-between gap-2">
            <span className="text-xs font-medium leading-tight text-muted">{tile.label}</span>
            {kpis && <About kpi={kpis[tile.kpi]} label={tile.label} align={i === 0 ? 'left' : i >= TILES.length - 2 ? 'right' : 'center'} />}
          </div>
          {kpis ? (
            <>
              <span className={clsx('num mt-1 text-[26px] font-semibold leading-tight', tile.hero ? 'text-amber' : 'text-ink')}>
                {tile.value(kpis)}
              </span>
              <span className="mt-0.5 line-clamp-2 text-[12px] leading-snug text-muted">{tile.sub(kpis)}</span>
            </>
          ) : (
            <>
              <span className="skeleton mt-2 h-7 w-20" />
              <span className="skeleton mt-2 h-3 w-28" />
            </>
          )}
        </div>
      ))}
    </div>
  );
}
