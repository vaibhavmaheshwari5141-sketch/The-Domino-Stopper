// Buffer Planner endpoints (/api/planner/...). gold_buffer_recommendation has 1.7M rows, so every query on it is
// filtered by flight_date and budget_scenario (or by turn_id), and the table is paged on the server.

import type {
  PlannerAirport, PlannerBreakdown, PlannerBudgetOption, PlannerDay, PlannerDetail, PlannerRow, PlannerSummary,
  PlannerTurnaroundsResponse,
} from '../../shared/api-types.ts';
import { formatMinutes, formatNumber, formatPercent } from '../../shared/format.ts';
import {
  type CurvePoint, EXPORT_MAX_ROWS, PLANNER_BUDGETS, RISK_BANDS, SHOW_OPTIONS, SORT_FIELDS, type SortField, passThroughAt,
  reasonInfo,
} from '../../shared/planner.ts';
import { toCsv } from '../csv.ts';
import { type Params, query, t } from '../db.ts';
import { HttpError } from '../http.ts';
import { airportCode, intInRange, isoDate, oneOf, oneOfNumber, searchText } from '../params.ts';

const DEFAULT_BUDGET = 5;
const MAX_LIMIT = 200;
const MAX_OFFSET = 100_000;

// ---- parameters ----------------------------------------------------------------------------------------------------

interface Filters {
  date: string;
  budget: number;
  airport: string | null;
  risk_band: 'all' | (typeof RISK_BANDS)[number];
  show: (typeof SHOW_OPTIONS)[number];
  very_short: 'include' | 'exclude';
  search: string | null;
}

interface TableQuery extends Filters {
  sort: SortField;
  order: 'asc' | 'desc';
  limit: number;
  offset: number;
}

function readFilters(p: URLSearchParams): Filters {
  return {
    date: isoDate(p, 'date'),
    budget: oneOfNumber(p, 'budget', PLANNER_BUDGETS, DEFAULT_BUDGET),
    airport: airportCode(p),
    risk_band: oneOf(p, 'risk_band', ['all', ...RISK_BANDS], 'all'),
    show: oneOf(p, 'show', SHOW_OPTIONS, 'all'),
    very_short: oneOf(p, 'very_short', ['include', 'exclude'] as const, 'include'),
    search: searchText(p),
  };
}

function readTableQuery(p: URLSearchParams, maxLimit = MAX_LIMIT): TableQuery {
  const sort = oneOf(p, 'sort', SORT_FIELDS, 'day_rank');
  return {
    ...readFilters(p),
    sort,
    order: oneOf(p, 'order', ['asc', 'desc'] as const, 'asc'),
    limit: intInRange(p, 'limit', 1, maxLimit, 50),
    offset: intInRange(p, 'offset', 0, MAX_OFFSET, 0),
  };
}

/** The validated parameters as a query string: used as the cache key, so unknown or repeated parameters do not count. */
function normalised(values: object): URLSearchParams {
  return new URLSearchParams(Object.entries(values).filter(([, v]) => v !== null).map(([k, v]) => [k, String(v)]));
}

export const datesParams = (p: URLSearchParams) => normalised({ budget: oneOfNumber(p, 'budget', PLANNER_BUDGETS, DEFAULT_BUDGET) });
export const summaryParams = (p: URLSearchParams) => {
  const { date, budget, airport } = readFilters(p);
  return normalised({ date, budget, airport });
};
export const turnaroundsParams = (p: URLSearchParams) => normalised(readTableQuery(p));
export const exportParams = (p: URLSearchParams) => normalised({ ...readTableQuery(p), limit: EXPORT_MAX_ROWS, offset: 0 });
const readExportQuery = (p: URLSearchParams) => readTableQuery(p, EXPORT_MAX_ROWS);
export const airportsParams = (p: URLSearchParams) => normalised({ date: isoDate(p, 'date') });
export function detailParams(p: URLSearchParams): URLSearchParams {
  const turnId = p.get('turn_id') ?? '';
  if (!/^\d{8}-[A-Za-z0-9_-]{1,120}$/.test(turnId)) throw new HttpError(400, 'turn_id is not a valid turnaround id');
  return normalised({ turn_id: turnId, budget: oneOfNumber(p, 'budget', PLANNER_BUDGETS, DEFAULT_BUDGET) });
}

