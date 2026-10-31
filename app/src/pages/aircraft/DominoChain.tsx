import clsx from 'clsx';
import { Timer, Unlink } from 'lucide-react';
import { Fragment, type ReactNode } from 'react';
import { FloatingTip } from '../../components/FloatingTip';
import { RiskChip } from '../../components/RiskChip';
import type { AircraftDay, AircraftFlight, AircraftTurn } from '../../lib/api';
import { formatNumber, formatPercent, formatTimeUtc } from '../../lib/format';
import { flightNo, reasonInfo } from '../../../shared/planner';
import { formatDelay } from './delay';
import { DelayChip } from './DelayChip';

interface Props {
  day: AircraftDay;
  selectedTurn: string | null;
  onOpenTurn: (turnId: string) => void;
}

const time = (v: string | null) => (v ? formatTimeUtc(v) : '––:––');

function TipLines({ lines }: { lines: (ReactNode | null)[] }) {
  return <div className="space-y-0.5">{lines.filter(Boolean).map((l, i) => <p key={i} className={i === 0 ? 'font-semibold' : undefined}>{l}</p>)}</div>;
}

/** Short connector line between two links of the chain (horizontal on wide screens, vertical on narrow ones). */
const Joint = () => <span aria-hidden="true" className="mx-auto block h-3 w-px shrink-0 bg-line md:mx-0 md:h-px md:w-3 md:self-center" />;

function FlightTile({ flight, n, turns }: { flight: AircraftFlight; n: number; turns: AircraftTurn[] }) {
  const lands = flight.arrives_turn !== null ? turns[flight.arrives_turn] : null;
  return (
    <FloatingTip
      content={
        <TipLines lines={[
          `${flightNo(flight.flight_no)} · ${flight.from ?? '–'} → ${flight.to ?? '–'}`,
          `Scheduled: departs ${flight.sched_dep_utc ? `${time(flight.sched_dep_utc)} UTC` : 'not in the data'}, arrives ${flight.sched_arr_utc ? `${time(flight.sched_arr_utc)} UTC` : 'not in the data'}`,
          `Actual: departure delay ${formatDelay(flight.dep_delay_min)}, arrival delay ${formatDelay(flight.arr_delay_min)}`,
          lands ? `Lands at the ${lands.airport} stop` : null,
        ]} />
      }
    >
      <li tabIndex={0} className="focus-ring w-full shrink-0 rounded-card border bg-surface px-3 py-2.5 shadow-sm md:w-[172px]">
        <div className="flex items-baseline justify-between gap-2">
          <span className="num text-[13px] font-semibold text-ink">{flightNo(flight.flight_no)}</span>
          <span className="label text-[10px]">Flight {n}</span>
        </div>
        <p className="mt-0.5 text-[13px] text-ink">
          {flight.from ?? '–'} <span className="text-muted">→</span> {flight.to ?? '–'}
        </p>
        <p className="num text-[11px] text-muted">{time(flight.sched_dep_utc)} – {time(flight.sched_arr_utc)} UTC</p>
        <div className="mt-1.5 flex flex-wrap gap-1">
          {flight.dep_delay_min !== null && <DelayChip label="dep" minutes={flight.dep_delay_min} />}
          {flight.arr_delay_min !== null && <DelayChip label="arr" minutes={flight.arr_delay_min} />}
          {flight.dep_delay_min === null && flight.arr_delay_min === null && <span className="text-[11px] text-muted">No actual times</span>}
        </div>
      </li>
    </FloatingTip>
  );
}

