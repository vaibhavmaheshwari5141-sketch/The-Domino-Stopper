import clsx from 'clsx';
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Card } from '../../components/Card';
import { ErrorState } from '../../components/ErrorState';
import type { RiskHeatCell, RiskHeatmap as Heatmap } from '../../lib/api';
import { formatMinutes, formatNumber, formatPercent } from '../../lib/format';
import { useRiskHeatmap } from '../../lib/queries';
import { heatColor } from './heat';
import type { HeatMetric } from './useRiskState';

interface Props {
  start: string;
  end: string;
  metric: HeatMetric;
  airport: string | null;
  onAirport: (airport: string | null) => void;
}

const HOURS = Array.from({ length: 19 }, (_, i) => i + 5);       // 05 to 23, local time

const valueText = (metric: HeatMetric, v: number | null, digits = 1) =>
  metric === 'p_late15' ? formatPercent(v, digits) : formatMinutes(v, digits);

interface Hover {
  cell: RiskHeatCell | { airport: string; hour: number; turnarounds: 0; value: null };
  rect: DOMRect;
}

export function RiskHeatmap({ start, end, metric, airport, onAirport }: Props) {
  const { data, isError, error, refetch, isFetching } = useRiskHeatmap(start, end, metric);
  const [hover, setHover] = useState<Hover | null>(null);
  const label = metric === 'p_late15' ? 'Late chance' : 'Predicted inbound delay';

  return (
    <Card title={<>Risk heatmap <span className="font-normal text-muted">· {label.toLowerCase()} by airport and departure hour (local)</span></>}>
      <div className="px-4 pb-4">
        {isError && !data ? <ErrorState error={error} onRetry={() => void refetch()} retrying={isFetching} />
          : !data ? <span className="skeleton block h-[480px]" />
            : <Grid data={data} metric={metric} airport={airport} onAirport={onAirport} onHover={setHover} />}
        <p className="mt-2 text-[11px] text-muted">
          Risk climbs through the day and differs by airport. The 20 busiest airports in the chosen dates; blank cells have fewer than{' '}
          {data?.min_turnarounds ?? 30} turnarounds. Click a row to filter the page to that airport.
        </p>
      </div>
      {hover && createPortal(<HeatTip hover={hover} metric={metric} min={data?.min_turnarounds ?? 30} />, document.body)}
    </Card>
  );
}

