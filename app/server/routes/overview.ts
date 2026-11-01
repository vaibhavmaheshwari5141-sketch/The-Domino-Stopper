// GET /api/overview?budget=5: headline KPIs, the engine KPIs in both views, guardrails, monthly network trend, and the
// summary and insights written from the KPI values (no numbers are hard-coded here).

import {
  type AirportImpact, type AirportImpactResponse, IMPACT_BANDS, IMPACT_COMPONENTS, type Insight, type Kpi, type KpiCatalogRow,
  type MonthlyNetwork, OVERVIEW_KPIS, type OverviewKpiName, type OverviewResponse,
} from '../../shared/api-types.ts';
import { formatCompact, formatMinutes, formatNumber, formatPercent, formatUsd } from '../../shared/format.ts';
import { PLANNER_BUDGETS } from '../../shared/planner.ts';
import { query, t } from '../db.ts';
import { HttpError } from '../http.ts';
import { optionalYearMonth } from '../params.ts';
import { engineRows } from './kpis.ts';

const DEFAULT_BUDGET = 5;
const MAX_BUDGET = 60;

/** Validates ?budget= and returns the normalised parameters (also the cache key). */
export function overviewParams(params: URLSearchParams): URLSearchParams {
  const raw = params.get('budget');
  const budget = raw === null || raw === '' ? DEFAULT_BUDGET : Number(raw);
  if (!Number.isInteger(budget) || budget < 0 || budget > MAX_BUDGET) {
    throw new HttpError(400, `budget must be a whole number of minutes from 0 to ${MAX_BUDGET}`);
  }
  return new URLSearchParams({ budget: String(budget) });
}

export async function getOverview(params: URLSearchParams): Promise<OverviewResponse> {
  const budget = Number(params.get('budget'));
  const names = Object.fromEntries(OVERVIEW_KPIS.map((name, i) => [`k${i}`, name]));

  // The engine KPIs exist for the planner budgets only; any other budget has no strategy rows
  const planned = (PLANNER_BUDGETS as readonly number[]).includes(budget);
  const [kpiRows, engine, catalog, monthly, runs] = await Promise.all([
    query<Kpi & { budget_scenario: number | null }>(
      `SELECT kpi_name, value, unit, period, definition, budget_scenario FROM ${t('gold_kpi_headline')}
       WHERE kpi_name IN (${Object.keys(names).map((k) => `:${k}`).join(', ')})`,
      names,
    ),
    planned ? engineRows({ budget, day_type: 'all days', evaluator: 'both', mode: 'all' }) : Promise.resolve([]),
    query<KpiCatalogRow>(
      `SELECT engine, level, kpi_name, kpi_label, target, value_v1, value_v2, target_met FROM ${t('gold_kpi_catalog')}`,
    ),
    query<MonthlyNetwork>(
      `SELECT year_month,
              SUM(arr_late15_rate * operated_flights) / NULLIF(SUM(operated_flights), 0) AS late_arrival_rate,
              SUM(avg_arr_delay_min * operated_flights) / NULLIF(SUM(operated_flights), 0) AS avg_arrival_delay_min,
              SUM(operated_flights) AS operated_flights,
              SUM(CASE WHEN is_disruption_day THEN 1 ELSE 0 END) AS disruption_days
       FROM ${t('gold_network_daily')} GROUP BY year_month ORDER BY year_month`,
    ),
    query<{ run_id: string; test_period: string | null }>(
      `SELECT run_id, test_period FROM ${t('gold_engine_run_log')} ORDER BY run_timestamp_utc DESC LIMIT 1`,
    ),
  ]);

  const kpis = Object.fromEntries(OVERVIEW_KPIS.map((name) => [name, null])) as Record<OverviewKpiName, Kpi | null>;
  for (const { budget_scenario: _, ...row } of kpiRows) kpis[row.kpi_name as OverviewKpiName] = row;
  const kpiBudget = kpiRows.find((r) => r.kpi_name === 'engine_prevented_per_100')?.budget_scenario ?? null;

  return {
    kpis,
    engine_kpis: engine,
    guardrails: catalog.filter((r) => r.level === 'Guardrail'),
    monthly,
    summary: buildSummary(kpis, kpiBudget),
    insights: buildInsights(kpis, catalog),
    context: { budget, kpi_budget: kpiBudget, test_period: runs[0]?.test_period ?? null, run_id: runs[0]?.run_id ?? null },
  };
}

