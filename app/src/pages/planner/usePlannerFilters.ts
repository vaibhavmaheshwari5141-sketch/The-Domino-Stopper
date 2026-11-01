// Buffer Planner filters live in the URL query string, so a view can be bookmarked and other pages can link to it.
// Only values that differ from the defaults are written. Unknown or invalid values fall back to the defaults.
import { useCallback, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { QueryParams } from '../../lib/api';
import {
  PLANNER_BUDGETS, type PlannerBudget, RISK_BANDS, type RiskBand, SHOW_OPTIONS, type ShowOption, SORT_FIELDS, type SortField,
} from '../../../shared/planner';

export const PAGE_SIZE = 50;
export const DEFAULT_DATE = '2026-03-15';

export interface PlannerFilters {
  /** Add buffer (the recommendations table) or reallocate (minutes moved within each aircraft's day). */
  mode: 'add' | 'reallocate';
  date: string;
  budget: PlannerBudget;
  airport: string | null;
  risk: 'all' | RiskBand;
  show: ShowOption;
  veryShort: boolean;          // include very short turns
  q: string;
  sort: SortField;
  order: 'asc' | 'desc';
  page: number;
  turn: string | null;         // turnaround open in the detail drawer
}

export const DEFAULTS: PlannerFilters = {
  mode: 'add', date: DEFAULT_DATE, budget: 5, airport: null, risk: 'all', show: 'all', veryShort: true, q: '', sort: 'day_rank', order: 'asc', page: 1, turn: null,
};

const pick = <T extends string | number>(allowed: readonly T[], raw: string | null, fallback: T): T =>
  (allowed as readonly (string | number)[]).find((a) => String(a) === raw) as T | undefined ?? fallback;

function parse(sp: URLSearchParams): PlannerFilters {
  const date = sp.get('date');
  const page = Number(sp.get('page'));
  return {
    mode: sp.get('mode') === 'reallocate' ? 'reallocate' : 'add',
    date: date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : DEFAULTS.date,
    budget: pick(PLANNER_BUDGETS, sp.get('budget'), DEFAULTS.budget),
    airport: /^[A-Z]{3}$/.test(sp.get('airport') ?? '') ? sp.get('airport') : null,
    risk: pick(['all', ...RISK_BANDS] as const, sp.get('risk'), DEFAULTS.risk),
    show: pick(SHOW_OPTIONS, sp.get('show'), DEFAULTS.show),
    veryShort: sp.get('very_short') !== 'exclude',
    q: (sp.get('q') ?? '').slice(0, 20),
    sort: pick(SORT_FIELDS, sp.get('sort'), DEFAULTS.sort),
    order: sp.get('order') === 'desc' ? 'desc' : 'asc',
    page: Number.isInteger(page) && page > 0 ? page : 1,
    turn: sp.get('turn'),
  };
}

function serialise(f: PlannerFilters): URLSearchParams {
  const out = new URLSearchParams();
  if (f.mode !== 'add') out.set('mode', f.mode);
  out.set('date', f.date);                                   // always present, so links show the day
  if (f.budget !== DEFAULTS.budget) out.set('budget', String(f.budget));
  if (f.airport) out.set('airport', f.airport);
  if (f.risk !== 'all') out.set('risk', f.risk);
  if (f.show !== 'all') out.set('show', f.show);
  if (!f.veryShort) out.set('very_short', 'exclude');
  if (f.q) out.set('q', f.q);
  if (f.sort !== DEFAULTS.sort || f.order !== DEFAULTS.order) {
    out.set('sort', f.sort);
    out.set('order', f.order);
  }
  if (f.page > 1) out.set('page', String(f.page));
  if (f.turn) out.set('turn', f.turn);
  return out;
}

/** Filters from the URL, and an updater. Changing anything but the page, sort or drawer goes back to page 1. */
export function usePlannerFilters(): [PlannerFilters, (patch: Partial<PlannerFilters>) => void] {
  const [sp, setSp] = useSearchParams();
  const filters = useMemo(() => parse(sp), [sp]);
  const update = useCallback(
    (patch: Partial<PlannerFilters>) => {
      setSp((prev) => {
        const current = parse(prev);
        const resetsPage = Object.keys(patch).some((k) => !['page', 'turn', 'sort', 'order'].includes(k));
        return serialise({ ...current, ...(resetsPage || 'sort' in patch ? { page: 1 } : {}), ...patch });
      }, { replace: true });
    },
    [setSp],
  );

  // Write the day into the URL on first visit, so the address can be bookmarked straight away
  useEffect(() => {
    if (!sp.has('date')) setSp(serialise(parse(sp)), { replace: true });
  }, [sp, setSp]);

  return [filters, update];
}

/** The API's query parameters for the current filters (the export link uses the same, without paging). */
export function apiParams(f: PlannerFilters, paged = true): QueryParams {
  return {
    date: f.date,
    budget: f.budget,
    airport: f.airport,
    risk_band: f.risk === 'all' ? null : f.risk,
    show: f.show === 'all' ? null : f.show,
    very_short: f.veryShort ? null : 'exclude',
    search: f.q || null,
    sort: f.sort,
    order: f.order,
    ...(paged ? { limit: PAGE_SIZE, offset: (f.page - 1) * PAGE_SIZE } : {}),
  };
}