// ---- SQL pieces ----------------------------------------------------------------------------------------------------

const from = () => `${t('gold_buffer_recommendation')} r JOIN ${t('gold_ml_predictions')} p ON p.turn_id = r.turn_id`;

function where(f: Filters): { sql: string; params: Params } {
  const clauses = ['r.flight_date = CAST(:date AS DATE)', 'r.budget_scenario = :budget', 'p.flight_date = CAST(:date AS DATE)'];
  const params: Params = { date: f.date, budget: f.budget };
  if (f.airport) {
    clauses.push('r.airport = :airport');
    params.airport = f.airport;
  }
  if (f.risk_band !== 'all') {
    clauses.push('p.risk_band = :risk_band');
    params.risk_band = f.risk_band;
  }
  if (f.show === 'buffered') clauses.push('r.recommended_extra_min > 0');
  if (f.show === 'not_buffered') clauses.push('r.recommended_extra_min = 0');
  if (f.very_short === 'exclude') clauses.push('NOT COALESCE(p.very_short_turn_flag, FALSE)');
  if (f.search) {
    // Tail number contains the text, or the text is a flight number (with or without "AA") on either leg
    const flight = /^(?:AA)?(\d{1,4})$/.exec(f.search);
    clauses.push(flight
      ? '(UPPER(p.tail_number) LIKE :tail OR p.inbound_flight_no = :flight OR p.outbound_flight_no = :flight)'
      : 'UPPER(p.tail_number) LIKE :tail');
    params.tail = `%${f.search}%`;      // letters and digits only (searchText), so no LIKE wildcards from the user
    if (flight) params.flight = Number(flight[1]);
  }
  return { sql: clauses.join(' AND '), params };
}

const SORT_SQL: Record<SortField, string> = {
  day_rank: 'r.day_rank',
  recommended_extra_min: 'r.recommended_extra_min',
  expected_absorbed_min: 'r.expected_absorbed_min',
  p_late15: 'p.p_late15',
  pred_inbound_delay_min: 'p.pred_inbound_delay_min',
  sched_outbound_dep_utc: 'p.sched_outbound_dep_utc',
  current_ground_min: 'r.current_ground_min',
};

const ROW_COLUMNS = `r.turn_id, r.flight_date, r.airport, p.tail_number, p.inbound_from, p.outbound_to, p.inbound_flight_no,
  p.outbound_flight_no, p.sched_outbound_dep_utc, r.current_ground_min, COALESCE(p.very_short_turn_flag, FALSE) AS very_short_turn_flag,
  p.risk_band, p.p_late15, p.pred_inbound_delay_min, r.day_rank, r.recommended_extra_min, r.new_ground_min,
  r.expected_absorbed_min, r.reason_code, p.actual_inbound_delay_min, r.realised_absorbed_min,
  COALESCE(r.late_avoided_flag, FALSE) AS late_avoided_flag`;

async function tableRows(q: TableQuery): Promise<PlannerRow[]> {
  const w = where(q);
  // sort and order come from allow-lists; limit and offset are validated integers, written into the SQL as numbers
  return query<PlannerRow>(
    `SELECT ${ROW_COLUMNS} FROM ${from()} WHERE ${w.sql}
     ORDER BY ${SORT_SQL[q.sort]} ${q.order === 'desc' ? 'DESC' : 'ASC'} NULLS LAST, p.p_late15 DESC, r.turn_id
     LIMIT ${q.limit} OFFSET ${q.offset}`,
    w.params,
  );
}

