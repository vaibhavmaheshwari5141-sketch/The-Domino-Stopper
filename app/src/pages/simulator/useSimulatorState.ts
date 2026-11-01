// Scenario Simulator state in the URL, so a scenario can be bookmarked or shared.
import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { COST_LIMITS, type EngineMode, type EvaluatorChoice } from '../../../shared/kpis';
import { PLANNER_BUDGETS, type PlannerBudget } from '../../../shared/planner';
import { DAY_TYPES, type DayType, GROUPINGS } from '../../../shared/simulator';

export type Metric = 'per100' | 'total';
export type DailyView = 'daily' | 'monthly';
export type SimTab = 'strategies' | 'scorecard';

export interface SimState {
  budget: PlannerBudget;
  dayType: DayType;
  mode: EngineMode;
  evaluator: EvaluatorChoice;
  /** Selected strategy ids (see strategyDef); null = every strategy of the mode. */
  strategies: string[] | null;
  grouping: string;
  metric: Metric;
  view: DailyView;
  tab: SimTab;
  /** Dollars per minute; null = the stored assumption (Airlines for America). */
  costDelay: number | null;
  costBuffer: number | null;
}

const DAY_IDS: Record<string, DayType> = { all: 'all days', normal: 'normal days', disruption: 'disruption days' };
const dayId = (d: DayType) => Object.keys(DAY_IDS).find((k) => DAY_IDS[k] === d)!;
const EVAL_IDS: Record<string, EvaluatorChoice> = { both: 'both', curve: 'curve', model: 'response model' };
const evalId = (e: EvaluatorChoice) => Object.keys(EVAL_IDS).find((k) => EVAL_IDS[k] === e)!;

function cost(raw: string | null): number | null {
  if (raw === null || raw.trim() === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= COST_LIMITS.min && n <= COST_LIMITS.max ? Math.round(n * 100) / 100 : null;
}

function parse(sp: URLSearchParams): SimState {
  const budget = Number(sp.get('budget'));
  const ids = sp.get('s');
  const group = GROUPINGS.find((g) => g.id === sp.get('group'));
  return {
    budget: (PLANNER_BUDGETS as readonly number[]).includes(budget) ? (budget as PlannerBudget) : 5,
    dayType: DAY_IDS[sp.get('day') ?? ''] ?? DAY_TYPES[0],
    mode: sp.get('mode') === 'reallocate' ? 'reallocate' : 'add',
    evaluator: EVAL_IDS[sp.get('eval') ?? ''] ?? 'both',
    strategies: ids === null ? null : ids.split(',').filter(Boolean),
    grouping: group?.name ?? GROUPINGS[0].name,
    metric: sp.get('metric') === 'total' ? 'total' : 'per100',
    view: sp.get('view') === 'monthly' ? 'monthly' : 'daily',
    tab: sp.get('tab') === 'scorecard' ? 'scorecard' : 'strategies',
    costDelay: cost(sp.get('cd')),
    costBuffer: cost(sp.get('cb')),
  };
}

function serialise(s: SimState): URLSearchParams {
  const out = new URLSearchParams();
  if (s.tab !== 'strategies') out.set('tab', s.tab);
  if (s.budget !== 5) out.set('budget', String(s.budget));
  if (s.dayType !== 'all days') out.set('day', dayId(s.dayType));
  if (s.mode !== 'add') out.set('mode', s.mode);
  if (s.evaluator !== 'both') out.set('eval', evalId(s.evaluator));
  if (s.strategies !== null) out.set('s', s.strategies.join(','));
  const group = GROUPINGS.find((g) => g.name === s.grouping);
  if (group && group.id !== GROUPINGS[0].id) out.set('group', group.id);
  if (s.metric !== 'per100') out.set('metric', s.metric);
  if (s.view !== 'daily') out.set('view', s.view);
  if (s.costDelay !== null) out.set('cd', String(s.costDelay));
  if (s.costBuffer !== null) out.set('cb', String(s.costBuffer));
  return out;
}

export function useSimulatorState(): [SimState, (patch: Partial<SimState>) => void] {
  const [sp, setSp] = useSearchParams();
  const state = useMemo(() => parse(sp), [sp]);
  const update = useCallback((patch: Partial<SimState>) => setSp((prev) => serialise({ ...parse(prev), ...patch }), { replace: true }), [setSp]);
  return [state, update];
}
