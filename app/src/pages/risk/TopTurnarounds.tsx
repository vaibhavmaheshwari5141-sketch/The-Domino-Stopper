import { CalendarClock, Plane } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Card } from '../../components/Card';
import { DatePicker } from '../../components/DatePicker';
import { ErrorState } from '../../components/ErrorState';
import { RiskChip } from '../../components/RiskChip';
import { dayOffset, formatNumber, formatPercent, formatTimeUtc } from '../../lib/format';
import { usePlannerDates, useRiskTopTurnarounds } from '../../lib/queries';
import { DelayChip } from '../aircraft/DelayChip';
import { FlightChain } from '../planner/FlightChain';

interface Props {
  day: string;
  airport: string | null;
  onDay: (day: string) => void;
}

/** The day's 20 riskiest turnarounds by late chance, with links to Aircraft Day and the Buffer Planner. */
export function TopTurnarounds({ day, airport, onDay }: Props) {
  const days = usePlannerDates(5);
  const { data, isError, error, refetch, isFetching } = useRiskTopTurnarounds(day, airport);

  return (
    <Card title="Riskiest turnarounds on a day" aside={<DatePicker value={day} days={days.data} onChange={onDay} />}>
      <div className="overflow-x-auto px-4 pb-4">
        <p className="mb-2 text-[12px] text-muted">
          The 20 turnarounds with the highest predicted late chance{airport ? ` at ${airport}` : ''}, and what really happened. "v1" is the late chance
          from prediction engine version 1, for comparison.
        </p>
        {isError && !data ? <ErrorState error={error} onRetry={() => void refetch()} retrying={isFetching} /> : !data ? <span className="skeleton block h-64" /> : data.length === 0 ? (
          <p className="py-8 text-center text-[13px] text-muted">No turnarounds on this day{airport ? ` at ${airport}` : ''}.</p>
        ) : (
          <table className="w-full min-w-[940px] text-[12px]">
            <thead>
              <tr className="border-b text-left text-muted">
                <th scope="col" className="py-2 pr-2 text-right font-medium">#</th>
                <th scope="col" className="px-2 py-2 font-medium">Flight chain</th>
                <th scope="col" className="px-2 py-2 font-medium">Tail</th>
                <th scope="col" className="px-2 py-2 text-right font-medium">Departs <span className="font-normal">UTC</span></th>
                <th scope="col" className="px-2 py-2 text-right font-medium">Ground</th>
                <th scope="col" className="px-2 py-2 text-center font-medium">Risk</th>
                <th scope="col" className="px-2 py-2 text-right font-medium">Late chance</th>
                <th scope="col" className="px-2 py-2 text-right font-medium" title="Late chance from prediction engine version 1, for comparison">v1</th>
                <th scope="col" className="px-2 py-2 text-right font-medium">Pred. inbound</th>
                <th scope="col" className="bg-bg px-2 py-2 font-medium">What happened</th>
                <th scope="col" className="px-2 py-2 font-medium"><span className="sr-only">Links</span></th>
              </tr>
            </thead>
            <tbody>
              {data.map((r, i) => {
                const next = dayOffset(r.flight_date, r.sched_outbound_dep_utc);
                return (
                  <tr key={r.turn_id} className="border-b last:border-0 hover:bg-bg">
                    <td className="num py-1.5 pr-2 text-right text-muted">{i + 1}</td>
                    <td className="px-2 py-1.5"><FlightChain inboundFlight={r.inbound_flight_no} from={r.inbound_from} airport={r.airport} outboundFlight={r.outbound_flight_no} to={r.outbound_to} /></td>
                    <td className="num px-2 py-1.5">{r.tail_number ?? '–'}</td>
                    <td className="num px-2 py-1.5 text-right">{formatTimeUtc(r.sched_outbound_dep_utc)}{next ? <sup className="ml-0.5 text-[9px] text-muted">+{next}</sup> : null}</td>
                    <td className="num px-2 py-1.5 text-right">{formatNumber(r.sched_ground_min)} min</td>
                    <td className="px-2 py-1.5 text-center"><RiskChip band={r.risk_band} /></td>
                    <td className="num px-2 py-1.5 text-right font-semibold">{formatPercent(r.p_late15)}</td>
                    <td className="num px-2 py-1.5 text-right text-muted">{formatPercent(r.p_late15_v1)}</td>
                    <td className="num px-2 py-1.5 text-right">{formatNumber(r.pred_inbound_delay_min, 1)} min</td>
                    <td className="bg-bg px-2 py-1.5">
                      <span className="flex flex-wrap items-center gap-1">
                        <DelayChip label="dep" minutes={r.actual_outbound_delay_min} />
                        <span className="text-[11px] text-muted">{r.actual_late15 == null ? '' : r.actual_late15 ? 'left late' : 'left on time'}</span>
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-2 py-1.5">
                      {r.tail_number && (
                        <Link to={`/aircraft-day?${new URLSearchParams({ tail: r.tail_number, date: r.flight_date, budget: '5' })}`}
                          aria-label={`Aircraft day for ${r.tail_number}`} title="Open aircraft day"
                          className="focus-ring mr-1 inline-flex h-7 w-7 items-center justify-center rounded-control border bg-surface text-muted hover:text-ink">
                          <Plane size={14} aria-hidden="true" />
                        </Link>
                      )}
                      <Link to={`/buffer-planner?${new URLSearchParams({ date: r.flight_date, turn: r.turn_id })}`}
                        aria-label={`Buffer Planner for ${r.flight_date}, this turnaround`} title="Open in the Buffer Planner"
                        className="focus-ring inline-flex h-7 w-7 items-center justify-center rounded-control border bg-surface text-muted hover:text-ink">
                        <CalendarClock size={14} aria-hidden="true" />
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </Card>
  );
}
