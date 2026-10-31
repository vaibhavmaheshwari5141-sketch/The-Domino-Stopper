// Scenario Simulator state in the URL, so a scenario can be bookmarked or shared.
import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PLANNER_BUDGETS, type PlannerBudget } from '../../../shared/planner';
import { DAY_TYPES, type DayType, GROUPINGS, STRATEGIES } from '../../../shared/simulator';

export type Metric = 'per100' | 'total';
export type DailyView = 'daily' | 'monthly';

export interface SimState {
  budget: PlannerBudget;
  dayType: DayType;
  /** Selected strategies, as stored names, in display order. */
  strategies: string[];
  grouping: string;
  metric: Metric;
  view: DailyView;
}

const DAY_IDS: Record<string, DayType> = { all: 'all days', normal: 'normal days', disruption: 'disruption days' };
const dayId = (d: DayType) => Object.keys(DAY_IDS).find((k) => DAY_IDS[k] === d)!;

function parse(sp: URLSearchParams): SimState {
  const budget = Number(sp.get('budget'));
  const ids = sp.get('s');
  const group = GROUPINGS.find((g) => g.id === sp.get('group'));
  return {
    budget: (PLANNER_BUDGETS as readonly number[]).includes(budget) ? (budget as PlannerBudget) : 5,
    dayType: DAY_IDS[sp.get('day') ?? ''] ?? DAY_TYPES[0],
    strategies: ids === null ? STRATEGIES.map((s) => s.name) : STRATEGIES.filter((s) => ids.split(',').includes(s.id)).map((s) => s.name),
    grouping: group?.name ?? GROUPINGS[0].name,
    metric: sp.get('metric') === 'total' ? 'total' : 'per100',
    view: sp.get('view') === 'monthly' ? 'monthly' : 'daily',
  };
}

function serialise(s: SimState): URLSearchParams {
  const out = new URLSearchParams();
  if (s.budget !== 5) out.set('budget', String(s.budget));
  if (s.dayType !== 'all days') out.set('day', dayId(s.dayType));
  if (s.strategies.length !== STRATEGIES.length) out.set('s', STRATEGIES.filter((x) => s.strategies.includes(x.name)).map((x) => x.id).join(','));
  const group = GROUPINGS.find((g) => g.name === s.grouping);
  if (group && group.id !== GROUPINGS[0].id) out.set('group', group.id);
  if (s.metric !== 'per100') out.set('metric', s.metric);
  if (s.view !== 'daily') out.set('view', s.view);
  return out;
}

export function useSimulatorState(): [SimState, (patch: Partial<SimState>) => void] {
  const [sp, setSp] = useSearchParams();
  const state = useMemo(() => parse(sp), [sp]);
  const update = useCallback((patch: Partial<SimState>) => setSp((prev) => serialise({ ...parse(prev), ...patch }), { replace: true }), [setSp]);
  return [state, update];
}
