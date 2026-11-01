import { useEffect, useId, useState } from 'react';
import { CartesianGrid, Line, LineChart, ReferenceArea, ReferenceDot, ResponsiveContainer, XAxis, YAxis } from 'recharts';
import { Card } from '../../components/Card';
import { ErrorState } from '../../components/ErrorState';
import { axisProps, chartColors, gridProps } from '../../lib/chart';
import { formatNumber } from '../../lib/format';
import { useAbsorption, usePropagationCurve, useSegmentCurves } from '../../lib/queries';
import { CALC_LIMITS } from '../../../shared/propagation';
import { type PropagationState, SINGLE_CURVE } from './usePropagationState';

type Limit = (typeof CALC_LIMITS)[keyof typeof CALC_LIMITS];

/** A slider with a number box beside it; both clamp to the limit. */
function MinutesInput({ label, value, limit, onChange }: { label: string; value: number; limit: Limit; onChange: (v: number) => void }) {
  const id = useId();
  const set = (raw: string) => {
    const n = Number(raw);
    if (raw.trim() !== '' && Number.isFinite(n)) onChange(Math.round(Math.min(limit.max, Math.max(limit.min, n))));
  };
  return (
    <div>
      <label htmlFor={id} className="text-[13px] font-medium text-ink">{label}</label>
      <div className="mt-1 flex items-center gap-3">
        <input type="range" min={limit.min} max={limit.max} step={1} value={value} onChange={(e) => set(e.target.value)} aria-label={label}
          aria-valuetext={`${value} minutes`} className="h-1.5 min-w-0 flex-1 cursor-pointer accent-[var(--color-amber)]" />
        <span className="flex items-center gap-1">
          <input id={id} type="number" inputMode="numeric" min={limit.min} max={limit.max} step={1} value={value} onChange={(e) => set(e.target.value)}
            className="focus-ring num h-8 w-16 rounded-control border bg-surface px-2 text-right text-[13px] text-ink" />
          <span className="text-[12px] text-muted">min</span>
        </span>
      </div>
    </div>
  );
}

/** The value after `ms` without changes, so dragging a slider sends one request when it settles. */
function useSettled<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return settled;
}

function Big({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className={accent ? 'rounded-control bg-amber-soft px-3 py-2' : 'rounded-control border px-3 py-2'}>
      <dt className="text-[11px] text-muted">{label}</dt>
      <dd className="num text-[26px] font-semibold leading-tight text-ink">{value}</dd>
      {sub && <dd className="text-[11px] text-muted">{sub}</dd>}
    </div>
  );
}

