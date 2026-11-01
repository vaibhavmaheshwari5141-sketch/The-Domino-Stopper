// Risk Forecast endpoints (/api/risk/...): the prediction engine's output on its own, from gold_ml_predictions,
// and how well it matches reality (gold_model_deciles, gold_model_metrics, gold_feature_importance).

import type {
  FeatureImportance, ModelDecile, ModelMetric, ModelQuality, RiskGroundBand, RiskHeatCell, RiskHeatmap, RiskSummary, RiskTrendRow,
  RiskTurnaround,
} from '../../shared/api-types.ts';
import { formatPercent } from '../../shared/format.ts';
import { type Params, ident, query, t } from '../db.ts';
import { airportCode, dateRange, intInRange, isoDate, oneOf } from '../params.ts';

/** The test period; used when the page does not send a range. */
export const TEST_PERIOD = { start: '2026-01-01', end: '2026-08-31' };
const METRICS = ['p_late15', 'pred_inbound_delay_min'] as const;
const MIN_CELL = 30;
const MODELS = ['late_warning', 'inbound_risk'];
const GROUND_BANDS = ['Up to 45 min', '46–55 min', '56–65 min', '66–80 min', '81–120 min', 'Over 120 min'];

const normalised = (values: Record<string, string | number | null>) =>
  new URLSearchParams(Object.entries(values).filter(([, v]) => v !== null).map(([k, v]) => [k, String(v)]));

export const summaryParams = (p: URLSearchParams) => normalised({ ...dateRange(p, TEST_PERIOD), airport: airportCode(p) });
export const heatmapParams = (p: URLSearchParams) =>
  normalised({ ...dateRange(p, TEST_PERIOD), metric: oneOf(p, 'metric', METRICS, 'p_late15'), top: intInRange(p, 'top', 5, 40, 20) });
export const airportParams = (p: URLSearchParams) => normalised({ airport: airportCode(p) });
export const topParams = (p: URLSearchParams) =>
  normalised({ date: isoDate(p, 'date', '2026-03-15'), airport: airportCode(p), limit: intInRange(p, 'limit', 1, 100, 20) });

/** Shared WHERE for a date range and an optional airport. */
function rangeWhere(p: URLSearchParams): { sql: string; params: Params } {
  const params: Params = { start: p.get('start')!, end: p.get('end')! };
  let sql = 'flight_date BETWEEN CAST(:start AS DATE) AND CAST(:end AS DATE)';
  if (p.get('airport')) {
    sql += ' AND airport = :airport';
    params.airport = p.get('airport');
  }
  return { sql, params };
}

/** Actual late share, ignoring turnarounds without an actual result. */
const ACTUAL_LATE = 'AVG(CASE WHEN actual_late15 IS NULL THEN NULL WHEN actual_late15 THEN 1.0 ELSE 0.0 END)';

// ---- endpoints -----------------------------------------------------------------------------------------------------

export async function getSummary(p: URLSearchParams): Promise<RiskSummary> {
  const w = rangeWhere(p);
  const [row] = await query<Omit<RiskSummary, 'start' | 'end' | 'airport'>>(
    `SELECT COUNT(*) AS turnarounds, AVG(p_late15) AS avg_late_chance,
            AVG(CASE WHEN p_late15 >= 0.5 THEN 1.0 ELSE 0.0 END) AS predicted_late_share, ${ACTUAL_LATE} AS actual_late_share,
            SUM(CASE WHEN risk_band = 'High' THEN 1 ELSE 0 END) AS high, SUM(CASE WHEN risk_band = 'Medium' THEN 1 ELSE 0 END) AS medium,
            SUM(CASE WHEN risk_band = 'Low' THEN 1 ELSE 0 END) AS low, AVG(pred_inbound_delay_min) AS avg_pred_inbound_delay_min
     FROM ${t('gold_ml_predictions')} WHERE ${w.sql}`,
    w.params,
  );
  return {
    start: p.get('start')!, end: p.get('end')!, airport: p.get('airport'),
    ...row, high: row.high ?? 0, medium: row.medium ?? 0, low: row.low ?? 0,
  };
}

export async function getHeatmap(p: URLSearchParams): Promise<RiskHeatmap> {
  const metric = p.get('metric') as RiskHeatmap['metric'];      // from the allow-list, so safe to name in SQL
  const top = Number(p.get('top'));                              // validated integer
  const w = rangeWhere(p);
  // `hour` is a date-part keyword in SQL, so the column is called dep_hour in the query
  const rows = await query<{ airport: string; airport_turnarounds: number; dep_hour: number; turnarounds: number; value: number | null }>(
    `WITH f AS (
       SELECT airport, sched_dep_hour_local AS dep_hour, ${metric} AS v FROM ${t('gold_ml_predictions')} WHERE ${w.sql}
     ), busiest AS (
       SELECT airport, COUNT(*) AS n FROM f GROUP BY airport ORDER BY n DESC, airport LIMIT ${top}
     )
     SELECT f.airport, b.n AS airport_turnarounds, f.dep_hour, COUNT(*) AS turnarounds, AVG(f.v) AS value
     FROM f JOIN busiest b ON b.airport = f.airport
     GROUP BY f.airport, b.n, f.dep_hour`,
    w.params,
  );
  const airports = [...new Map(rows.map((r) => [r.airport, r.airport_turnarounds])).entries()]
    .map(([airport, turnarounds]) => ({ airport, turnarounds }))
    .sort((a, b) => b.turnarounds - a.turnarounds || a.airport.localeCompare(b.airport));
  const hours = [...new Set(rows.map((r) => r.dep_hour))].sort((a, b) => a - b);
  const cells: RiskHeatCell[] = rows
    .map((r) => ({ airport: r.airport, hour: r.dep_hour, turnarounds: r.turnarounds, value: r.turnarounds >= MIN_CELL ? r.value : null }))
    .sort((a, b) => a.airport.localeCompare(b.airport) || a.hour - b.hour);
  return { metric, min_turnarounds: MIN_CELL, airports, hours, cells };
}