function TurnConnector({ turn, n, total, selected, onOpen }: { turn: AircraftTurn; n: number; total: number; selected: boolean; onOpen: () => void }) {
  const buffered = turn.recommended_extra_min > 0;
  const reason = reasonInfo(turn.reason_code);
  return (
    <li className="w-full shrink-0 md:w-[160px]">
      <FloatingTip
        content={
          <TipLines lines={[
            `${turn.airport} · stop ${n} of ${total}`,
            `Planned ground ${formatNumber(turn.sched_ground_min)} min (arrives ${time(turn.sched_inbound_arr_utc)}, leaves ${time(turn.sched_outbound_dep_utc)} UTC)`,
            `Prediction: ${turn.risk_band ?? '–'} risk, late chance ${formatPercent(turn.p_late15, 0)}, inbound delay ${formatNumber(turn.pred_inbound_delay_min, 1)} min`,
            buffered
              ? `Engine: +${turn.recommended_extra_min} min → ${formatNumber(turn.new_ground_min)} min ground, expects to absorb ${formatNumber(turn.expected_absorbed_min, 1)} min`
              : `Engine: no buffer (${reason.short.toLowerCase()})`,
            `Backtest: inbound ${formatDelay(turn.actual_inbound_delay_min)}, outbound ${formatDelay(turn.actual_outbound_delay_min)}${buffered ? `, absorbed ${formatNumber(turn.realised_absorbed_min, 1)} min${turn.late_avoided_flag ? ', late departure avoided' : ''}` : ''}`,
            'Click for the full details.',
          ]} />
        }
      >
        <button
          type="button"
          onClick={onOpen}
          aria-label={`Stop ${n} at ${turn.airport}: open details`}
          className={clsx(
            'focus-ring h-full w-full rounded-card px-3 py-2 text-left transition-colors',
            buffered ? 'border-2 border-dashed border-amber bg-surface hover:bg-amber-soft' : 'border bg-bg hover:bg-teal-soft',
            selected && 'ring-2 ring-teal',
          )}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1 text-[15px] font-semibold text-ink">
              {turn.airport}
              {turn.very_short_turn_flag && <Timer size={13} className="text-warning" aria-label="Very short turn" />}
            </span>
            <RiskChip band={turn.risk_band} />
          </div>
          <p className="num text-[11px] text-muted">{formatNumber(turn.sched_ground_min)} min ground</p>
          <p className="mt-1 text-[11px] text-ink">Late chance <span className="num font-semibold">{formatPercent(turn.p_late15, 0)}</span></p>
          <p className="text-[11px] text-ink">Pred. inbound <span className="num font-semibold">{formatNumber(turn.pred_inbound_delay_min, 1)} min</span></p>
          {buffered ? (
            <p className="mt-1 text-[12px] font-bold text-amber">
              +{turn.recommended_extra_min} min buffer
              <span className="num block text-[11px] font-normal text-muted">→ {formatNumber(turn.new_ground_min)} min ground</span>
            </p>
          ) : (
            <p className="mt-1 text-[11px] text-muted">{reason.short}</p>
          )}
        </button>
      </FloatingTip>
    </li>
  );
}

function BreakMarker({ arrivedAt, nextAirport }: { arrivedAt: string | null; nextAirport: string }) {
  return (
    <li className="flex shrink-0 items-center justify-center gap-2 px-1 py-1 text-center md:w-[92px] md:flex-col md:py-0">
      <Unlink size={14} className="text-critical" aria-hidden="true" />
      <span className="text-[11px] font-semibold text-critical">Break in chain</span>
      <span className="text-[10px] leading-tight text-muted">landed {arrivedAt ?? '?'}, next stop {nextAirport}</span>
    </li>
  );
}

export function DominoChain({ day, selectedTurn, onOpenTurn }: Props) {
  return (
    <div className="overflow-x-auto pb-2">
      <ol className="flex flex-col md:w-max md:flex-row md:items-stretch" aria-label={`${day.tail_number}: flights and stops in order`}>
        {day.chain.map((item, i) => (
          <Fragment key={i}>
            {i > 0 && <Joint />}
            {item.type === 'flight' && <FlightTile flight={day.flights[item.index]} n={item.index + 1} turns={day.turnarounds} />}
            {item.type === 'turnaround' && (
              <TurnConnector
                turn={day.turnarounds[item.index]}
                n={item.index + 1}
                total={day.turnarounds.length}
                selected={day.turnarounds[item.index].turn_id === selectedTurn}
                onOpen={() => onOpenTurn(day.turnarounds[item.index].turn_id)}
              />
            )}
            {item.type === 'break' && <BreakMarker arrivedAt={item.arrived_at} nextAirport={item.next_airport} />}
          </Fragment>
        ))}
      </ol>
    </div>
  );
}

export function ChainLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-muted">
      <span className="flex items-center gap-1">Risk: <RiskChip band="High" /> <RiskChip band="Medium" /> <RiskChip band="Low" /></span>
      <span className="flex items-center gap-1">Actual delay: <DelayChip minutes={-5} /> <DelayChip minutes={25} /> <DelayChip minutes={75} /></span>
      <span className="flex items-center gap-1.5">
        <span className="inline-block h-3.5 w-6 rounded border-2 border-dashed border-amber" aria-hidden="true" /> engine adds buffer here
      </span>
      <span className="flex items-center gap-1"><Unlink size={12} className="text-critical" aria-hidden="true" /> break in chain (stops do not connect)</span>
    </div>
  );
}
