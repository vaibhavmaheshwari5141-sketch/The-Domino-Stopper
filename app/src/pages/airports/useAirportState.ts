// Airport Insights state in the URL: selected airport and tab, list filters, chart switches and ranking-table view.
import { useCallback, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PLANNER_BUDGETS, type PlannerBudget } from '../../../shared/planner';

export const LIST_SORTS = [
  { value: 'departures', label: 'Busiest' },
  { value: 'dep_late15_rate', label: 'Most late' },
  { value: 'median_ground_min', label: 'Longest ground time' },
  { value: 'propagated_delay_min', label: 'Most delay passed on' },
] as const;
export type ListSort = (typeof LIST_SORTS)[number]['value'];

export const RANK_COLUMNS = ['departures', 'dep_late15_rate', 'avg_arr_delay_min', 'median_ground_min', 'short_turn_share', 'propagated_delay_min'] as const;
export type RankColumn = (typeof RANK_COLUMNS)[number];

export interface AirportState {
  code: string;
  tab: 'airport' | 'compare';
  q: string;
  sort: ListSort;
  top10: boolean;
  metric: 'rate' | 'minutes';
  budget: PlannerBudget;
  rsort: RankColumn;
  rorder: 'asc' | 'desc';
  rpage: number;
}

function parse(sp: URLSearchParams): AirportState {
  const code = (sp.get('code') ?? '').toUpperCase();
  const budget = Number(sp.get('budget'));
  const page = Number(sp.get('rpage'));
  return {
    code: /^[A-Z]{3}$/.test(code) ? code : 'DFW',
    tab: sp.get('tab') === 'compare' ? 'compare' : 'airport',
    q: (sp.get('q') ?? '').slice(0, 30),
    sort: LIST_SORTS.find((s) => s.value === sp.get('sort'))?.value ?? 'departures',
    top10: sp.get('top10') === '1',
    metric: sp.get('metric') === 'minutes' ? 'minutes' : 'rate',
    budget: (PLANNER_BUDGETS as readonly number[]).includes(budget) ? (budget as PlannerBudget) : 5,
    rsort: RANK_COLUMNS.find((c) => c === sp.get('rsort')) ?? 'departures',
    rorder: sp.get('rorder') === 'asc' ? 'asc' : 'desc',
    rpage: Number.isInteger(page) && page > 0 ? page : 1,
  };
}

function serialise(s: AirportState): URLSearchParams {
  const out = new URLSearchParams();
  out.set('code', s.code);
  if (s.tab !== 'airport') out.set('tab', s.tab);
  if (s.q) out.set('q', s.q);
  if (s.sort !== 'departures') out.set('sort', s.sort);
  if (s.top10) out.set('top10', '1');
  if (s.metric !== 'rate') out.set('metric', s.metric);
  if (s.budget !== 5) out.set('budget', String(s.budget));
  if (s.rsort !== 'departures' || s.rorder !== 'desc') {
    out.set('rsort', s.rsort);
    out.set('rorder', s.rorder);
  }
  if (s.rpage > 1) out.set('rpage', String(s.rpage));
  return out;
}

export function useAirportState(): [AirportState, (patch: Partial<AirportState>) => void] {
  const [sp, setSp] = useSearchParams();
  const state = useMemo(() => parse(sp), [sp]);
  const update = useCallback((patch: Partial<AirportState>) => setSp((prev) => serialise({ ...parse(prev), ...patch }), { replace: true }), [setSp]);
  // Write the default airport into the URL on first visit, so the address can be shared as is
  const missing = !sp.has('code');
  useEffect(() => {
    if (missing) update({});
  }, [missing, update]);
  return [state, update];
}
