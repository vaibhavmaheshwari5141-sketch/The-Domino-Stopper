// Engine v2 KPI endpoints (/api/kpis/...): the KPI catalogue, the engine KPIs per strategy and view, the cost
// assumptions, and net value recomputed for the costs the user chooses.
//
// gold_engine_kpis holds one row per strategy, budget, day type and view (`evaluator`). Every query here filters on
// the evaluator or returns it with each row, so a caller can never add the two views together by accident.

import type {
  CostAssumption, CostsResponse, EngineKpiRow, EngineKpisResponse, KpiCatalogResponse, KpiCatalogRow, NetValueResponse,
  NetValueRow,
} from '../../shared/api-types.ts';
import {
  CATALOG_ENGINES, CATALOG_LEVELS, COST_LIMITS, COST_SETTINGS, ENGINE_MODES, EVALUATORS, breakEvenBufferCost, netValue,
  parseRange,
} from '../../shared/kpis.ts';
import { PLANNER_BUDGETS } from '../../shared/planner.ts';
import { DAY_TYPES, NO_BUFFER, strategyOrder } from '../../shared/simulator.ts';
import { type Params, query, t } from '../db.ts';
import { HttpError } from '../http.ts';
import { oneOf, oneOfNumber } from '../params.ts';

const DEFAULT_BUDGET = 5;

const normalised = (values: object) =>
  new URLSearchParams(Object.entries(values).filter(([, v]) => v !== null && v !== undefined).map(([k, v]) => [k, String(v)]));

// ---- parameters ----------------------------------------------------------------------------------------------------

const dayTypeParam = (p: URLSearchParams) => oneOf(p, 'day_type', DAY_TYPES, 'all days');

/** ?budget=2|5|10|15, or "all" for every budget (the budget sweep). */
function budgetOrAll(p: URLSearchParams): number | 'all' {
  if (p.get('budget')?.trim() === 'all') return 'all';
  return oneOfNumber(p, 'budget', PLANNER_BUDGETS, DEFAULT_BUDGET);
}

export const engineParams = (p: URLSearchParams) => normalised({
  budget: budgetOrAll(p),
  day_type: dayTypeParam(p),
  evaluator: oneOf(p, 'evaluator', [...EVALUATORS, 'both'] as const, 'both'),
  mode: oneOf(p, 'mode', [...ENGINE_MODES, 'all'] as const, 'all'),
});

/** A cost in dollars per minute from 0 to 500, rounded to the cent; absent means "use the stored assumption". */
function costParam(p: URLSearchParams, key: string): number | null {
  const raw = p.get(key)?.trim();
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < COST_LIMITS.min || n > COST_LIMITS.max) {
    throw new HttpError(400, `${key} must be a number of dollars per minute from ${COST_LIMITS.min} to ${COST_LIMITS.max}`);
  }
  return Math.round(n * 100) / 100;
}

export const netValueParams = (p: URLSearchParams) => normalised({
  budget: oneOfNumber(p, 'budget', PLANNER_BUDGETS, DEFAULT_BUDGET),
  day_type: dayTypeParam(p),
  cost_delay: costParam(p, 'cost_delay'),
  cost_buffer: costParam(p, 'cost_buffer'),
});

// ---- endpoints -----------------------------------------------------------------------------------------------------

export async function getCatalog(): Promise<KpiCatalogResponse> {
  const rows = await query<KpiCatalogRow>(
    `SELECT engine, level, kpi_name, kpi_label, target, value_v1, value_v2, target_met FROM ${t('gold_kpi_catalog')}`,
  );
  return { rows, groups: groupCatalog(rows) };
}

const rankIn = (order: string[], v: string) => (order.includes(v) ? order.indexOf(v) : order.length);

/** Rows grouped by engine, then level, in display order; rows keep their stored order inside a level. */
export function groupCatalog(rows: KpiCatalogRow[]): KpiCatalogResponse['groups'] {
  const engines = [...new Set(rows.map((r) => r.engine))].sort((a, b) => rankIn(CATALOG_ENGINES, a) - rankIn(CATALOG_ENGINES, b));
  return engines.map((engine) => {
    const mine = rows.filter((r) => r.engine === engine);
    const levels = [...new Set(mine.map((r) => r.level))].sort((a, b) => rankIn(CATALOG_LEVELS, a) - rankIn(CATALOG_LEVELS, b));
    return { engine, levels: levels.map((level) => ({ level, rows: mine.filter((r) => r.level === level) })) };
  });
}

const ENGINE_COLUMNS = `strategy, mode, budget_scenario, evaluator, day_type, turnarounds, added_min, net_added_min, prevented_min,
  own_absorbed_min, prevented_per_100, pct_departure_delay_prevented, late_departures_avoided, late_avoided_per_1000, otp_change_pp,
  value_usd, buffer_cost_usd, net_value_usd, eligible_share, max_airport_share, budget_respected, robustness_worst_case_share`;

