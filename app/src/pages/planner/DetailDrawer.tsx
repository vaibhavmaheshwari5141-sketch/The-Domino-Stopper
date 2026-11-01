import clsx from 'clsx';
import { Check, Plane, X } from 'lucide-react';
import { type ReactNode, useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ErrorState } from '../../components/ErrorState';
import { RiskChip } from '../../components/RiskChip';
import { formatDayLong, formatNumber } from '../../lib/format';
import { ESTIMATE_HELP } from '../../../shared/kpis';
import { usePlannerDetail } from '../../lib/queries';
import { FlightChain } from './FlightChain';
import { PassThroughChart } from './PassThroughChart';

interface Props {
  turnId: string;
  budget: number;
  onClose: () => void;
  /** Show the "Open aircraft day" button (hidden on the Aircraft Day page itself). */
  showAircraftLink?: boolean;
}

function Section({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <section className={clsx('border-b px-5 py-4', className)}>
      <h3 className="label mb-2">{title}</h3>
      {children}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] text-muted">{label}</dt>
      <dd className="num text-[15px] font-semibold text-ink">{value}</dd>
    </div>
  );
}

/** One turnaround: recommendation, reasons, pass-through curve, budget sensitivity and backtest. Slides in from the right. */
export function DetailDrawer({ turnId, budget, onClose, showAircraftLink = true }: Props) {
  // The current filters (without the open drawer) travel along, so Aircraft Day can link straight back to this view
  const location = useLocation();
  const from = new URLSearchParams(location.search);
  from.delete('turn');

  const { data, isPending, isError, error, refetch, isFetching } = usePlannerDetail(turnId, budget);
  const closeRef = useRef<HTMLButtonElement>(null);

  // Focus the close button on open, close on Escape, and give focus back to where it was
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previous?.focus();
    };
  }, [onClose]);

  const tr = data?.turnaround;
  return (
    <div className="fixed inset-0 z-50">
      <button type="button" aria-label="Close details" tabIndex={-1} onClick={onClose} className="absolute inset-0 cursor-default bg-[rgb(20_32_48/0.25)]" />
      <aside role="dialog" aria-modal="true" aria-labelledby="drawer-title"
        className="absolute right-0 top-0 flex h-full w-[420px] max-w-full animate-drawer-in flex-col bg-surface shadow-2xl">
        <header className="flex items-start gap-3 border-b px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 id="drawer-title" className="text-[14px] text-ink">
              {tr ? <FlightChain inboundFlight={tr.inbound_flight_no} from={tr.inbound_from} airport={tr.airport} outboundFlight={tr.outbound_flight_no} to={tr.outbound_to} />
                : <span className="skeleton block h-4 w-56" />}
            </h2>
            {tr && (
              <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-muted">
                <span className="num text-ink">{tr.tail_number}</span>·<span>{formatDayLong(tr.flight_date)}</span>·
                <span className="font-semibold text-ink">{tr.airport}</span>
                <RiskChip band={tr.risk_band} />
              </p>
            )}
          </div>
          <button ref={closeRef} type="button" aria-label="Close" onClick={onClose}
            className="focus-ring -mr-1 rounded-control p-1 text-muted hover:bg-bg hover:text-ink">
            <X size={18} aria-hidden="true" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {isError && !data && <div className="p-5"><ErrorState error={error} onRetry={() => void refetch()} retrying={isFetching} /></div>}
          {isPending && <div className="space-y-3 p-5">{Array.from({ length: 6 }, (_, i) => <span key={i} className="skeleton block h-12" />)}</div>}
          {data && tr && (
            <>
              <Section title="Recommendation">
                <dl className="grid grid-cols-3 gap-3">
                  <Stat label="Extra ground time" value={tr.recommended_extra_min > 0
                    ? <span className="text-amber">+{tr.recommended_extra_min} min</span> : <span className="text-muted">None</span>} />
                  <Stat label="New ground time" value={`${formatNumber(tr.recommended_extra_min > 0 ? tr.new_ground_min : tr.current_ground_min)} min`} />
                  <Stat label="Expected prevented" value={`${formatNumber(tr.expected_absorbed_min, 1)} min`} />
                </dl>
                <p className="mt-1.5 text-[11px] text-muted">
                  Expected minutes: midpoint of the curve view and the model view, across the aircraft's whole day.
                </p>
                {tr.chain_multiplier !== null && (
                  <p className="mt-2 rounded-control bg-teal-soft px-2.5 py-1.5 text-[12px] text-ink">
                    Chain multiplier <span className="num font-semibold">{formatNumber(tr.chain_multiplier, 2)}</span>: 1 minute saved here is worth
                    about {formatNumber(tr.chain_multiplier, 1)} minutes across the aircraft's day{tr.protects_later_flights ? ', so this stop protects later flights' : ''}.
                  </p>
                )}
                <p className="mt-3 text-[13px] leading-relaxed text-ink">{data.reason_sentence}</p>
                {tr.segment && <p className="mt-1 text-[12px] text-muted">Segment: {tr.segment}</p>}
                {tr.day_rank !== null && <p className="mt-1 text-[12px] text-muted">Rank {formatNumber(tr.day_rank)} of the day at {budget} min per turnaround.</p>}
              </Section>

              <Section title="Why">
                <ul className="list-disc space-y-1 pl-4 text-[13px] leading-relaxed text-ink marker:text-muted">
                  {data.why.map((w) => <li key={w}>{w}</li>)}
                </ul>
              </Section>

              <Section title={`Pass-through curve · ${data.curve_label}`}>
                <PassThroughChart curve={data.curve} current={tr.current_ground_min} next={tr.recommended_extra_min > 0 ? tr.new_ground_min : null} />
              </Section>

              <Section title="How it changes with the budget">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="text-muted">
                      <th className="pb-1 text-left font-medium">Budget</th>
                      <th className="pb-1 text-right font-medium">Extra</th>
                      <th className="pb-1 text-right font-medium">Expected prevented</th>
                      <th className="pb-1 text-right font-medium">Rank</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.budgets.map((b) => (
                      <tr key={b.budget_scenario} className={clsx(b.budget_scenario === budget && 'bg-amber-soft font-semibold')}>
                        <td className="num rounded-l px-1 py-1">{b.budget_scenario} min</td>
                        <td className="num px-1 py-1 text-right">{b.recommended_extra_min > 0 ? `+${b.recommended_extra_min} min` : '–'}</td>
                        <td className="num px-1 py-1 text-right">{b.recommended_extra_min > 0 ? `${formatNumber(b.expected_absorbed_min, 1)} min` : '–'}</td>
                        <td className="num rounded-r px-1 py-1 text-right">{b.day_rank ?? '–'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Section>

              <Section title="Estimated with real 2026 delays" className="bg-bg">
                <dl className="grid grid-cols-2 gap-3">
                  <Stat label="Actual inbound delay" value={`${formatNumber(tr.actual_inbound_delay_min)} min`} />
                  <Stat label="Actual outbound delay" value={`${formatNumber(tr.actual_outbound_delay_min)} min`} />
                  <Stat label="Prevented, curve view" value={`${formatNumber(tr.realised_absorbed_min, 1)} min`} />
                  {tr.realised_absorbed_resp_min !== null && <Stat label="Prevented, model view" value={`${formatNumber(tr.realised_absorbed_resp_min, 1)} min`} />}
                  <Stat label="Late departure avoided" value={tr.late_avoided_flag
                    ? <span className="inline-flex items-center gap-1 text-success"><Check size={15} aria-hidden="true" />Yes</span> : 'No'} />
                </dl>
                <p className="mt-2 text-[11px] text-muted">{ESTIMATE_HELP} Not known when the plan is made.</p>
              </Section>
            </>
          )}
        </div>

        {tr && showAircraftLink && (
          <footer className="border-t px-5 py-3">
            <Link
              to={`/aircraft-day?${new URLSearchParams({ tail: tr.tail_number ?? '', date: tr.flight_date, budget: String(budget), from: from.toString() })}`}
              className="focus-ring inline-flex h-9 w-full items-center justify-center gap-2 rounded-control bg-navy text-[13px] font-semibold text-white hover:brightness-110"
            >
              <Plane size={15} aria-hidden="true" /> Open aircraft day
            </Link>
          </footer>
        )}
      </aside>
    </div>
  );
}
