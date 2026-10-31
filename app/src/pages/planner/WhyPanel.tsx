import clsx from 'clsx';
import { Card } from '../../components/Card';
import { RiskChip } from '../../components/RiskChip';
import type { PlannerBreakdown } from '../../lib/api';
import { formatNumber } from '../../lib/format';
import { reasonInfo } from '../../../shared/planner';

interface Props {
  breakdown: PlannerBreakdown | undefined;
  thresholdMin: number | null | undefined;
}

/** Reason counts and risk bands for the current filters, and how the engine decides. */
export function WhyPanel({ breakdown, thresholdMin }: Props) {
  const max = Math.max(1, ...(breakdown?.reasons ?? []).map((r) => r.turnarounds));
  return (
    <Card title="Why the engine chose these" className="min-h-0 flex-1">
      <div className="grid min-h-0 flex-1 gap-5 overflow-y-auto px-4 pb-4 md:grid-cols-3 2xl:block 2xl:space-y-5">
        <section>
          <h3 className="label mb-2">Reasons</h3>
          {!breakdown ? (
            <div className="space-y-2">{Array.from({ length: 5 }, (_, i) => <span key={i} className="skeleton block h-6" />)}</div>
          ) : breakdown.reasons.length === 0 ? (
            <p className="text-[13px] text-muted">No turnarounds.</p>
          ) : (
            <ul className="space-y-2">
              {breakdown.reasons.map((r) => {
                const info = reasonInfo(r.reason_code);
                return (
                  <li key={r.reason_code} title={r.reason_code}>
                    <div className="flex items-baseline justify-between gap-2 text-[12px]">
                      <span className="truncate text-ink">{info.short}</span>
                      <span className="num shrink-0 text-muted">{formatNumber(r.turnarounds)}</span>
                    </div>
                    <span className="mt-0.5 block h-1.5 overflow-hidden rounded-full bg-bg" aria-hidden="true">
                      <span className={clsx('block h-full rounded-full', info.added ? 'bg-amber' : 'bg-muted')} style={{ width: `${(r.turnarounds / max) * 100}%` }} />
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="mt-2 flex gap-3 text-[11px] text-muted">
            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-amber" aria-hidden="true" />buffer added</span>
            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-muted" aria-hidden="true" />no buffer</span>
          </p>
        </section>

        <section>
          <h3 className="label mb-2">Risk band</h3>
          {!breakdown ? (
            <span className="skeleton block h-20" />
          ) : (
            <ul className="space-y-2">
              {breakdown.risk_bands.map((b) => (
                <li key={b.risk_band} className="flex items-center gap-2 text-[12px]">
                  <RiskChip band={b.risk_band} className="w-16 justify-center" />
                  <span className="num w-12 text-right text-ink">{formatNumber(b.turnarounds)}</span>
                  <span className="text-muted">
                    <span className="num font-medium text-amber">{formatNumber(b.with_buffer)}</span> get buffer
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <p className="self-start rounded-control bg-bg p-3 text-[12px] leading-relaxed text-ink">
          The engine gives buffer where the plane is likely to be late <em>and</em> the turnaround is long enough to absorb it.
          {thresholdMin != null && <> Below about {formatNumber(thresholdMin)} minutes of ground time, a few extra minutes absorb almost nothing.</>}
        </p>
      </div>
    </Card>
  );
}