async function breakdown(f: Filters): Promise<PlannerBreakdown> {
  const w = where(f);
  const rows = await query<{ reason_code: string | null; risk_band: string | null; turnarounds: number; with_buffer: number }>(
    `SELECT r.reason_code, p.risk_band, COUNT(*) AS turnarounds,
            SUM(CASE WHEN r.recommended_extra_min > 0 THEN 1 ELSE 0 END) AS with_buffer
     FROM ${from()} WHERE ${w.sql} GROUP BY r.reason_code, p.risk_band`,
    w.params,
  );
  const reasons = new Map<string, number>();
  const bands = new Map<string, { turnarounds: number; with_buffer: number }>(RISK_BANDS.map((b) => [b, { turnarounds: 0, with_buffer: 0 }]));
  for (const r of rows) {
    const reason = r.reason_code ?? 'No reason given';
    reasons.set(reason, (reasons.get(reason) ?? 0) + r.turnarounds);
    const band = bands.get(r.risk_band ?? 'Unknown') ?? { turnarounds: 0, with_buffer: 0 };
    band.turnarounds += r.turnarounds;
    band.with_buffer += r.with_buffer;
    bands.set(r.risk_band ?? 'Unknown', band);
  }
  return {
    total: rows.reduce((s, r) => s + r.turnarounds, 0),
    reasons: [...reasons].map(([reason_code, turnarounds]) => ({ reason_code, turnarounds })).sort((a, b) => b.turnarounds - a.turnarounds),
    risk_bands: [...bands].map(([risk_band, v]) => ({ risk_band, ...v })),
  };
}

// ---- endpoints -----------------------------------------------------------------------------------------------------

export async function getDates(p: URLSearchParams): Promise<PlannerDay[]> {
  return query<PlannerDay>(
    `SELECT flight_date, turnarounds, turnarounds_with_buffer, buffer_used_min, budget_min, realised_absorbed_min,
            COALESCE(is_disruption_day, FALSE) AS is_disruption_day
     FROM ${t('gold_buffer_plan_daily')} WHERE budget_scenario = :budget ORDER BY flight_date`,
    { budget: Number(p.get('budget')) },
  );
}

export async function getSummary(p: URLSearchParams): Promise<PlannerSummary> {
  const f = readFilters(p);
  const day = { date: f.date, budget: f.budget };

  type Totals = Omit<PlannerSummary, 'date' | 'budget' | 'airport' | 'breakdown' | 'absorption_threshold_min'>;
  const [plan, airportTotals, counts, threshold] = await Promise.all([
    query<Totals>(
      `SELECT turnarounds, turnarounds_with_buffer, buffer_used_min, budget_min, expected_absorbed_min, realised_absorbed_min,
              late_departures_avoided, COALESCE(is_disruption_day, FALSE) AS is_disruption_day
       FROM ${t('gold_buffer_plan_daily')} WHERE flight_date = CAST(:date AS DATE) AND budget_scenario = :budget`,
      day,
    ),
    f.airport
      ? query<Omit<Totals, 'budget_min' | 'is_disruption_day'>>(
        `SELECT COUNT(*) AS turnarounds, SUM(CASE WHEN recommended_extra_min > 0 THEN 1 ELSE 0 END) AS turnarounds_with_buffer,
                COALESCE(SUM(recommended_extra_min), 0) AS buffer_used_min, SUM(expected_absorbed_min) AS expected_absorbed_min,
                SUM(realised_absorbed_min) AS realised_absorbed_min,
                SUM(CASE WHEN late_avoided_flag THEN 1 ELSE 0 END) AS late_departures_avoided
         FROM ${t('gold_buffer_recommendation')}
         WHERE flight_date = CAST(:date AS DATE) AND budget_scenario = :budget AND airport = :airport`,
        { ...day, airport: f.airport },
      )
      : Promise.resolve(null),
    breakdown({ ...f, risk_band: 'all', show: 'all', very_short: 'include', search: null }),
    query<{ value: number | null }>(`SELECT value FROM ${t('gold_kpi_headline')} WHERE kpi_name = 'absorption_threshold'`),
  ]);

  const network = plan[0];
  if (!network) throw new HttpError(404, `No buffer plan for ${f.date} at ${f.budget} min`);
  const totals: Totals = airportTotals?.[0]
    ? { ...airportTotals[0], late_departures_avoided: airportTotals[0].late_departures_avoided ?? 0,
        turnarounds_with_buffer: airportTotals[0].turnarounds_with_buffer ?? 0,
        budget_min: airportTotals[0].turnarounds * f.budget, is_disruption_day: network.is_disruption_day }
    : network;

  return { date: f.date, budget: f.budget, airport: f.airport, ...totals, breakdown: counts, absorption_threshold_min: threshold[0]?.value ?? null };
}

export async function getTurnarounds(p: URLSearchParams): Promise<PlannerTurnaroundsResponse> {
  const q = readTableQuery(p);
  const [rows, counts] = await Promise.all([tableRows(q), breakdown(q)]);
  return { rows, total: counts.total, breakdown: counts };
}