function Grid({ data, metric, airport, onAirport, onHover }: {
  data: Heatmap; metric: HeatMetric; airport: string | null; onAirport: (a: string | null) => void; onHover: (h: Hover | null) => void;
}) {
  const byKey = new Map(data.cells.map((c) => [`${c.airport}|${c.hour}`, c]));
  const values = data.cells.map((c) => c.value).filter((v): v is number => v !== null);
  const lo = values.length ? Math.min(...values) : 0;
  const hi = values.length ? Math.max(...values) : 1;
  const scale = (v: number) => (hi > lo ? (v - lo) / (hi - lo) : 0.5);

  if (!data.airports.length) return <p className="py-10 text-center text-[13px] text-muted">No turnarounds in these dates.</p>;

  return (
    <>
      <div className="mb-2 flex flex-wrap items-center gap-2 text-[11px] text-muted">
        <span>Low</span>
        <span className="num">{valueText(metric, lo, 0)}</span>
        <span className="h-2.5 w-40 rounded-full" aria-hidden="true"
          style={{ background: 'linear-gradient(to right, var(--color-teal-soft), var(--color-amber), var(--color-critical))' }} />
        <span className="num">{valueText(metric, hi, 0)}</span>
        <span>High</span>
        <span className="ml-3 inline-flex items-center gap-1"><span className="h-2.5 w-3.5 rounded-sm border bg-bg" aria-hidden="true" />too few turnarounds</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] table-fixed border-separate border-spacing-[2px] text-[10px]" onMouseLeave={() => onHover(null)}>
          <thead>
            <tr>
              <th scope="col" className="w-[64px] text-left font-medium text-muted"><span className="sr-only">Airport</span></th>
              {HOURS.map((h) => <th key={h} scope="col" className="num font-normal text-muted">{String(h).padStart(2, '0')}</th>)}
            </tr>
          </thead>
          <tbody>
            {data.airports.map(({ airport: ap, turnarounds }) => {
              const selected = ap === airport;
              return (
                <tr key={ap} onClick={() => onAirport(selected ? null : ap)} className="cursor-pointer">
                  <th scope="row" className="text-left">
                    <button type="button" aria-pressed={selected} title={`${formatNumber(turnarounds)} turnarounds. Click to ${selected ? 'clear' : 'filter to'} ${ap}.`}
                      onClick={(e) => { e.stopPropagation(); onAirport(selected ? null : ap); }}
                      className={clsx('focus-ring num w-full rounded px-1 py-0.5 text-left text-[11px] font-semibold',
                        selected ? 'bg-amber-soft text-ink ring-1 ring-amber' : 'text-ink hover:bg-bg')}>
                      {ap}
                    </button>
                  </th>
                  {HOURS.map((h) => {
                    const cell = byKey.get(`${ap}|${h}`);
                    const v = cell?.value ?? null;
                    const t = v === null ? 0 : scale(v);
                    return (
                      <td
                        key={h}
                        aria-label={`${ap} ${String(h).padStart(2, '0')}:00, ${v === null ? 'too few turnarounds' : valueText(metric, v)}, ${formatNumber(cell?.turnarounds ?? 0)} turnarounds`}
                        onMouseEnter={(e) => onHover({ cell: cell ?? { airport: ap, hour: h, turnarounds: 0, value: null }, rect: e.currentTarget.getBoundingClientRect() })}
                        className={clsx('num h-[22px] rounded-[3px] text-center leading-[22px]', v === null && 'bg-bg text-line', selected && 'outline outline-1 outline-amber')}
                        style={v === null ? undefined : { background: heatColor(t), color: t > 0.62 ? 'var(--color-surface)' : 'var(--color-ink)' }}
                      >
                        {v === null ? '' : metric === 'p_late15' ? Math.round(v * 100) : Math.round(v)}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-1 text-[10px] text-muted">Cell numbers: {metric === 'p_late15' ? 'late chance in %' : 'predicted inbound delay in minutes'}. Hours are local departure time.</p>
    </>
  );
}

/** One tooltip for the whole grid, placed below the hovered cell (above when there is no room). */
function HeatTip({ hover, metric, min }: { hover: Hover; metric: HeatMetric; min: number }) {
  const { cell, rect } = hover;
  const below = rect.bottom + 90 < window.innerHeight;
  const left = Math.min(Math.max(8, rect.left + rect.width / 2 - 110), window.innerWidth - 228);
  return (
    <div role="tooltip" className="pointer-events-none fixed z-[60] w-[220px] rounded-control border bg-surface px-3 py-2 text-xs shadow-lg"
      style={{ left, top: below ? rect.bottom + 6 : rect.top - 6, transform: below ? undefined : 'translateY(-100%)' }}>
      <p className="font-semibold text-ink">{cell.airport} · {String(cell.hour).padStart(2, '0')}:00 local</p>
      {cell.value === null ? (
        <p className="text-muted">{cell.turnarounds ? `Only ${formatNumber(cell.turnarounds)} turnarounds (under ${min}), not shown` : 'No turnarounds'}</p>
      ) : (
        <>
          <p className="text-ink">{metric === 'p_late15' ? 'Late chance' : 'Predicted inbound delay'} <span className="num font-semibold">{valueText(metric, cell.value)}</span></p>
          <p className="text-muted"><span className="num">{formatNumber(cell.turnarounds)}</span> turnarounds</p>
        </>
      )}
    </div>
  );
}