export async function getTrend(p: URLSearchParams): Promise<RiskTrendRow[]> {
  const airport = p.get('airport');
  return query<RiskTrendRow>(
    `SELECT year_month, COUNT(*) AS turnarounds, AVG(p_late15) AS avg_late_chance, ${ACTUAL_LATE} AS actual_late_share
     FROM ${t('gold_ml_predictions')} ${airport ? 'WHERE airport = :airport' : ''}
     GROUP BY year_month ORDER BY year_month`,
    airport ? { airport } : {},
  );
}

export async function getByGroundTime(p: URLSearchParams): Promise<RiskGroundBand[]> {
  const airport = p.get('airport');
  const rows = await query<Omit<RiskGroundBand, 'band'> & { band_order: number }>(
    `SELECT CASE WHEN sched_ground_min <= 45 THEN 1 WHEN sched_ground_min <= 55 THEN 2 WHEN sched_ground_min <= 65 THEN 3
                 WHEN sched_ground_min <= 80 THEN 4 WHEN sched_ground_min <= 120 THEN 5 ELSE 6 END AS band_order,
            COUNT(*) AS turnarounds, AVG(p_late15) AS avg_late_chance, AVG(pred_inbound_delay_min) AS avg_pred_inbound_delay_min,
            ${ACTUAL_LATE} AS actual_late_share
     FROM ${t('gold_ml_predictions')} WHERE sched_ground_min IS NOT NULL ${airport ? 'AND airport = :airport' : ''}
     GROUP BY 1 ORDER BY 1`,
    airport ? { airport } : {},
  );
  return rows.map(({ band_order, ...r }) => ({ band: GROUND_BANDS[band_order - 1], ...r }));
}

export async function getModelQuality(): Promise<ModelQuality> {
  const models = { m0: MODELS[0], m1: MODELS[1] };
  const [deciles, metrics, features] = await Promise.all([
    query<ModelDecile>(
      `SELECT model, period, decile, turnarounds, predicted, observed, unit FROM ${t('gold_model_deciles')}
       WHERE model IN (:m0, :m1) ORDER BY model, period, decile`,
      models,
    ),
    query<ModelMetric>(
      `SELECT model, predictor, period, measure, value FROM ${t('gold_model_metrics')}
       WHERE model IN (:m0, :m1) AND period = 'test' ORDER BY model, measure, period, predictor`,
      models,
    ),
    query<FeatureImportance>(
      `SELECT model, feature, feature_label, importance_pct, ${ident('rank')} FROM ${t('gold_feature_importance')}
       WHERE model IN (:m0, :m1) ORDER BY model, ${ident('rank')}`,
      models,
    ),
  ]);
  return { deciles, metrics, features, decile_caption: decileCaption(deciles) };
}

/** "The riskiest tenth was late 64% of the time; the safest 11%." from the late-warning model on the test months. */
export function decileCaption(deciles: ModelDecile[]): string {
  const test = deciles.filter((d) => d.model === 'late_warning' && d.period === 'test');
  const top = test.find((d) => d.decile === 10);
  const bottom = test.find((d) => d.decile === 1);
  if (!top || !bottom) return 'Decile results are not available.';
  return `The riskiest tenth was late ${formatPercent(top.observed, 0)} of the time; the safest ${formatPercent(bottom.observed, 0)}.`;
}

export async function getTopTurnarounds(p: URLSearchParams): Promise<RiskTurnaround[]> {
  const airport = p.get('airport');
  const limit = Number(p.get('limit'));                         // validated integer
  return query<RiskTurnaround>(
    `SELECT turn_id, flight_date, airport, inbound_from, outbound_to, inbound_flight_no, outbound_flight_no, tail_number,
            sched_outbound_dep_utc, sched_ground_min, risk_band, p_late15, p_late15_v1, pred_inbound_delay_min, actual_inbound_delay_min,
            actual_outbound_delay_min, actual_late15
     FROM ${t('gold_ml_predictions')}
     WHERE flight_date = CAST(:date AS DATE) ${airport ? 'AND airport = :airport' : ''}
     ORDER BY p_late15 DESC, turn_id LIMIT ${limit}`,
    airport ? { date: p.get('date')!, airport } : { date: p.get('date')! },
  );
}

/** Airports with turnarounds in the range, busiest first (for the airport filter). */
export const rangeParams = (p: URLSearchParams) => normalised(dateRange(p, TEST_PERIOD));

export async function getAirports(p: URLSearchParams): Promise<{ airport: string; turnarounds: number }[]> {
  return query<{ airport: string; turnarounds: number }>(
    `SELECT airport, COUNT(*) AS turnarounds FROM ${t('gold_ml_predictions')}
     WHERE flight_date BETWEEN CAST(:start AS DATE) AND CAST(:end AS DATE)
     GROUP BY airport ORDER BY turnarounds DESC, airport`,
    { start: p.get('start')!, end: p.get('end')! },
  );
}
