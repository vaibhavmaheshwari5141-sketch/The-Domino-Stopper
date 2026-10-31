import clsx from 'clsx';
import type { ReactNode } from 'react';
import { InfoTip } from '../../components/Tooltip';
import type { SimStrategyRow } from '../../lib/api';
import { formatMultiplier, formatNumber, formatPercent } from '../../lib/format';
import { ENGINE, EVEN } from '../../../shared/simulator';

function Tile({ label, value, sub, tip, hero }: { label: string; value: ReactNode; sub: ReactNode; tip: string; hero?: boolean }) {
  return (
    <div className={clsx('flex min-w-0 flex-col rounded-card border bg-surface px-4 py-3', hero && 'border-amber')}>
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-medium leading-tight text-muted">{label}</span>
        <InfoTip label={`About ${label}`} align="right">{tip}</InfoTip>
      </div>
      <span className={clsx('num mt-1 text-[26px] font-semibold leading-tight', hero ? 'text-amber' : 'text-ink')}>{value}</span>
      <span className="mt-0.5 text-[12px] leading-snug text-muted">{sub}</span>
    </div>
  );
}

export function HeadlineTiles({ rows }: { rows: SimStrategyRow[] | undefined }) {
  if (!rows) {
    return <div className="grid grid-cols-2 gap-3 wide:grid-cols-4">{Array.from({ length: 4 }, (_, i) => <span key={i} className="skeleton block h-[92px] rounded-card" />)}</div>;
  }
  const engine = rows.find((r) => r.strategy === ENGINE);
  const even = rows.find((r) => r.strategy === EVEN);
  return (
    <div className="grid grid-cols-2 gap-3 wide:grid-cols-4">
      <Tile hero label="Engine uplift" value={formatMultiplier(even?.engine_vs_this)}
        sub={<>more delay absorbed than spreading evenly · 95% range {formatNumber(even?.engine_vs_this_ci95_low, 2)}–{formatNumber(even?.engine_vs_this_ci95_high, 2)}</>}
        tip="Delay absorbed by the engine divided by delay absorbed when the same minutes are spread evenly. The range comes from re-drawing whole days." />
      <Tile label="Delay absorbed by the engine" value={<>{formatNumber(engine?.absorbed_min)}<span className="text-[14px] font-normal text-muted"> min</span></>}
        sub={`${formatPercent(engine?.pct_removed != null ? engine.pct_removed / 100 : null, 2)} of passed-on delay removed`}
        tip="Minutes of knock-on delay the engine's buffer stops over the period, and that as a share of all delay passed between flights." />
      <Tile label="Late departures avoided" value={formatNumber(engine?.late_avoided_per_1000, 1)} sub="per 1,000 turnarounds (engine)"
        tip="Outbound flights moved from 15+ minutes late to under 15 minutes late, per 1,000 turnarounds." />
      <Tile label="Share of the hindsight ceiling" value={formatPercent(engine?.share_of_hindsight, 0)} sub="of what perfect foresight would absorb"
        tip="Engine result divided by the Hindsight strategy, which knows the real delays and cannot exist in practice." />
    </div>
  );
}
