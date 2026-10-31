import type { ReactNode } from 'react';
import { InfoTip } from '../../components/Tooltip';
import type { RiskSummary } from '../../lib/api';
import { formatDate, formatMinutes, formatNumber, formatPercent } from '../../lib/format';

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

export function RiskTiles({ summary }: { summary: RiskSummary | undefined }) {
  if (!summary) {
    return <div className="grid grid-cols-2 gap-3 wide:grid-cols-4">{Array.from({ length: 4 }, (_, i) => <span key={i} className="skeleton block h-[88px] rounded-card" />)}</div>;
  }
  const s = summary;
  const scope = `${formatDate(s.start)} – ${formatDate(s.end)}${s.airport ? ` · ${s.airport}` : ''}`;
  return (
    <div className="grid grid-cols-2 gap-3 wide:grid-cols-4">
      <Tile label="Turnarounds" value={formatNumber(s.turnarounds)} sub={scope}
        tip="Stops where the same aircraft lands and leaves again on the same day, in the chosen dates and airport." />
      <Tile label="Late chance: predicted vs actual"
        value={<>{formatPercent(s.avg_late_chance)}<span className="text-[14px] font-normal text-muted"> vs {formatPercent(s.actual_late_share)}</span></>}
        sub="average predicted chance of a 15+ min late departure, and the share that really was"
        tip="If the two numbers are close, the forecast's probabilities can be read at face value." />
      <Tile label="High-risk turnarounds" value={formatNumber(s.high)}
        sub={`${formatPercent(s.turnarounds ? s.high / s.turnarounds : null)} of turnarounds · Medium ${formatNumber(s.medium)} · Low ${formatNumber(s.low)}`}
        tip="Turnarounds in the riskiest band. Bands are cut from the late chance: High is the top 30%, Low the bottom 30%." />
      <Tile label="Average predicted inbound delay" value={formatMinutes(s.avg_pred_inbound_delay_min, 1)}
        sub="how late the arriving aircraft is expected to be"
        tip="Mean predicted arrival delay of the inbound aircraft. This is the delay a turnaround may pass on." />
    </div>
  );
}
