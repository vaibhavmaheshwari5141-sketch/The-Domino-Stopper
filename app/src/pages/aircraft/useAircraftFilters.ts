// Aircraft Day state in the URL: date, budget, airport, aircraft search, selected tail, open drawer, and `from`
// (the Buffer Planner view the user came from, so "Back to Buffer Planner" can restore it).
import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PLANNER_BUDGETS, type PlannerBudget } from '../../../shared/planner';

export const DEFAULT_DATE = '2026-03-15';

export interface AircraftFilters {
  date: string;
  budget: PlannerBudget;
  airport: string | null;
  q: string;
  tail: string | null;
  turn: string | null;
  from: string | null;
}

function parse(sp: URLSearchParams): AircraftFilters {
  const date = sp.get('date');
  const budget = Number(sp.get('budget'));
  const tail = (sp.get('tail') ?? '').toUpperCase();
  return {
    date: date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : DEFAULT_DATE,
    budget: (PLANNER_BUDGETS as readonly number[]).includes(budget) ? (budget as PlannerBudget) : 5,
    airport: /^[A-Z]{3}$/.test(sp.get('airport') ?? '') ? sp.get('airport') : null,
    q: (sp.get('q') ?? '').slice(0, 12),
    tail: /^[A-Z0-9]{2,8}$/.test(tail) ? tail : null,
    turn: sp.get('turn'),
    from: sp.get('from'),
  };
}

function serialise(f: AircraftFilters): URLSearchParams {
  const out = new URLSearchParams();
  if (f.tail) out.set('tail', f.tail);
  out.set('date', f.date);
  out.set('budget', String(f.budget));
  if (f.airport) out.set('airport', f.airport);
  if (f.q) out.set('q', f.q);
  if (f.turn) out.set('turn', f.turn);
  if (f.from !== null) out.set('from', f.from);
  return out;
}

export function useAircraftFilters(): [AircraftFilters, (patch: Partial<AircraftFilters>) => void] {
  const [sp, setSp] = useSearchParams();
  const filters = useMemo(() => parse(sp), [sp]);
  const update = useCallback(
    (patch: Partial<AircraftFilters>) => setSp((prev) => serialise({ ...parse(prev), ...patch }), { replace: true }),
    [setSp],
  );
  return [filters, update];
}

/** Where "Back to Buffer Planner" goes: the planner view the user came from, or the same day and budget. */
export function plannerHref(f: AircraftFilters): string {
  const back = new URLSearchParams(f.from ?? '');
  if (!back.has('date')) back.set('date', f.date);
  return `/buffer-planner?${back}`;
}
