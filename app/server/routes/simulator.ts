// Scenario Simulator endpoints (/api/simulator/...): ways of placing the same buffer budget, replayed over the test
// period. The strategies are whatever the data holds; the "No buffer" reference row of older runs is left out.
// gold_sim_strategy and gold_sim_daily hold the curve view only; both views are in gold_engine_kpis (/api/kpis/engine).

import type {
  SimAllocationResponse, SimAllocationRow, SimDailyResponse, SimDailyRow, SimMonthlyRow, SimStrategiesResponse, SimStrategyRow,
  SimSweepResponse,
} from '../../shared/api-types.ts';
import { formatPercent } from '../../shared/format.ts';
import { PLANNER_BUDGETS } from '../../shared/planner.ts';
import {
  DAY_TYPES, ENGINE, EVEN, GROUPINGS, GROUP_ORDER, type GroupingName, NO_BUFFER, STRATEGY_NAME, strategyOrder,
} from '../../shared/simulator.ts';
import { type Params, ident, query, t } from '../db.ts';
import { HttpError } from '../http.ts';
import { oneOf, oneOfNumber } from '../params.ts';

const DEFAULT_BUDGET = 5;
const TOP_AIRPORTS = 15;
const GROUPING_NAMES = GROUPINGS.map((g) => g.name) as GroupingName[];

const normalised = (values: Record<string, string | number>) => new URLSearchParams(Object.entries(values).map(([k, v]) => [k, String(v)]));
const budgetParam = (p: URLSearchParams) => oneOfNumber(p, 'budget', PLANNER_BUDGETS, DEFAULT_BUDGET);
const dayTypeParam = (p: URLSearchParams) => oneOf(p, 'day_type', DAY_TYPES, 'all days');

const MAX_STRATEGIES = 12;

/**
 * Comma-separated strategy names (at most 12), each checked for plain characters; kept in display order. Names the
 * data does not hold simply return no rows. Names only ever reach SQL as parameters.
 */
function strategiesParam(p: URLSearchParams): string[] {
  const raw = p.get('strategies');
  const asked = raw === null || raw.trim() === '' ? [ENGINE, EVEN] : raw.split(',').map((s) => s.trim()).filter(Boolean);
  const bad = asked.filter((s) => !STRATEGY_NAME.test(s));
  if (bad.length) throw new HttpError(400, `Not a strategy name: ${bad.join(', ')}`);
  if (asked.length > MAX_STRATEGIES) throw new HttpError(400, `At most ${MAX_STRATEGIES} strategies`);
  return [...new Set(asked)].sort(strategyOrder);
}

export const strategiesParams = (p: URLSearchParams) => normalised({ budget: budgetParam(p), day_type: dayTypeParam(p) });
export const sweepParams = (p: URLSearchParams) => normalised({ day_type: dayTypeParam(p) });
export const dailyParams = (p: URLSearchParams) => normalised({ budget: budgetParam(p), strategies: strategiesParam(p).join(',') });
export const allocationParams = (p: URLSearchParams) =>
  normalised({ budget: budgetParam(p), grouping: oneOf(p, 'grouping', GROUPING_NAMES, 'Inbound-risk fifth') });

/** Strategy names as named parameters for an IN (...) list. */
function inList(names: string[]): { sql: string; params: Params } {
  const params: Params = Object.fromEntries(names.map((n, i) => [`s${i}`, n]));
  return { sql: names.map((_, i) => `:s${i}`).join(', '), params };
}

const STRATEGY_COLUMNS = `strategy, budget_scenario, day_type, turnarounds, added_min, absorbed_min, pct_removed, absorbed_per_100_added,
  late_avoided_per_1000, engine_vs_this, engine_vs_this_ci95_low, engine_vs_this_ci95_high, share_of_hindsight, mode`;

const byStrategyOrder = (a: { strategy: string }, b: { strategy: string }) => strategyOrder(a.strategy, b.strategy);

// ---- endpoints -----------------------------------------------------------------------------------------------------

export async function getStrategies(p: URLSearchParams): Promise<SimStrategiesResponse> {
  const budget = Number(p.get('budget'));
  const dayType = p.get('day_type')!;
  const [rows, period] = await Promise.all([
    query<SimStrategyRow>(
      `SELECT ${STRATEGY_COLUMNS} FROM ${t('gold_sim_strategy')}
       WHERE budget_scenario = :budget AND day_type = :day_type AND strategy <> :no_buffer`,
      { budget, day_type: dayType, no_buffer: NO_BUFFER },
    ),
    query<{ days: number; disruption_days: number; first_day: string | null; last_day: string | null }>(
      `SELECT COUNT(DISTINCT flight_date) AS days,
              COUNT(DISTINCT CASE WHEN is_disruption_day THEN flight_date END) AS disruption_days,
              MIN(flight_date) AS first_day, MAX(flight_date) AS last_day
       FROM ${t('gold_sim_daily')} WHERE budget_scenario = :budget`,
      { budget },
    ),
  ]);
  return {
    budget, day_type: dayType, rows: rows.sort(byStrategyOrder),
    period: period[0] ?? { days: 0, disruption_days: 0, first_day: null, last_day: null },
  };
}

export async function getSweep(p: URLSearchParams): Promise<SimSweepResponse> {
  const dayType = p.get('day_type')!;
  const rows = await query<SimStrategyRow>(
    `SELECT ${STRATEGY_COLUMNS} FROM ${t('gold_sim_strategy')}
     WHERE day_type = :day_type AND strategy <> :no_buffer ORDER BY budget_scenario`,
    { day_type: dayType, no_buffer: NO_BUFFER },
  );
  return { day_type: dayType, rows: rows.sort((a, b) => a.budget_scenario - b.budget_scenario || byStrategyOrder(a, b)) };
}

