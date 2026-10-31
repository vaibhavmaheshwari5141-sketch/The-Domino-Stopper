// Risk Forecast state in the URL: date range, airport, heatmap metric and the day of the "riskiest turnarounds" table.
import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

export const PERIOD = { start: '2026-01-01', end: '2026-08-31' };
export const DEFAULT_DAY = '2026-03-15';

export type HeatMetric = 'p_late15' | 'pred_inbound_delay_min';

export interface RiskState {
  start: string;
  end: string;
  airport: string | null;
  metric: HeatMetric;
  day: string;
}

const isDate = (v: string | null): v is string => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);

function parse(sp: URLSearchParams): RiskState {
  const start = isDate(sp.get('start')) ? sp.get('start')! : PERIOD.start;
  const end = isDate(sp.get('end')) ? sp.get('end')! : PERIOD.end;
  return {
    start,
    end: end < start ? start : end,
    airport: /^[A-Z]{3}$/.test(sp.get('airport') ?? '') ? sp.get('airport') : null,
    metric: sp.get('metric') === 'delay' ? 'pred_inbound_delay_min' : 'p_late15',
    day: isDate(sp.get('day')) ? sp.get('day')! : DEFAULT_DAY,
  };
}

function serialise(s: RiskState): URLSearchParams {
  const out = new URLSearchParams();
  if (s.start !== PERIOD.start) out.set('start', s.start);
  if (s.end !== PERIOD.end) out.set('end', s.end);
  if (s.airport) out.set('airport', s.airport);
  if (s.metric !== 'p_late15') out.set('metric', 'delay');
  if (s.day !== DEFAULT_DAY) out.set('day', s.day);
  return out;
}

export function useRiskState(): [RiskState, (patch: Partial<RiskState>) => void] {
  const [sp, setSp] = useSearchParams();
  const state = useMemo(() => parse(sp), [sp]);
  const update = useCallback((patch: Partial<RiskState>) => setSp((prev) => serialise({ ...parse(prev), ...patch }), { replace: true }), [setSp]);
  return [state, update];
}

/** The eight test months as quick picks: first and last day of each. */
export const MONTHS = Array.from({ length: 8 }, (_, i) => {
  const m = String(i + 1).padStart(2, '0');
  const last = new Date(Date.UTC(2026, i + 1, 0)).getUTCDate();
  return { key: `2026-${m}`, start: `2026-${m}-01`, end: `2026-${m}-${last}` };
});
