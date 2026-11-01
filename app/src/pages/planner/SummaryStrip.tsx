import clsx from 'clsx';
import { AlertTriangle } from 'lucide-react';
import type { ReactNode } from 'react';
import { InfoTip } from '../../components/Tooltip';
import type { PlannerSummary } from '../../lib/api';
import { formatDayLong, formatNumber, formatPercent } from '../../lib/format';
import { ESTIMATE_HELP } from '../../../shared/kpis';

function Tile({ label, value, sub, tip, backtest, children }: {
  label: string; value: ReactNode; sub?: ReactNode; tip: string; backtest?: boolean; children?: ReactNode;
}) {
  return (
    <div className={clsx('flex min-w-0 flex-col rounded-card border px-3.5 py-2.5', backtest ? 'bg-bg' : 'bg-surface')}>
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-medium leading-tight text-muted">{label}</span>
        <InfoTip label={`About ${label}`} align="right">{tip}</InfoTip>
      </div>
      <span className="num mt-1 text-[20px] font-semibold leading-tight text-ink">{value}</span>
      {children}
      {sub && <span className="mt-0.5 truncate text-[11px] text-muted">{sub}</span>}
    </div>
  );
}

export function SummaryStrip({ summary }: { summary: PlannerSummary | undefined }) {
  if (!summary) {
    return (
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 wide:grid-cols-6">
        {Array.from({ length: 6 }, (_, i) => <span key={i} className="skeleton block h-[78px] rounded-card" />)}
      </div>
    );
  }
  const s = summary;
  const usedShare = s.budget_min > 0 ? s.buffer_used_min / s.budget_min : 0;
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <h2 className="text-sm font-semibold text-ink">
          {formatDayLong(s.date)}
          <span className="font-normal text-muted"> · {s.airport ?? 'All airports'} · {s.budget} min per turnaround</span>
        </h2>
        {s.is_disruption_day && (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-soft px-2 py-px text-[11px] font-semibold text-amber">
            <AlertTriangle size={12} aria-hidden="true" /> Disruption day
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 wide:grid-cols-6">
        <Tile label="Turnarounds" value={formatNumber(s.turnarounds)} sub="aircraft stops between two flights"
          tip="Stops where the same aircraft lands and leaves again on the same day." />
        <Tile label="Receiving buffer" value={formatNumber(s.turnarounds_with_buffer)} sub={`${formatPercent(s.turnarounds ? s.turnarounds_with_buffer / s.turnarounds : null)} of turnarounds`}
          tip="Turnarounds the optimisation engine gives at least one extra minute." />
        <Tile label="Buffer used vs budget" value={<>{formatNumber(s.buffer_used_min)}<span className="text-[13px] font-normal text-muted"> min</span></>}
          sub={`of ${formatNumber(s.budget_min)} min ${s.airport ? "(airport's share)" : "budget"} · ${formatPercent(usedShare)}`}
          tip={s.airport
            ? 'Extra minutes given at this airport, against its share of the budget (turnarounds x budget). The engine shares the budget across the whole network, so one airport can use more or less than its share.'
            : 'Extra minutes the engine gives out, against the day\'s budget (turnarounds x minutes per turnaround). It never goes over.'}>
          <span className="mt-1.5 block h-1 overflow-hidden rounded-full bg-line" aria-hidden="true">
            <span className={clsx('block h-full rounded-full', usedShare > 1 ? 'bg-warning' : 'bg-amber')} style={{ width: `${Math.min(100, usedShare * 100)}%` }} />
          </span>
        </Tile>
        <Tile label="Expected delay prevented" value={<>{formatNumber(s.expected_absorbed_min, 1)}<span className="text-[13px] font-normal text-muted"> min</span></>}
          sub="midpoint of the two views"
          tip="Minutes of delay the buffer is expected to prevent across each aircraft's day: the midpoint of the curve view and the model view, from the predicted delays." />
        <Tile backtest label="Estimated with real 2026 delays" value={<>{formatNumber(s.realised_absorbed_min, 1)}<span className="text-[13px] font-normal text-muted"> min</span></>}
          sub="delay prevented, curve view" tip={`Minutes of delay the buffer would have prevented across each aircraft's day with the actual 2026 delays (curve view). ${ESTIMATE_HELP}`} />
        <Tile backtest label="Late departures avoided" value={formatNumber(s.late_departures_avoided)}
          sub="estimated with real 2026 delays" tip={`Departures that left 15+ minutes late in reality, and would have left on time with this buffer. ${ESTIMATE_HELP}`} />
      </div>
    </div>
  );
}