/** "What would extra ground time buy?" Reads the smoothed curve through /api/propagation/calculate. */
export function Calculator({ state, update }: { state: PropagationState; update: (patch: Partial<PropagationState>) => void }) {
  const segments = useSegmentCurves().data?.segments;
  // A segment name the data does not have (an old link) falls back to the single curve
  const curveName = state.calcCurve === SINGLE_CURVE || !segments || segments.some((s) => s.segment === state.calcCurve) ? state.calcCurve : SINGLE_CURVE;
  const inputs = useSettled({ ground: state.ground, inbound: state.inbound, extra: state.extra }, 150);
  const { data, isError, error, refetch, isFetching } = useAbsorption(inputs.ground, inputs.inbound, inputs.extra, curveName);
  const single = usePropagationCurve().data;
  const chosen = curveName === SINGLE_CURVE ? single?.points : segments?.find((s) => s.segment === curveName)?.points;
  const xMax = Math.max(300, Math.ceil((state.ground + state.extra) / 30) * 30);
  const points = chosen?.length ? [...chosen, { ground_min: xMax, pass_through: chosen[chosen.length - 1].pass_through }] : [];
  const m = (v: number) => `${formatNumber(v, 1)} min`;

  return (
    <Card title="What would extra ground time buy?">
      <div className="grid grid-cols-1 gap-5 px-4 pb-4 wide:grid-cols-[minmax(0,5fr)_minmax(0,4fr)]">
        <div className="flex flex-col gap-4">
          <label className="flex flex-wrap items-center gap-2 text-[13px] font-medium text-ink">
            Curve
            <select value={curveName} onChange={(e) => update({ calcCurve: e.target.value })}
              className="focus-ring h-8 rounded-control border bg-surface px-2 text-[13px] font-normal text-ink">
              <option value={SINGLE_CURVE}>Single curve (v1)</option>
              {segments?.map((s) => <option key={s.segment} value={s.segment}>v2: {s.segment.replace(' | ', ', ')}</option>)}
            </select>
            <span className="text-[12px] font-normal text-muted">pick an airport type and time of day to use engine v2's curve for that segment</span>
          </label>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <MinutesInput label="Planned ground time" value={state.ground} limit={CALC_LIMITS.ground_min} onChange={(ground) => update({ ground })} />
            <MinutesInput label="Inbound delay" value={state.inbound} limit={CALC_LIMITS.inbound_delay_min} onChange={(inbound) => update({ inbound })} />
            <MinutesInput label="Extra buffer" value={state.extra} limit={CALC_LIMITS.extra_min} onChange={(extra) => update({ extra })} />
          </div>
          {isError && !data ? <ErrorState error={error} onRetry={() => void refetch()} retrying={isFetching} /> : !data ? <span className="skeleton block h-32" /> : (
            <div aria-live="polite">
              <dl className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <Big label="Delay passed on now" value={m(data.delay_passed_on_now)} sub={`pass-through ${formatNumber(data.pass_through_now, 2)} at ${data.ground_min} min`} />
                <Big label="Passed on with the buffer" value={m(data.delay_passed_on_after)} sub={`pass-through ${formatNumber(data.pass_through_after, 2)} at ${data.new_ground_min} min`} />
                <Big accent label="Delay absorbed" value={m(data.delay_absorbed)}
                  sub={`absorbs ${formatNumber(data.delay_absorbed, 1)} of ${formatNumber(data.inbound_delay_min)} minutes`} />
              </dl>
              <p className="mt-3 text-[14px] text-ink">{data.sentence}</p>
            </div>
          )}
          <p className="text-[11px] text-muted">
            Uses {curveName === SINGLE_CURVE ? 'the single smoothed curve' : `engine v2's curve for ${curveName.replace(' | ', ', ')}`} from the training period.
            Real results vary from turnaround to turnaround.
          </p>
        </div>

        <figure className="min-w-0">
          <figcaption className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted">
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-tarmac" aria-hidden="true" />now</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-amber" aria-hidden="true" />with the buffer</span>
          </figcaption>
          <div className="mt-1 h-52" role="img" aria-label={data ? `Pass-through ${formatNumber(data.pass_through_now, 2)} at ${data.ground_min} minutes and ${formatNumber(data.pass_through_after, 2)} at ${data.new_ground_min} minutes` : 'Pass-through curve'}>
            {!points.length ? <span className="skeleton block h-full" /> : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={points} margin={{ top: 10, right: 10, bottom: 0, left: -12 }}>
                  <CartesianGrid {...gridProps} />
                  <XAxis type="number" dataKey="ground_min" domain={[0, xMax]} ticks={[0, 60, 120, 180, 240, 300].concat(xMax > 300 ? [xMax] : [])} {...axisProps}
                    tickFormatter={(v: number) => `${v}`} />
                  <YAxis {...axisProps} width={40} domain={[0, 1.1]} ticks={[0, 0.5, 1]} tickFormatter={(v: number) => formatNumber(v, 1)} />
                  {data && data.extra_min > 0 && <ReferenceArea x1={data.ground_min} x2={data.new_ground_min} fill={chartColors.amber} fillOpacity={0.12} />}
                  <Line dataKey="pass_through" type="linear" stroke={chartColors.amber} strokeOpacity={0.6} strokeWidth={2} dot={false} isAnimationActive={false} />
                  {data && <ReferenceDot x={data.ground_min} y={data.pass_through_now} r={5} fill={chartColors.tarmac} stroke={chartColors.surface} strokeWidth={1.5} />}
                  {data && <ReferenceDot x={data.new_ground_min} y={data.pass_through_after} r={5} fill={chartColors.amber} stroke={chartColors.surface} strokeWidth={1.5} />}
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
          <p className="text-center text-[11px] text-muted">Planned ground time (min) → pass-through</p>
        </figure>
      </div>
    </Card>
  );
}
