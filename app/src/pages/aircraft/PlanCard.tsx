import type { ReactNode } from 'react';
import { Card } from '../../components/Card';
import type { AircraftDay } from '../../lib/api';
import { formatNumber } from '../../lib/format';

function Stat({ label, value, backtest }: { label: string; value: ReactNode; backtest?: boolean }) {
  return (
    <div className={backtest ? 'rounded-control bg-bg px-2.5 py-1.5' : 'px-2.5 py-1.5'}>
      <dt className="text-[11px] text-muted">{label}</dt>
      <dd className="num text-[16px] font-semibold text-ink">{value}</dd>
    </div>
  );
}

export function PlanCard({ day }: { day: AircraftDay }) {
  const t = day.totals;
  return (
    <Card title="This aircraft's plan">
      <div className="px-4 pb-4">
        <p className="rounded-control border-l-2 border-amber bg-amber-soft px-3 py-2 text-[13px] leading-relaxed text-ink">{day.plan_sentence}</p>
        <dl className="mt-3 grid grid-cols-2 gap-1.5 2xl:grid-cols-3">
          <Stat label="Turnarounds" value={formatNumber(t.turnarounds)} />
          <Stat label="Buffer added" value={<>{formatNumber(t.buffer_min)} <span className="text-[12px] font-normal text-muted">min</span></>} />
          <Stat label="Expected absorbed" value={<>{formatNumber(t.expected_absorbed_min, 1)} <span className="text-[12px] font-normal text-muted">min</span></>} />
          <Stat backtest label="Backtest: absorbed" value={<>{formatNumber(t.realised_absorbed_min, 1)} <span className="text-[12px] font-normal text-muted">min</span></>} />
          <Stat backtest label="Backtest: late dep. avoided" value={formatNumber(t.late_departures_avoided)} />
          <Stat label="Stops with buffer" value={`${formatNumber(t.buffered_turnarounds)} of ${formatNumber(t.turnarounds)}`} />
        </dl>
        <p className="mt-2 text-[11px] text-muted">Shaded figures are the backtest: what really happened in 2026, not known when the plan is made.</p>
      </div>
    </Card>
  );
}