export async function getAirports(p: URLSearchParams): Promise<PlannerAirport[]> {
  return query<PlannerAirport>(
    `SELECT airport, COUNT(*) AS turnarounds FROM ${t('gold_ml_predictions')}
     WHERE flight_date = CAST(:date AS DATE) GROUP BY airport ORDER BY turnarounds DESC, airport`,
    { date: isoDate(p, 'date') },
  );
}

export async function getDetail(p: URLSearchParams): Promise<PlannerDetail> {
  const turnId = p.get('turn_id')!;
  const budget = Number(p.get('budget'));
  const [preds, recs, runs] = await Promise.all([
    query<Record<string, unknown>>(
      `SELECT turn_id, flight_date, airport, tail_number, inbound_from, outbound_to, inbound_flight_no, outbound_flight_no,
              sched_inbound_arr_utc, sched_outbound_dep_utc, sched_ground_min, COALESCE(very_short_turn_flag, FALSE) AS very_short_turn_flag,
              leg_of_day, COALESCE(is_top10_airport, FALSE) AS is_top10_airport, COALESCE(is_disruption_day, FALSE) AS is_disruption_day,
              p_late15, pred_outbound_delay_min, pred_inbound_delay_min, risk_decile, risk_band, actual_inbound_delay_min,
              actual_outbound_delay_min, actual_late15, model_version
       FROM ${t('gold_ml_predictions')} WHERE turn_id = :turn_id`,
      { turn_id: turnId },
    ),
    query<PlannerBudgetOption & { current_ground_min: number | null; late_avoided_flag: boolean | null; value_per_buffer_min: number | null;
      engine_version: string | null; curve_version: string | null }>(
      `SELECT budget_scenario, current_ground_min, recommended_extra_min, new_ground_min, expected_absorbed_min, realised_absorbed_min,
              late_avoided_flag, value_per_buffer_min, day_rank, reason_code, engine_version, curve_version
       FROM ${t('gold_buffer_recommendation')} WHERE turn_id = :turn_id ORDER BY budget_scenario`,
      { turn_id: turnId },
    ),
    query<{ curve_points: string | null }>(`SELECT curve_points FROM ${t('gold_engine_run_log')} ORDER BY run_timestamp_utc DESC LIMIT 1`),
  ]);

  const pred = preds[0];
  const rec = recs.find((r) => r.budget_scenario === budget);
  if (!pred || !rec) throw new HttpError(404, `Turnaround ${turnId} not found at ${budget} min`);

  const pLate = (pred.p_late15 as number | null) ?? null;
  const share = pLate === null ? [] : await query<{ share: number | null }>(
    `SELECT SUM(CASE WHEN p_late15 >= :p THEN 1 ELSE 0 END) * 1.0 / COUNT(*) AS share
     FROM ${t('gold_ml_predictions')} WHERE flight_date = CAST(:date AS DATE)`,
    { p: pLate, date: String(pred.flight_date) },
  );

  const curve = parseCurve(runs[0]?.curve_points ?? null);
  const turnaround = {
    ...(pred as object),
    current_ground_min: rec.current_ground_min ?? (pred.sched_ground_min as number | null),
    budget_scenario: rec.budget_scenario,
    day_rank: rec.day_rank,
    recommended_extra_min: rec.recommended_extra_min,
    new_ground_min: rec.new_ground_min,
    expected_absorbed_min: rec.expected_absorbed_min,
    realised_absorbed_min: rec.realised_absorbed_min,
    late_avoided_flag: rec.late_avoided_flag ?? false,
    value_per_buffer_min: rec.value_per_buffer_min,
    reason_code: rec.reason_code,
    engine_version: rec.engine_version,
    curve_version: rec.curve_version,
  } as PlannerDetail['turnaround'];

  return {
    turnaround,
    budgets: recs.map(({ budget_scenario, recommended_extra_min, new_ground_min, expected_absorbed_min, realised_absorbed_min, day_rank, reason_code }) =>
      ({ budget_scenario, recommended_extra_min, new_ground_min, expected_absorbed_min, realised_absorbed_min, day_rank, reason_code })),
    curve,
    day_risk_share: share[0]?.share ?? null,
    reason_sentence: reasonInfo(rec.reason_code).sentence,
    why: whyBullets(turnaround, share[0]?.share ?? null, curve),
  };
}

