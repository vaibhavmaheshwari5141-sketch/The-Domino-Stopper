import clsx from 'clsx';
import { CheckCircle2, XCircle } from 'lucide-react';
import type { ReactNode } from 'react';
import { Money } from '../../components/Money';
import { InfoTip } from '../../components/Tooltip';
import type { Kpi, KpiCatalogRow, OverviewKpiName, OverviewResponse } from '../../lib/api';
import { EMPTY, formatCompact, formatNumber, formatPercent } from '../../lib/format';
import { MAIN_KPI_HELP, MODE_HELP, NET_VALUE_HELP, VIEW_HELP } from '../../../shared/kpis';

type Kpis = OverviewResponse['kpis'];

interface Tile {
  key: string;
  label: string;
  value: (k: Kpis, guardrails: KpiCatalogRow[]) => ReactNode;
  sub: (k: Kpis) => ReactNode;
  /** KPI rows whose definitions make up the tooltip (and any extra lines). */
  about: (k: Kpis, guardrails: KpiCatalogRow[]) => ReactNode;
  hero?: boolean;
}

const val = (k: Kpis, name: OverviewKpiName) => k[name]?.value ?? null;
/** Separator or unit inside a value: smaller, so a range fits a tile at 1280 px. */
const Small = ({ children }: { children: ReactNode }) => <span className="text-[0.62em] font-normal text-muted">{children}</span>;
/** "+0.65": a signed number of percentage points, without the unit (the tile says pp once). */
const signed = (v: number | null) => (v === null ? EMPTY : `${v > 0 ? '+' : ''}${formatNumber(v, 2)}`);

function Defs({ kpis }: { kpis: (Kpi | null)[] }) {
  return (
    <>
      {kpis.filter(Boolean).map((kpi) => <span key={kpi!.kpi_name} className="mb-1 block">{kpi!.definition}</span>)}
      {kpis[0]?.period && <span className="num block text-muted">{kpis[0].period}</span>}
    </>
  );
}

/** Guardrail value as the catalogue states it: shares as percentages, budget_respected as Always / Not always. */
function guardrailValue(r: KpiCatalogRow): string {
  if (r.kpi_name === 'budget_respected') return r.value_v2 === 1 ? 'always' : r.value_v2 === null ? EMPTY : 'not always';
  return formatPercent(r.value_v2, 0);
}

const TILES: Tile[] = [
  {
    key: 'flights', label: 'Flights analysed',
    value: (k) => formatCompact(val(k, 'scheduled_flights')),
    sub: (k) => k.scheduled_flights?.period?.replace(' - ', ' – ') ?? EMPTY,
    about: (k) => <Defs kpis={[k.scheduled_flights]} />,
  },
  {
    key: 'per100', label: 'Delay prevented per 100 buffer min', hero: true,
    value: (k) => <>{formatNumber(val(k, 'engine_prevented_per_100'), 1)}<Small>–</Small>{formatNumber(val(k, 'engine_prevented_per_100_resp'), 1)}</>,
    sub: () => 'curve view – model view',
    about: (k) => (
      <>
        <span className="mb-1 block font-semibold">{MAIN_KPI_HELP}</span>
        <span className="mb-1 block">{VIEW_HELP.curve}</span>
        <span className="mb-1 block">{VIEW_HELP.model}</span>
        <span className="mb-1 block">{VIEW_HELP.range}</span>
        {k.engine_prevented_per_100?.period && <span className="num block text-muted">{k.engine_prevented_per_100.period}</span>}
      </>
    ),
  },
  {
    key: 'otp', label: 'On-time departures',
    value: (k) => <>{signed(val(k, 'engine_otp_change_pp'))}<Small> to </Small>{signed(val(k, 'engine_otp_change_pp_resp'))}</>,
    sub: () => 'pp (percentage points), curve view to model view',
    about: (k) => <><Defs kpis={[k.engine_otp_change_pp, k.engine_otp_change_pp_resp]} /><span className="mt-1 block">{VIEW_HELP.range}</span></>,
  },
  {
    key: 'realloc', label: 'Reallocate, net value',
    value: (k) => <><Money value={val(k, 'realloc_net_value_usd')} /><Small>–</Small><Money value={val(k, 'realloc_net_value_usd_resp')} /></>,
    sub: (k) => `with no added buffer · ${formatCompact(val(k, 'realloc_minutes_moved'))} min moved`,
    about: (k) => (
      <>
        <span className="mb-1 block">{MODE_HELP.reallocate}</span>
        <span className="mb-1 block">{NET_VALUE_HELP} Reallocation adds no buffer, so it costs nothing.</span>
        <Defs kpis={[k.realloc_net_value_usd, k.realloc_net_value_usd_resp]} />
      </>
    ),
  },
  {
    key: 'auc', label: 'Late-warning AUC',
    value: (k) => formatNumber(val(k, 'late_warning_auc'), 3),
    sub: (k) => `v1 ${formatNumber(val(k, 'late_warning_auc_v1'), 3)}`,
    about: (k) => <Defs kpis={[k.late_warning_auc, k.late_warning_auc_v1]} />,
  },
  {
    key: 'guardrails', label: 'Guardrails',
    value: (_, g) => {
      const met = g.length > 0 && g.every((r) => r.target_met === true);
      return g.length === 0 ? EMPTY : (
        <span className={clsx('inline-flex items-center gap-1.5', met ? 'text-success' : 'text-critical')}>
          {met ? <CheckCircle2 size={22} aria-hidden="true" /> : <XCircle size={22} aria-hidden="true" />}
          {met ? 'All met' : `${g.filter((r) => r.target_met !== true).length} not met`}
        </span>
      );
    },
    sub: () => 'eligible turns, airport share, budget',
    about: (_, g) => (
      <ul className="space-y-1">
        {g.map((r) => (
          <li key={r.kpi_name}>
            <span className={r.target_met ? 'font-semibold text-success' : 'font-semibold text-critical'}>{r.target_met ? 'Met' : 'Not met'}: </span>
            {r.kpi_label}: <span className="num">{guardrailValue(r)}</span> <span className="text-muted">(target {r.target})</span>
          </li>
        ))}
      </ul>
    ),
  },
];

export function KpiRibbon({ kpis, guardrails }: { kpis: Kpis | undefined; guardrails: KpiCatalogRow[] | undefined }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 wide:grid-cols-6">
      {TILES.map((tile, i) => (
        <div key={tile.key} className={clsx('flex min-w-0 flex-col rounded-card border bg-surface px-4 py-3', tile.hero && 'border-amber')}>
          <div className="flex items-start justify-between gap-2">
            <span className="text-xs font-medium leading-tight text-muted">{tile.label}</span>
            {kpis && (
              <InfoTip label={`About ${tile.label}`} align={i === 0 ? 'left' : i >= TILES.length - 2 ? 'right' : 'center'}>
                {tile.about(kpis, guardrails ?? [])}
              </InfoTip>
            )}
          </div>
          {kpis ? (
            <>
              <span className={clsx('num mt-1 overflow-hidden whitespace-nowrap text-[clamp(15px,1.4vw,22px)] font-semibold leading-tight', tile.hero ? 'text-amber' : 'text-ink')}>
                {tile.value(kpis, guardrails ?? [])}
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
