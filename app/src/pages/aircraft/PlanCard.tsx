import type { ReactNode } from 'react';
import { Card } from '../../components/Card';
import type { AircraftDay } from '../../lib/api';
import { formatNumber } from '../../lib/format';
import type { AircraftPlan } from './useAircraftFilters';

function Stat({ label, value, backtest }: { label: string; value: ReactNode; backtest?: boolean }) {
  return (
    <div className={backtest ? 'rounded-control bg-bg px-2.5 py-1.5' : 'px-2.5 py-1.5'}>
      <dt className="text-[11px] text-muted">{label}</dt>
      <dd className="num text-[16px] font-semibold text-ink">{value}</dd>
    </div>
  );
}

const min = (v: number, digits = 0) => <>{formatNumber(v, digits)} <span className="text-[12px] font-normal text-muted">min</span></>;

export function PlanCard({ day, plan }: { day: AircraftDay; plan: AircraftPlan }) {
  const t = day.totals;
  const r = day.reallocation;
  if (plan === 'realloc') {
    return (
      <Card title="This aircraft's reallocation">
        <div className="px-4 pb-4">
          <p className="rounded-control border-l-2 border-teal bg-teal-soft px-3 py-2 text-[13px] leading-relaxed text-ink">{r.sentence}</p>
          <dl className="mt-3 grid grid-cols-2 gap-1.5 2xl:grid-cols-3">
            <Stat label="Minutes moved" value={min(r.minutes_moved)} />
            <Stat label="Net added" value={min(0)} />
            <Stat label="Expected prevented" value={min(r.expected_change_min, 1)} />
            <Stat label="Stops receiving" value={formatNumber(r.receiving)} />
            <Stat label="Stops giving" value={formatNumber(r.giving)} />
            <Stat label="Budget" value={`${formatNumber(r.budget)} min / turn`} />
          </dl>
          <p className="mt-2 text-[11px] text-muted">Reallocation takes minutes from long sits (over 150 min) and gives them to risky stops of the same aircraft. Nothing is added.</p>
        </div>
      </Card>
    );
  }
  return (
    <Card title="This aircraft's plan">
      <div className="px-4 pb-4">
        <p className="rounded-control border-l-2 border-amber bg-amber-soft px-3 py-2 text-[13px] leading-relaxed text-ink">{day.plan_sentence}</p>
        <dl className="mt-3 grid grid-cols-2 gap-1.5 2xl:grid-cols-3">
          <Stat label="Turnarounds" value={formatNumber(t.turnarounds)} />
          <Stat label="Buffer added" value={min(t.buffer_min)} />
          <Stat label="Expected prevented" value={min(t.expected_absorbed_min, 1)} />
          <Stat backtest label="Prevented, real 2026 delays" value={min(t.realised_absorbed_min, 1)} />
          <Stat backtest label="Late dep. avoided" value={formatNumber(t.late_departures_avoided)} />
          <Stat label="Stops with buffer" value={`${formatNumber(t.buffered_turnarounds)} of ${formatNumber(t.turnarounds)}`} />
        </dl>
        <p className="mt-2 text-[11px] text-muted">Shaded figures are estimated with the real 2026 delays (curve view): estimates, not measured savings.</p>
      </div>
    </Card>
  );
}