/** gold_engine_kpis rows, filtered; sorted by budget, strategy (display order), then view (curve first). */
export async function engineRows(f: { budget: number | 'all'; day_type: string; evaluator: string; mode: string }): Promise<EngineKpiRow[]> {
  const clauses = ['day_type = :day_type', 'strategy <> :no_buffer'];
  const params: Params = { day_type: f.day_type, no_buffer: NO_BUFFER };
  if (f.budget !== 'all') {
    clauses.push('budget_scenario = :budget');
    params.budget = f.budget;
  }
  if (f.evaluator !== 'both') {
    clauses.push('evaluator = :evaluator');
    params.evaluator = f.evaluator;
  }
  if (f.mode !== 'all') {
    clauses.push('mode = :mode');
    params.mode = f.mode;
  }
  const rows = await query<EngineKpiRow>(`SELECT ${ENGINE_COLUMNS} FROM ${t('gold_engine_kpis')} WHERE ${clauses.join(' AND ')}`, params);
  const view = (e: string) => (EVALUATORS as readonly string[]).indexOf(e);
  return rows.sort((a, b) => a.budget_scenario - b.budget_scenario || strategyOrder(a.strategy, b.strategy) || view(a.evaluator) - view(b.evaluator));
}

export async function getEngine(p: URLSearchParams): Promise<EngineKpisResponse> {
  const budget = p.get('budget') === 'all' ? 'all' : Number(p.get('budget'));
  const f = { budget, day_type: p.get('day_type')!, evaluator: p.get('evaluator')!, mode: p.get('mode')! } as const;
  const rows = await engineRows(f);
  return {
    budget,
    day_type: f.day_type,
    evaluator: f.evaluator as EngineKpisResponse['evaluator'],
    mode: f.mode as EngineKpisResponse['mode'],
    rows,
    strategies: [...new Set(rows.map((r) => r.strategy))],
  };
}

const num = (v: string | null | undefined): number | null => {
  const n = Number(v);
  return v !== null && v !== undefined && v.trim() !== '' && Number.isFinite(n) ? n : null;
};

export async function costRows(): Promise<CostAssumption[]> {
  return query<CostAssumption>(`SELECT setting, value, unit, description, source FROM ${t('gold_cost_assumptions')}`);
}

export async function getCosts(): Promise<CostsResponse> {
  const rows = await costRows();
  const value = (setting: string) => rows.find((r) => r.setting === setting)?.value ?? null;
  return {
    rows,
    cost_delay_min_usd: num(value(COST_SETTINGS.delay)),
    cost_buffer_min_usd: num(value(COST_SETTINGS.buffer)),
    airport_cap_share: num(value(COST_SETTINGS.airportCap)),
    eligible_ground_min: parseRange(value(COST_SETTINGS.eligible)),
    limits: { ...COST_LIMITS },
  };
}

export async function getNetValue(p: URLSearchParams): Promise<NetValueResponse> {
  const budget = Number(p.get('budget'));
  const dayType = p.get('day_type')!;
  const [rows, costs] = await Promise.all([
    engineRows({ budget, day_type: dayType, evaluator: 'both', mode: 'all' }),
    // The stored assumptions fill in a cost the request leaves out
    p.has('cost_delay') && p.has('cost_buffer') ? Promise.resolve(null) : getCosts(),
  ]);
  const costDelay = num(p.get('cost_delay')) ?? costs?.cost_delay_min_usd ?? null;
  const costBuffer = num(p.get('cost_buffer')) ?? costs?.cost_buffer_min_usd ?? null;
  if (costDelay === null || costBuffer === null) throw new HttpError(503, 'gold_cost_assumptions has no cost per delay or buffer minute');
  return { budget, day_type: dayType, cost_delay_min_usd: costDelay, cost_buffer_min_usd: costBuffer, rows: rows.map((r) => netValueRow(r, costDelay, costBuffer)) };
}

export function netValueRow(r: EngineKpiRow, costDelay: number, costBuffer: number): NetValueRow {
  const prevented = r.prevented_min ?? 0;
  const added = r.added_min ?? 0;
  const netAdded = r.net_added_min ?? 0;
  return {
    strategy: r.strategy,
    mode: r.mode,
    evaluator: r.evaluator,
    prevented_min: prevented,
    added_min: added,
    net_added_min: netAdded,
    value_usd: prevented * costDelay,
    buffer_cost_usd: Math.max(netAdded, 0) * costBuffer,
    net_value_usd: netValue(prevented, netAdded, costDelay, costBuffer),
    break_even_buffer_cost_usd: breakEvenBufferCost(prevented, added, netAdded, costDelay),
  };
}
