// GET /api/overview?budget=5: headline KPIs, strategy comparison, monthly network trend, and the summary and
// insights written from the KPI values (no numbers are hard-coded here).

import {
  type Insight, type Kpi, type MonthlyNetwork, OVERVIEW_KPIS, type OverviewKpiName, type OverviewResponse, type StrategyResult,
} from '../../shared/api-types.ts';
import { formatCompact, formatMinutes, formatMultiplier, formatNumber, formatPercent } from '../../shared/format.ts';
import { query, t } from '../db.ts';
import { HttpError } from '../http.ts';

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

  const [kpiRows, strategy, monthly, runs] = await Promise.all([
    query<Kpi & { budget_scenario: number | null }>(
      `SELECT kpi_name, value, unit, period, definition, budget_scenario FROM ${t('gold_kpi_headline')}
       WHERE kpi_name IN (${Object.keys(names).map((k) => `:${k}`).join(', ')})`,
      names,
    ),
    query<StrategyResult>(
      `SELECT strategy, day_type, absorbed_per_100_added, absorbed_min, engine_vs_this FROM ${t('gold_sim_strategy')}
       WHERE budget_scenario = :budget AND day_type IN ('normal days', 'disruption days') AND strategy <> 'No buffer'
       ORDER BY strategy, day_type`,
      { budget },
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
  const kpiBudget = kpiRows.find((r) => r.kpi_name === 'engine_uplift_vs_even')?.budget_scenario ?? null;

  return {
    kpis,
    strategy,
    monthly,
    summary: buildSummary(kpis, kpiBudget),
    insights: buildInsights(kpis, kpiBudget),
    context: { budget, kpi_budget: kpiBudget, test_period: runs[0]?.test_period ?? null, run_id: runs[0]?.run_id ?? null },
  };
}

// ---- text built from the KPI values ------------------------------------------------------------------------------

type Kpis = Record<OverviewKpiName, Kpi | null>;
const v = (kpis: Kpis, name: OverviewKpiName): number | null => kpis[name]?.value ?? null;
const budgetText = (b: number | null) => (b === null ? 'the same' : `${formatNumber(b)} extra`);

export function buildSummary(kpis: Kpis, kpiBudget: number | null): string {
  return [
    `Across ${formatCompact(v(kpis, 'scheduled_flights'))} flights, ${formatPercent(v(kpis, 'late_arrival_rate'))} arrived 15+ minutes late.`,
    `Below about ${formatNumber(v(kpis, 'absorption_threshold'))} minutes of ground time almost all inbound delay passes to the next flight.`,
    `With ${budgetText(kpiBudget)} minutes of buffer per turnaround, the engine absorbs ${formatMultiplier(v(kpis, 'engine_uplift_vs_even'))} as much delay as spreading it evenly.`,
  ].join(' ');
}

export function buildInsights(kpis: Kpis, kpiBudget: number | null): Insight[] {
  const threshold = v(kpis, 'absorption_threshold');
  const thresholdText = threshold === null ? 'ground-time' : `${formatNumber(threshold)}-minute`;
  return [
    {
      id: 'threshold',
      title: `The ${thresholdText} rule`,
      body: 'Below it, almost all delay passes on.',
      metric: formatMinutes(threshold),
      metric_label: 'of ground time',
      source: 'Delay propagation',
    },
    {
      id: 'buildup',
      title: 'Delay snowballs through the day',
      body: `Later flights leave ${formatMinutes(v(kpis, 'delay_buildup'), 1)} later.`,
      metric: `+${formatMinutes(v(kpis, 'delay_buildup'))}`,
      metric_label: '4th+ vs 1st',
      source: 'Data',
    },
    {
      id: 'risk',
      title: 'Risk is visible in the timetable',
      body: `Riskiest tenth late ${formatPercent(v(kpis, 'top_decile_late_rate'), 0)}, safest ${formatPercent(v(kpis, 'bottom_decile_late_rate'), 0)}.`,
      metric: `AUC ${formatNumber(v(kpis, 'late_warning_auc'), 2)}`,
      metric_label: `baseline ${formatNumber(v(kpis, 'late_warning_auc_baseline'), 2)}`,
      source: 'Prediction engine',
    },
    {
      id: 'placement',
      title: 'Placement beats volume',
      body: `vs even spread; 95% range ${formatNumber(v(kpis, 'engine_uplift_vs_even_ci_low'), 2)}–${formatNumber(v(kpis, 'engine_uplift_vs_even_ci_high'), 2)}.`,
      metric: formatMultiplier(v(kpis, 'engine_uplift_vs_even')),
      metric_label: `${formatPercent(v(kpis, 'engine_share_of_hindsight'), 0)} of hindsight`,
      source: 'Optimisation engine',
    },
    {
      id: 'lever',
      title: 'Buffer is a small lever',
      body: `Removes ${formatPercent(v(kpis, 'engine_pct_removed'))} of the delay passed on.`,
      metric: formatPercent(v(kpis, 'engine_pct_removed')),
      metric_label: kpiBudget === null ? 'engine buffer' : `at ${formatNumber(kpiBudget)} min buffer`,
      source: 'Optimisation engine',
    },
  ];
}