// ---- GET /api/overview/airports?budget=5[&from=2026-01&to=2026-08]: the airport map ----------------------------------------------------------

type AirportRow = Omit<AirportImpact, 'lat' | 'lon' | 'network_knock_on_share' | 'impact_score' | 'impact_band' | 'impact_rank'>
  & { lat: number | null; lon: number | null };

/** Flight-weighted mean of a monthly rate, ignoring months where the rate is missing. */
const weighted = (rate: string, weight: string) =>
  `SUM(${rate} * ${weight}) / NULLIF(SUM(CASE WHEN ${rate} IS NOT NULL THEN ${weight} END), 0)`;

/** Validates ?budget=5&from=2026-01&to=2026-08 (months optional, both ends inclusive). */
export function airportImpactParams(params: URLSearchParams): URLSearchParams {
  const out = overviewParams(params);
  const from = optionalYearMonth(params, 'from');
  const to = optionalYearMonth(params, 'to');
  if (from && to && from > to) throw new HttpError(400, 'from must not be after to');
  if (from) out.set('from', from);
  if (to) out.set('to', to);
  return out;
}

export async function getAirportImpact(params: URLSearchParams): Promise<AirportImpactResponse> {
  const budget = Number(params.get('budget'));
  // Open ends become bounds that every "YYYY-MM" falls inside, so the SQL never needs a NULL parameter
  const months = { budget, first_month: params.get('from') ?? '0000-01', last_month: params.get('to') ?? '9999-12' };
  const inRange = 'year_month BETWEEN :first_month AND :last_month';

  const [rows, periods, options] = await Promise.all([
    query<AirportRow>(
      `WITH m AS (
         SELECT airport,
                SUM(scheduled_departures) AS departures,
                SUM(turnarounds) AS turnarounds,
                ${weighted('dep_late15_rate', 'scheduled_departures')} AS late_departure_rate,
                ${weighted('arr_late15_rate', 'arrivals')} AS late_arrival_rate,
                ${weighted('avg_dep_delay_min', 'scheduled_departures')} AS avg_dep_delay_min,
                ${weighted('cancel_rate', 'scheduled_departures')} AS cancel_rate,
                ${weighted('short_turn_share', 'turnarounds')} AS short_turn_share,
                SUM(propagated_delay_min) AS propagated_delay_min
         FROM ${t('gold_airport_month')} WHERE ${inRange} GROUP BY airport
       ), p AS (
         SELECT airport, SUM(buffer_min) AS buffer_min, SUM(realised_absorbed_min) AS realised_absorbed_min,
                SUM(late_departures_avoided) AS late_departures_avoided
         FROM ${t('gold_buffer_plan_airport')} WHERE budget_scenario = :budget AND ${inRange} GROUP BY airport
       )
       SELECT d.airport, r.name, d.city, d.state, r.lat, r.lon, d.departure_rank, d.is_top10,
              m.departures, m.turnarounds, m.late_departure_rate, m.late_arrival_rate, m.avg_dep_delay_min, m.cancel_rate,
              m.short_turn_share, m.propagated_delay_min, m.propagated_delay_min / NULLIF(m.turnarounds, 0) AS knock_on_per_turn_min,
              p.buffer_min, p.realised_absorbed_min, p.late_departures_avoided
       FROM ${t('gold_dim_airport')} d
       LEFT JOIN ${t('ref_airports_tz')} r ON r.iata = d.airport
       LEFT JOIN m ON m.airport = d.airport
       LEFT JOIN p ON p.airport = d.airport
       ORDER BY d.departure_rank`,
      months,
    ),
    query<{ first_month: string | null; last_month: string | null; plan_first: string | null; plan_last: string | null }>(
      `SELECT (SELECT MIN(year_month) FROM ${t('gold_airport_month')} WHERE ${inRange}) AS first_month,
              (SELECT MAX(year_month) FROM ${t('gold_airport_month')} WHERE ${inRange}) AS last_month,
              (SELECT MIN(year_month) FROM ${t('gold_buffer_plan_airport')} WHERE budget_scenario = :budget AND ${inRange}) AS plan_first,
              (SELECT MAX(year_month) FROM ${t('gold_buffer_plan_airport')} WHERE budget_scenario = :budget AND ${inRange}) AS plan_last`,
      months,
    ),
    // Choices for the filters: every month with airport data, and every budget the engine planned
    query<{ kind: string; value: string }>(
      `SELECT DISTINCT 'month' AS kind, year_month AS value FROM ${t('gold_airport_month')}
       UNION ALL
       SELECT DISTINCT 'budget' AS kind, CAST(budget_scenario AS STRING) AS value FROM ${t('gold_buffer_plan_airport')}`,
    ),
  ]);

  const p = periods[0];
  const span = (a?: string | null, b?: string | null) => (a && b ? `${a} to ${b}` : null);
  // On the map: airports with a position and flights in the period
  const mapped = rows.filter((r): r is AirportRow & { lat: number; lon: number } => r.lat !== null && r.lon !== null && r.departures !== null);
  return {
    airports: scoreAirports(mapped),
    context: {
      budget,
      period: span(p?.first_month, p?.last_month),
      plan_period: span(p?.plan_first, p?.plan_last),
      missing_coordinates: rows.filter((r) => r.lat === null || r.lon === null).map((r) => r.airport),
      months: options.filter((o) => o.kind === 'month').map((o) => o.value).sort(),
      budgets: options.filter((o) => o.kind === 'budget').map((o) => Number(o.value)).sort((a, b) => a - b),
    },
  };
}

