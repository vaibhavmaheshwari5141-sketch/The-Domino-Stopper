// Delay Propagation state in the URL: segment type, delay-by-leg period and the calculator inputs.
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { LEG_PERIODS, type LegPeriod, type SegmentType } from '../../../shared/api-types';
import { CALC_LIMITS } from '../../../shared/propagation';

export const SEGMENT_CHOICES = ['Airport type', 'Time of day', 'Disruption', 'Period'] as const satisfies readonly SegmentType[];
export type SegmentChoice = (typeof SEGMENT_CHOICES)[number];

export interface PropagationState {
  seg: SegmentChoice;
  period: LegPeriod;
  ground: number;
  inbound: number;
  extra: number;
}

type CalcKey = keyof typeof CALC_LIMITS;

function minutes(sp: URLSearchParams, key: string, limit: CalcKey): number {
  const { min, max, fallback } = CALC_LIMITS[limit];
  const raw = sp.get(key);
  const n = raw === null || raw.trim() === '' ? NaN : Number(raw);
  return Number.isFinite(n) ? Math.round(Math.min(max, Math.max(min, n))) : fallback;
}

function parse(sp: URLSearchParams): PropagationState {
  return {
    seg: SEGMENT_CHOICES.find((s) => s === sp.get('seg')) ?? 'Airport type',
    period: LEG_PERIODS.find((p) => p === sp.get('period')) ?? 'all',
    ground: minutes(sp, 'ground', 'ground_min'),
    inbound: minutes(sp, 'delay', 'inbound_delay_min'),
    extra: minutes(sp, 'extra', 'extra_min'),
  };
}

function serialise(s: PropagationState): URLSearchParams {
  const out = new URLSearchParams();
  if (s.seg !== 'Airport type') out.set('seg', s.seg);
  if (s.period !== 'all') out.set('period', s.period);
  if (s.ground !== CALC_LIMITS.ground_min.fallback) out.set('ground', String(s.ground));
  if (s.inbound !== CALC_LIMITS.inbound_delay_min.fallback) out.set('delay', String(s.inbound));
  if (s.extra !== CALC_LIMITS.extra_min.fallback) out.set('extra', String(s.extra));
  return out;
}

export function usePropagationState(): [PropagationState, (patch: Partial<PropagationState>) => void] {
  const [sp, setSp] = useSearchParams();
  const state = useMemo(() => parse(sp), [sp]);
  // setSearchParams' updater sees the params of the last render, so two quick changes (ground, then extra) would lose
  // the first. Build each change on the last params written instead.
  const latest = useRef(sp);
  useEffect(() => {
    latest.current = sp;
  }, [sp]);
  const update = useCallback((patch: Partial<PropagationState>) => {
    latest.current = serialise({ ...parse(latest.current), ...patch });
    setSp(latest.current, { replace: true });
  }, [setSp]);
  return [state, update];
}