export async function getDaily(p: URLSearchParams): Promise<SimDailyResponse> {
  const budget = Number(p.get('budget'));
  const strategies = p.get('strategies')!.split(',');
  const names = inList(strategies);
  const daily = await query<SimDailyRow>(
    `SELECT flight_date, strategy, buffer_added_min, absorbed_min, late_departures_avoided,
            COALESCE(is_disruption_day, FALSE) AS is_disruption_day
     FROM ${t('gold_sim_daily')} WHERE budget_scenario = :budget AND strategy IN (${names.sql}) AND strategy <> :no_buffer
     ORDER BY flight_date, strategy`,
    { budget, no_buffer: NO_BUFFER, ...names.params },
  );

  // Monthly roll-up in code (month keys from the ISO date), so the SQL stays the same on Databricks and DuckDB
  const months = new Map<string, SimMonthlyRow>();
  const disruptionDates = new Map<string, Set<string>>();
  for (const d of daily) {
    const ym = d.flight_date.slice(0, 7);
    const key = `${ym}|${d.strategy}`;
    const m = months.get(key) ?? { year_month: ym, strategy: d.strategy, buffer_added_min: 0, absorbed_min: 0, late_departures_avoided: 0, disruption_days: 0 };
    m.buffer_added_min += d.buffer_added_min ?? 0;
    m.absorbed_min += d.absorbed_min ?? 0;
    m.late_departures_avoided += d.late_departures_avoided ?? 0;
    months.set(key, m);
    if (d.is_disruption_day) disruptionDates.set(ym, (disruptionDates.get(ym) ?? new Set()).add(d.flight_date));
  }
  const monthly = [...months.values()]
    .map((m) => ({ ...m, disruption_days: disruptionDates.get(m.year_month)?.size ?? 0 }))
    .sort((a, b) => a.year_month.localeCompare(b.year_month) || byStrategyOrder(a, b));

  return { budget, strategies, daily, monthly };
}

export async function getAllocation(p: URLSearchParams): Promise<SimAllocationResponse> {
  const budget = Number(p.get('budget'));
  const grouping = p.get('grouping') as GroupingName;
  const airports = grouping === 'Airport';
  // `group` and `grouping` are SQL words, so both are quoted in the active dialect
  let rows = await query<SimAllocationRow>(
    `SELECT ${ident('group')}, turnarounds, engine_buffer_min, even_buffer_min, share_of_engine_buffer, share_of_turnarounds
     FROM ${t('gold_buffer_allocation')} WHERE budget_scenario = :budget AND ${ident('grouping')} = :grouping
     ORDER BY engine_buffer_min DESC${airports ? ` LIMIT ${TOP_AIRPORTS}` : ''}`,
    { budget, grouping },
  );
  const order = GROUP_ORDER[grouping];
  if (order) rows = rows.sort((a, b) => rank(order, a.group) - rank(order, b.group));
  else if (!airports) rows = rows.sort((a, b) => a.group.localeCompare(b.group));
  return { budget, grouping, rows, caption: allocationCaption(grouping, rows) };
}

const rank = (order: string[], g: string) => (order.includes(g) ? order.indexOf(g) : order.length);

/** One sentence about where the buffer goes, from the rows (no numbers written in by hand). */
export function allocationCaption(grouping: GroupingName, rows: SimAllocationRow[]): string {
  if (!rows.length) return 'No allocation data for this budget.';
  const pct = (v: number) => formatPercent(v, 0);
  const sum = (rs: SimAllocationRow[], k: 'share_of_engine_buffer' | 'share_of_turnarounds') => rs.reduce((s, r) => s + r[k], 0);

  if (grouping === 'Inbound-risk fifth') {
    const top = rows.find((r) => /highest/i.test(r.group)) ?? rows[rows.length - 1];
    const bottom = rows.find((r) => /lowest/i.test(r.group)) ?? rows[0];
    const safest = bottom.share_of_engine_buffer < 0.005 ? 'almost none' : pct(bottom.share_of_engine_buffer);   // "0%" would read as an error
    return `${pct(top.share_of_engine_buffer)} of the buffer goes to the riskiest fifth of turnarounds, and ${safest} to the safest fifth.`;
  }
  if (grouping === 'Ground-time band') {
    const long = rows.filter((r) => /^(Long|Very long)/.test(r.group));
    const short = rows.find((r) => /^Short/.test(r.group));
    return `Stops over 80 minutes get ${pct(sum(long, 'share_of_engine_buffer'))} of the buffer but are ${pct(sum(long, 'share_of_turnarounds'))} of turnarounds`
      + (short ? `; short stops (up to 55 min) get ${pct(short.share_of_engine_buffer)} against ${pct(short.share_of_turnarounds)} of turnarounds.` : '.');
  }
  if (grouping === 'Airport type') {
    const busy = rows.find((r) => /busiest/i.test(r.group)) ?? rows[0];
    return `The ten busiest airports get ${pct(busy.share_of_engine_buffer)} of the buffer and have ${pct(busy.share_of_turnarounds)} of the turnarounds.`;
  }
  const first = rows[0];
  return `${first.group} gets the most buffer: ${pct(first.share_of_engine_buffer)}, for ${pct(first.share_of_turnarounds)} of the turnarounds. The top ${rows.length} airports get ${pct(sum(rows, 'share_of_engine_buffer'))} together.`;
}