/**
 * Percentile rank of each value among the non-missing ones, from 0 (lowest) to 1 (highest); ties share their
 * average rank. A lone value ranks 0.5.
 */
export function percentileRanks(values: (number | null)[]): (number | null)[] {
  const present = values.map((v, i) => [v, i] as const).filter((e): e is readonly [number, number] => e[0] !== null);
  present.sort((a, b) => a[0] - b[0]);
  const out: (number | null)[] = values.map(() => null);
  const n = present.length;
  for (let lo = 0; lo < n; ) {
    let hi = lo;
    while (hi + 1 < n && present[hi + 1][0] === present[lo][0]) hi++;
    const rank = n === 1 ? 0.5 : (lo + hi) / 2 / (n - 1);
    for (let k = lo; k <= hi; k++) out[present[k][1]] = rank;
    lo = hi + 1;
  }
  return out;
}

/**
 * Delay impact score: the weighted mean of each airport's percentile rank on IMPACT_COMPONENTS, times 100. A missing
 * component drops out and the remaining weights are rescaled. Adds the network share of knock-on delay, the band and
 * the rank (1 = most impacted, ties broken by departures).
 */
export function scoreAirports(rows: Omit<AirportImpact, 'network_knock_on_share' | 'impact_score' | 'impact_band' | 'impact_rank'>[]): AirportImpact[] {
  const totalKnockOn = rows.reduce((s, r) => s + (r.propagated_delay_min ?? 0), 0);
  const withShare = rows.map((r) => ({
    ...r,
    network_knock_on_share: r.propagated_delay_min === null || totalKnockOn <= 0 ? null : r.propagated_delay_min / totalKnockOn,
  }));
  const ranks = IMPACT_COMPONENTS.map((c) => percentileRanks(withShare.map((r) => r[c.key])));

  const scored = withShare.map((r, i) => {
    let sum = 0;
    let weight = 0;
    IMPACT_COMPONENTS.forEach((c, j) => {
      const pr = ranks[j][i];
      if (pr !== null) {
        sum += c.weight * pr;
        weight += c.weight;
      }
    });
    const impact_score = weight > 0 ? Math.round((100 * sum) / weight) : null;
    const impact_band = impact_score === null ? null : IMPACT_BANDS.find((b) => impact_score >= b.min)!.band;
    return { ...r, impact_score, impact_band, impact_rank: null as number | null };
  });

  [...scored]
    .filter((r) => r.impact_score !== null)
    .sort((a, b) => b.impact_score! - a.impact_score! || (b.departures ?? 0) - (a.departures ?? 0))
    .forEach((r, i) => (r.impact_rank = i + 1));
  return scored;
}

// ---- text built from the KPI values ------------------------------------------------------------------------------