export function parseCurve(json: string | null): CurvePoint[] {
  try {
    const obj = JSON.parse(json ?? '{}') as Record<string, unknown>;
    return Object.entries(obj)
      .map(([k, v]) => ({ ground_min: Number(k), pass_through: Number(v) }))
      .filter((c) => Number.isFinite(c.ground_min) && Number.isFinite(c.pass_through))
      .sort((a, b) => a.ground_min - b.ground_min);
  } catch {
    return [];
  }
}

/** Three plain sentences explaining the recommendation, built from the values. */
export function whyBullets(tr: PlannerDetail['turnaround'], dayShare: number | null, curve: CurvePoint[]): string[] {
  const riskContext = dayShare === null ? ''
    : dayShare <= 0.5 ? ` (riskiest ${formatPercent(dayShare, 0)} of the day)`
      : ` (lower than ${formatPercent(1 - dayShare, 0)} of the day's turnarounds)`;
  const cur = tr.current_ground_min;
  const next = tr.new_ground_min;
  const passOn = (g: number | null) => formatPercent(passThroughAt(curve, g), 0);

  let ground: string;
  if (tr.recommended_extra_min > 0 && cur !== null && next !== null) {
    ground = `At ${formatNumber(cur)} min of ground time the curve passes on ${passOn(cur)} of delay; at ${formatNumber(next)} min it passes on ${passOn(next)}.`;
  } else if (reasonInfo(tr.reason_code).short === 'Lower value than others') {
    ground = `Each buffer minute here would absorb ${formatNumber(tr.value_per_buffer_min, 2)} min of delay, less than the turnarounds that got the budget.`;
  } else {
    ground = `At ${formatNumber(cur)} min of ground time the curve passes on ${passOn(cur)} of delay.`;
  }
  return [
    `Late chance ${formatPercent(tr.p_late15, 0)}${riskContext}.`,
    `Predicted inbound delay ${formatMinutes(tr.pred_inbound_delay_min, 1)}.`,
    ground,
  ];
}

// ---- CSV export ----------------------------------------------------------------------------------------------------

const CSV_COLUMNS: [header: string, value: (r: PlannerRow) => unknown][] = [
  ['flight_date', (r) => r.flight_date], ['airport', (r) => r.airport], ['turn_id', (r) => r.turn_id],
  ['tail_number', (r) => r.tail_number], ['inbound_flight', (r) => r.inbound_flight_no && `AA${r.inbound_flight_no}`],
  ['inbound_from', (r) => r.inbound_from], ['outbound_flight', (r) => r.outbound_flight_no && `AA${r.outbound_flight_no}`],
  ['outbound_to', (r) => r.outbound_to], ['sched_outbound_dep_utc', (r) => r.sched_outbound_dep_utc],
  ['planned_ground_min', (r) => r.current_ground_min], ['very_short_turn', (r) => r.very_short_turn_flag],
  ['risk_band', (r) => r.risk_band], ['late_chance', (r) => r.p_late15], ['pred_inbound_delay_min', (r) => r.pred_inbound_delay_min],
  ['day_rank', (r) => r.day_rank], ['recommended_extra_min', (r) => r.recommended_extra_min], ['new_ground_min', (r) => r.new_ground_min],
  ['expected_absorbed_min', (r) => r.expected_absorbed_min], ['reason', (r) => r.reason_code],
  ['backtest_actual_inbound_delay_min', (r) => r.actual_inbound_delay_min], ['backtest_realised_absorbed_min', (r) => r.realised_absorbed_min],
  ['backtest_late_departure_avoided', (r) => r.late_avoided_flag],
];

export async function getExport(p: URLSearchParams): Promise<{ filename: string; body: string }> {
  const q = readExportQuery(p);
  const rows = await tableRows(q);
  const body = toCsv(CSV_COLUMNS.map(([h]) => h), rows.map((r) => CSV_COLUMNS.map(([, get]) => get(r))));
  const scope = q.airport ? `_${q.airport}` : '';
  return { filename: `buffer-plan_${q.date}_budget-${q.budget}${scope}.csv`, body };
}