type Kpis = Record<OverviewKpiName, Kpi | null>;
const v = (kpis: Kpis, name: OverviewKpiName): number | null => kpis[name]?.value ?? null;
const budgetText = (b: number | null) => (b === null ? 'the main budget of' : `${formatNumber(b)} extra`);
const v1 = (catalog: KpiCatalogRow[], name: string) => catalog.find((r) => r.kpi_name === name)?.value_v1 ?? null;
/** "11.3–52.2": a value in the curve view to the model view. */
const range = (a: number | null, b: number | null, fmt: (x: number | null) => string) => `${fmt(a)}–${fmt(b)}`;

export function buildSummary(kpis: Kpis, kpiBudget: number | null): string {
  return [
    `Across ${formatCompact(v(kpis, 'scheduled_flights'))} flights, ${formatPercent(v(kpis, 'late_arrival_rate'))} arrived 15+ minutes late.`,
    `With ${budgetText(kpiBudget)} minutes of buffer per turnaround, the engine prevents ${range(v(kpis, 'engine_prevented_per_100'), v(kpis, 'engine_prevented_per_100_resp'), (x) => formatNumber(x, 1))} minutes of delay per 100 buffer minutes across each aircraft's day (curve view to model view).`,
    `Moving minutes from long sits to risky stops is worth ${range(v(kpis, 'realloc_net_value_usd'), v(kpis, 'realloc_net_value_usd_resp'), (x) => formatUsd(x))} with no buffer added.`,
  ].join(' ');
}

export function buildInsights(kpis: Kpis, catalog: KpiCatalogRow[]): Insight[] {
  const threshold = v(kpis, 'absorption_threshold');
  const thresholdText = threshold === null ? 'ground-time' : `${formatNumber(threshold)}-minute`;
  const usd = (x: number | null) => formatUsd(x, false);
  return [
    {
      id: 'threshold',
      title: `The ${thresholdText} rule`,
      body: 'Below it, almost all inbound delay passes to the next flight.',
      metric: formatMinutes(threshold),
      metric_label: 'of ground time',
      source: 'Delay propagation',
    },
    {
      id: 'placement',
      title: 'Placement beats volume',
      body: `Model view ${formatNumber(v(kpis, 'engine_prevented_per_100_resp'), 1)} per 100 min (v1 ${formatNumber(v(kpis, 'engine_v1_prevented_per_100_resp'), 1)}); `
        + `worst case across both views ${formatPercent(v(kpis, 'engine_robustness'), 0)} of the best strategy (v1 ${formatPercent(v1(catalog, 'engine_robustness'), 0)}).`,
      metric: formatPercent(v(kpis, 'engine_robustness'), 0),
      metric_label: 'robustness, worst case',
      source: 'Buffer engine',
    },
    {
      id: 'realloc',
      title: 'Reallocation pays under both views',
      body: `${formatNumber(v(kpis, 'realloc_minutes_moved'))} min moved from long sits to risky stops; nothing added.`,
      metric: range(v(kpis, 'realloc_net_value_usd'), v(kpis, 'realloc_net_value_usd_resp'), (x) => formatUsd(x)),
      metric_label: 'net value, curve – model view',
      source: 'Buffer engine',
    },
    {
      id: 'break_even',
      title: 'Adding buffer pays only when it is cheap',
      body: `Break-even ${range(v(kpis, 'engine_break_even_buffer_cost_usd'), v(kpis, 'engine_break_even_buffer_cost_usd_resp'), usd)} per ground minute; `
        + `assumed cost ${usd(v(kpis, 'cost_buffer_min_usd'))}.`,
      metric: range(v(kpis, 'engine_break_even_buffer_cost_usd'), v(kpis, 'engine_break_even_buffer_cost_usd_resp'), (x) => formatUsd(x, false)),
      metric_label: 'break-even, curve – model view',
      source: 'Buffer engine',
    },
    {
      id: 'risk',
      title: 'Risk is visible in the timetable',
      body: `The riskiest 20% of turnarounds hold ${formatPercent(v(kpis, 'top20_capture'), 0)} of late departures.`,
      metric: `AUC ${formatNumber(v(kpis, 'late_warning_auc'), 3)}`,
      metric_label: `v1 ${formatNumber(v(kpis, 'late_warning_auc_v1'), 3)}`,
      source: 'Prediction engine',
    },
  ];
}
