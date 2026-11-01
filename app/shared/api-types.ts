// Response shapes of the API. Imported by the server (server/) and by the React app (src/lib/api.ts).

import type { EngineMode, Evaluator, EvaluatorChoice } from './kpis.ts';

export type DataMode = 'databricks' | 'local';

export interface HealthResponse {
  status: 'ok' | 'degraded';
  data_mode: DataMode;
  database_ok: boolean;
}

/** The latest row of gold_engine_run_log: which data, periods and versions produced every gold table. */
export interface EngineRun {
  run_id: string;
  run_timestamp_utc: string | null;
  data_tag: string | null;
  train_period: string | null;
  validate_period: string | null;
  test_period: string | null;
  model_version: string | null;
  engine_version: string | null;
  curve_version: string | null;
  main_budget: number | null;
  checks_passed: number | null;
  checks_total: number | null;
}

/** One row of gold_table_catalog. */
export interface CatalogEntry {
  table_name: string;
  grain: string | null;
  dashboard_page: string | null;
  description: string | null;
  rows: number | null;
}

export interface MetaResponse {
  run: EngineRun;
  tables: CatalogEntry[];
}

export interface ErrorResponse {
  detail: string;
}

// ---- GET /api/overview?budget=5 -----------------------------------------------------------------------------------

/** The gold_kpi_headline rows the Overview page uses. */
export const OVERVIEW_KPIS = [
  'scheduled_flights', 'late_arrival_rate', 'absorption_threshold', 'late_warning_auc', 'late_warning_auc_v1', 'top20_capture',
  'engine_prevented_per_100', 'engine_prevented_per_100_resp', 'engine_v1_prevented_per_100', 'engine_v1_prevented_per_100_resp',
  'engine_otp_change_pp', 'engine_otp_change_pp_resp', 'engine_robustness', 'engine_break_even_buffer_cost_usd',
  'engine_break_even_buffer_cost_usd_resp', 'realloc_minutes_moved', 'realloc_net_value_usd', 'realloc_net_value_usd_resp',
  'guardrail_eligible_share', 'guardrail_max_airport_share', 'cost_delay_min_usd', 'cost_buffer_min_usd', 'delay_buildup',
] as const;

export type OverviewKpiName = (typeof OVERVIEW_KPIS)[number];

/** One row of gold_kpi_headline. */
export interface Kpi {
  kpi_name: string;
  value: number | null;
  unit: string | null;
  period: string | null;
  definition: string | null;
}

/** gold_network_daily grouped by month; rates and delays weighted by operated flights. */
export interface MonthlyNetwork {
  year_month: string;
  late_arrival_rate: number | null;
  avg_arrival_delay_min: number | null;
  operated_flights: number | null;
  disruption_days: number;
}

export type InsightSource = 'Prediction engine' | 'Buffer engine' | 'Delay propagation' | 'Data';

export interface Insight {
  id: string;
  title: string;
  body: string;
  metric: string;
  metric_label: string;
  source: InsightSource;
}

export interface OverviewResponse {
  /** Every name in OVERVIEW_KPIS; null when the table has no such row. */
  kpis: Record<OverviewKpiName, Kpi | null>;
  /** gold_engine_kpis at the budget, all days, both views (one row per strategy and view). */
  engine_kpis: EngineKpiRow[];
  /** The Guardrail rows of gold_kpi_catalog. */
  guardrails: KpiCatalogRow[];
  monthly: MonthlyNetwork[];
  summary: string;
  insights: Insight[];
  context: {
    budget: number;                 // budget of the strategy comparison (extra minutes per turnaround)
    kpi_budget: number | null;      // budget behind the engine KPIs (the run's main budget)
    test_period: string | null;
    run_id: string | null;
  };
}

// ---- GET /api/overview/airports?budget=5 ----------------------------------------------------------------------------

export type ImpactBand = 'High' | 'Medium' | 'Low';

/**
 * One airport on the Overview map: gold_dim_airport with coordinates from ref_airports_tz, gold_airport_month summed
 * over all months (rates weighted by flights), the engine plan from gold_buffer_plan_airport (test period, one budget),
 * and the delay impact score built from them.
 */
export interface AirportImpact {
  airport: string;
  name: string | null;
  city: string | null;
  state: string | null;
  lat: number;
  lon: number;
  departure_rank: number | null;
  is_top10: boolean;
  departures: number | null;
  turnarounds: number | null;
  late_departure_rate: number | null;
  late_arrival_rate: number | null;
  avg_dep_delay_min: number | null;
  cancel_rate: number | null;
  short_turn_share: number | null;           // planned ground time of 55 minutes or less
  propagated_delay_min: number | null;       // knock-on delay: inbound delay still there at the next departure
  knock_on_per_turn_min: number | null;
  network_knock_on_share: number | null;     // share of all airports' knock-on delay
  buffer_min: number | null;                 // engine plan at the requested budget
  realised_absorbed_min: number | null;
  late_departures_avoided: number | null;
  /** 0 to 100: weighted percentile rank among all airports on IMPACT_COMPONENTS. Null if no component has a value. */
  impact_score: number | null;
  impact_band: ImpactBand | null;
  impact_rank: number | null;                // 1 = most impacted
}

/**
 * What goes into the delay impact score, with weights summing to 1: how often flights leave late, how much delay each
 * turnaround passes on, and how much of the network's knock-on delay starts here (so a small outstation with a few
 * bad months cannot outrank a hub). Short-turn share is left out: outstations turn almost every aircraft in under
 * 55 minutes, and knock-on delay per turnaround already reflects short turns.
 */
export const IMPACT_COMPONENTS = [
  { key: 'late_departure_rate', label: 'Late departures (15+ min)', weight: 0.35 },
  { key: 'knock_on_per_turn_min', label: 'Knock-on delay per turnaround', weight: 0.25 },
  { key: 'network_knock_on_share', label: 'Share of network knock-on delay', weight: 0.4 },
] as const satisfies readonly { key: keyof AirportImpact; label: string; weight: number }[];

/** Lowest score in each band. */
export const IMPACT_BANDS: { band: ImpactBand; min: number }[] = [
  { band: 'High', min: 70 },
  { band: 'Medium', min: 40 },
  { band: 'Low', min: 0 },
];

export interface AirportImpactResponse {
  airports: AirportImpact[];
  context: {
    budget: number;                    // budget behind the engine columns
    period: string | null;             // months behind the delay measures, e.g. "2025-01 to 2026-08"
    plan_period: string | null;        // months behind the engine plan
    missing_coordinates: string[];     // airports left off the map because ref_airports_tz has no position
    months: string[];                  // every month with airport data, for the period filter
    budgets: number[];                 // every budget in the engine plan, for the budget filter
  };
}

// ---- Buffer Planner (/api/planner/...) -----------------------------------------------------------------------------

/** GET /api/planner/dates: one row of gold_buffer_plan_daily per day. */
export interface PlannerDay {
  flight_date: string;
  turnarounds: number;
  turnarounds_with_buffer: number;
  buffer_used_min: number;
  budget_min: number;
  realised_absorbed_min: number | null;
  is_disruption_day: boolean;
}

export interface PlannerBreakdown {
  total: number;
  reasons: { reason_code: string; turnarounds: number }[];
  risk_bands: { risk_band: string; turnarounds: number; with_buffer: number }[];
}

/** GET /api/planner/summary: totals for a day (network, or one airport) and its reason / risk-band counts. */
export interface PlannerSummary {
  date: string;
  budget: number;
  airport: string | null;
  turnarounds: number;
  turnarounds_with_buffer: number;
  buffer_used_min: number;
  /** Network: the day's budget. Airport: that airport's turnarounds x budget (its share; the engine allocates network-wide). */
  budget_min: number;
  expected_absorbed_min: number | null;
  realised_absorbed_min: number | null;
  late_departures_avoided: number;
  is_disruption_day: boolean;
  breakdown: PlannerBreakdown;
  absorption_threshold_min: number | null;
}

/** One turnaround in the recommendations table: prediction, recommendation and backtest fields. */
export interface PlannerRow {
  turn_id: string;
  flight_date: string;
  airport: string;
  tail_number: string | null;
  inbound_from: string | null;
  outbound_to: string | null;
  inbound_flight_no: number | null;
  outbound_flight_no: number | null;
  sched_outbound_dep_utc: string | null;
  current_ground_min: number | null;
  very_short_turn_flag: boolean;
  risk_band: string | null;
  p_late15: number | null;
  pred_inbound_delay_min: number | null;
  day_rank: number | null;
  recommended_extra_min: number;
  new_ground_min: number | null;
  expected_absorbed_min: number | null;
  reason_code: string | null;
  /** Segment of the engine v2 curve, e.g. "Ten busiest | Morning". */
  segment: string | null;
  /** 1 minute prevented here is worth about this many minutes across the aircraft's day. */
  chain_multiplier: number | null;
  protects_later_flights: boolean;
  actual_inbound_delay_min: number | null;
  /** Minutes prevented in the 2026 replay through the aircraft's day, curve view. */
  realised_absorbed_min: number | null;
  /** Same, model view (main budget only; null otherwise). */
  realised_absorbed_resp_min: number | null;
  late_avoided_flag: boolean;
}

/** GET /api/planner/turnarounds */
export interface PlannerTurnaroundsResponse {
  rows: PlannerRow[];
  total: number;
  /** Reason and risk-band counts for the same filters (all pages), for "Why the engine chose these". */
  breakdown: PlannerBreakdown;
}

export interface PlannerBudgetOption {
  budget_scenario: number;
  recommended_extra_min: number;
  new_ground_min: number | null;
  expected_absorbed_min: number | null;
  realised_absorbed_min: number | null;
  day_rank: number | null;
  reason_code: string | null;
}

/** GET /api/planner/turnaround/{turn_id} */
export interface PlannerDetail {
  turnaround: PlannerRow & {
    budget_scenario: number;
    eligible_flag: boolean | null;
    sched_inbound_arr_utc: string | null;
    leg_of_day: number | null;
    is_top10_airport: boolean;
    is_disruption_day: boolean;
    pred_outbound_delay_min: number | null;
    risk_decile: number | null;
    actual_outbound_delay_min: number | null;
    actual_late15: boolean | null;
    value_per_buffer_min: number | null;
    model_version: string | null;
    engine_version: string | null;
    curve_version: string | null;
  };
  budgets: PlannerBudgetOption[];
  /** The pass-through curve the engine used here: the turnaround's v2 segment curve, or the single curve. */
  curve: { ground_min: number; pass_through: number }[];
  curve_label: string;
  /** Share of the day's turnarounds with a late chance at least this high. */
  day_risk_share: number | null;
  reason_sentence: string;
  why: string[];
}

/** GET /api/planner/airports */
export interface PlannerAirport {
  airport: string;
  turnarounds: number;
}

/** One turnaround that gives or receives minutes in reallocate mode (gold_buffer_reallocation, main budget). */
export interface ReallocationRow {
  turn_id: string;
  flight_date: string;
  tail_number: string;
  airport: string;
  role: 'receives' | 'gives';
  /** Minutes moved: + received, - given. */
  change_min: number;
  current_ground_min: number | null;
  new_ground_min: number | null;
  /** Expected change in delay prevented (midpoint of the two views); negative where minutes are given away. */
  expected_change_min: number | null;
  realised_absorbed_min: number | null;
  realised_absorbed_resp_min: number | null;
  inbound_from: string | null;
  outbound_to: string | null;
  inbound_flight_no: number | null;
  outbound_flight_no: number | null;
  sched_outbound_dep_utc: string | null;
  risk_band: string | null;
  p_late15: number | null;
}

/** GET /api/planner/reallocation?date=&airport=&tail= */
export interface ReallocationResponse {
  date: string;
  airport: string | null;
  tail: string | null;
  budget: number;
  rows: ReallocationRow[];
  summary: {
    aircraft: number;
    receiving: number;
    giving: number;
    minutes_moved: number;
    net_added_min: number;
    expected_prevented_min: number;
    realised_prevented_min: number;
    realised_prevented_resp_min: number;
  };
}

// ---- Aircraft Day (/api/aircraft-day...) ---------------------------------------------------------------------------

/** GET /api/aircraft-day/aircraft: one aircraft flying on the day. */
export interface AircraftSummary {
  tail_number: string;
  turnarounds: number;
  flights: number;
  /** Risk band of each turnaround, in time order (for the dots in the list). */
  risk_bands: string[];
  highest_risk: string | null;
  buffer_min: number;
  buffered_turnarounds: number;
  first_airport: string | null;
  last_airport: string | null;
  any_late_departure: boolean;
}

export interface AircraftListResponse {
  aircraft: AircraftSummary[];
  total: number;
}

/** One flight in the aircraft's day. Times and delays the data does not hold are null (never guessed). */
export interface AircraftFlight {
  flight_no: number | null;
  from: string | null;
  to: string | null;
  sched_dep_utc: string | null;
  sched_arr_utc: string | null;
  dep_delay_min: number | null;
  arr_delay_min: number | null;
  /** Turnaround this flight leaves from / lands at (index into `turnarounds`), when it is part of one. */
  departs_turn: number | null;
  arrives_turn: number | null;
}

/** One stop: prediction (gold_ml_predictions) and recommendation (gold_buffer_recommendation) fields. */
export interface AircraftTurn {
  turn_id: string;
  airport: string;
  inbound_from: string | null;
  outbound_to: string | null;
  inbound_flight_no: number | null;
  outbound_flight_no: number | null;
  sched_inbound_arr_utc: string | null;
  sched_outbound_dep_utc: string | null;
  sched_ground_min: number | null;
  very_short_turn_flag: boolean;
  leg_of_day: number | null;
  is_disruption_day: boolean;
  p_late15: number | null;
  pred_inbound_delay_min: number | null;
  risk_band: string | null;
  actual_inbound_delay_min: number | null;
  actual_outbound_delay_min: number | null;
  actual_late15: boolean | null;
  recommended_extra_min: number;
  new_ground_min: number | null;
  expected_absorbed_min: number | null;
  realised_absorbed_min: number | null;
  late_avoided_flag: boolean;
  reason_code: string | null;
  day_rank: number | null;
  chain_multiplier: number | null;
  protects_later_flights: boolean;
  /** Reallocation plan (main budget): + minutes received, - minutes given, null when this stop is not involved. */
  realloc_change_min: number | null;
  realloc_expected_change_min: number | null;
  realloc_realised_min: number | null;
}

/** The order to draw the chain in: flights and turnarounds alternate; a break marks a stop that does not connect. */
export type ChainItem =
  | { type: 'flight'; index: number }
  | { type: 'turnaround'; index: number }
  | { type: 'break'; arrived_at: string | null; next_airport: string };

/** GET /api/aircraft-day */
export interface AircraftDay {
  tail_number: string;
  date: string;
  budget: number;
  is_disruption_day: boolean;
  flights: AircraftFlight[];
  turnarounds: AircraftTurn[];
  chain: ChainItem[];
  breaks: number;
  totals: {
    turnarounds: number;
    buffered_turnarounds: number;
    buffer_min: number;
    expected_absorbed_min: number;
    realised_absorbed_min: number;
    late_departures_avoided: number;
  };
  plan_sentence: string;
  /** The reallocation plan for this aircraft (always the main budget). */
  reallocation: {
    budget: number;
    minutes_moved: number;
    receiving: number;
    giving: number;
    expected_change_min: number;
    sentence: string;
  };
}

// ---- Scenario Simulator (/api/simulator/...) -----------------------------------------------------------------------

/** One row of gold_sim_strategy: a strategy at one budget and day type. */
export interface SimStrategyRow {
  strategy: string;
  budget_scenario: number;
  day_type: string;
  turnarounds: number;
  added_min: number;
  absorbed_min: number;
  /** A percentage, e.g. 5.35 */
  pct_removed: number | null;
  absorbed_per_100_added: number | null;
  late_avoided_per_1000: number | null;
  /** Engine divided by this strategy (null for the engine itself). */
  engine_vs_this: number | null;
  engine_vs_this_ci95_low: number | null;
  engine_vs_this_ci95_high: number | null;
  share_of_hindsight: number | null;
  mode: EngineMode | null;
}

/** GET /api/simulator/strategies */
export interface SimStrategiesResponse {
  budget: number;
  day_type: string;
  rows: SimStrategyRow[];
  period: { days: number; disruption_days: number; first_day: string | null; last_day: string | null };
}

/** GET /api/simulator/sweep */
export interface SimSweepResponse {
  day_type: string;
  rows: SimStrategyRow[];
}

export interface SimDailyRow {
  flight_date: string;
  strategy: string;
  buffer_added_min: number | null;
  absorbed_min: number | null;
  late_departures_avoided: number | null;
  is_disruption_day: boolean;
}

export interface SimMonthlyRow {
  year_month: string;
  strategy: string;
  buffer_added_min: number;
  absorbed_min: number;
  late_departures_avoided: number;
  disruption_days: number;
}

/** GET /api/simulator/daily */
export interface SimDailyResponse {
  budget: number;
  strategies: string[];
  daily: SimDailyRow[];
  monthly: SimMonthlyRow[];
}

export interface SimAllocationRow {
  group: string;
  turnarounds: number;
  engine_buffer_min: number;
  even_buffer_min: number;
  share_of_engine_buffer: number;
  share_of_turnarounds: number;
}

/** GET /api/simulator/allocation */
export interface SimAllocationResponse {
  budget: number;
  grouping: string;
  rows: SimAllocationRow[];
  /** One sentence describing the pattern, built from the rows. */
  caption: string;
}

// ---- Risk Forecast (/api/risk/...) ---------------------------------------------------------------------------------

/** GET /api/risk/summary */
export interface RiskSummary {
  start: string;
  end: string;
  airport: string | null;
  turnarounds: number;
  /** Mean predicted chance of leaving 15+ min late. */
  avg_late_chance: number | null;
  /** Share of turnarounds the model flags as more likely late than not (late chance 50% or more). */
  predicted_late_share: number | null;
  actual_late_share: number | null;
  high: number;
  medium: number;
  low: number;
  avg_pred_inbound_delay_min: number | null;
}

export interface RiskHeatCell {
  airport: string;
  hour: number;
  turnarounds: number;
  /** Null when the cell has fewer turnarounds than the minimum (hidden). */
  value: number | null;
}

/** GET /api/risk/heatmap */
export interface RiskHeatmap {
  metric: 'p_late15' | 'pred_inbound_delay_min';
  min_turnarounds: number;
  /** Top airports by turnarounds in the range, busiest first. */
  airports: { airport: string; turnarounds: number }[];
  hours: number[];
  cells: RiskHeatCell[];
}

export interface RiskTrendRow {
  year_month: string;
  turnarounds: number;
  avg_late_chance: number | null;
  actual_late_share: number | null;
}

export interface RiskGroundBand {
  band: string;
  turnarounds: number;
  avg_late_chance: number | null;
  avg_pred_inbound_delay_min: number | null;
  actual_late_share: number | null;
}

export interface ModelDecile {
  model: string;
  period: string;
  decile: number;
  turnarounds: number;
  predicted: number | null;
  observed: number | null;
  unit: string | null;
}

export interface ModelMetric {
  model: string;
  predictor: string;
  period: string;
  measure: string;
  value: number | null;
}

export interface FeatureImportance {
  model: string;
  feature: string;
  feature_label: string;
  importance_pct: number;
  rank: number;
}

/** GET /api/risk/model-quality */
export interface ModelQuality {
  deciles: ModelDecile[];
  metrics: ModelMetric[];
  features: FeatureImportance[];
  /** "The riskiest tenth was late 64% of the time; the safest 11%." (late-warning model, test months) */
  decile_caption: string;
}

/** GET /api/risk/top-turnarounds */
export interface RiskTurnaround {
  turn_id: string;
  flight_date: string;
  airport: string;
  inbound_from: string | null;
  outbound_to: string | null;
  inbound_flight_no: number | null;
  outbound_flight_no: number | null;
  tail_number: string | null;
  sched_outbound_dep_utc: string | null;
  sched_ground_min: number | null;
  risk_band: string | null;
  p_late15: number | null;
  /** Late chance from prediction engine v1, for comparison. */
  p_late15_v1: number | null;
  pred_inbound_delay_min: number | null;
  actual_inbound_delay_min: number | null;
  actual_outbound_delay_min: number | null;
  actual_late15: boolean | null;
}

// ---- Airport Insights (/api/airports/...) --------------------------------------------------------------------------

/** One airport with whole-period figures (gold_dim_airport plus weighted averages over gold_airport_month). */
export interface AirportStats {
  airport: string;
  city: string | null;
  state: string | null;
  departures: number;
  arrivals: number | null;
  turnarounds: number | null;
  median_ground_min: number | null;
  is_top10: boolean;
  departure_rank: number | null;
  dep_late15_rate: number | null;
  arr_late15_rate: number | null;
  avg_arr_delay_min: number | null;
  avg_dep_delay_min: number | null;
  cancel_rate: number | null;
  short_turn_share: number | null;
  avg_inbound_delay_min: number | null;
  /** Minutes of outbound delay per minute of inbound delay; null when no month had enough late inbound flights. */
  pass_through: number | null;
  propagated_delay_min: number | null;
}

/** GET /api/airports/list */
export interface AirportListResponse {
  airports: AirportStats[];
  total: number;
}

/** GET /api/airports/{code}/profile */
export interface AirportProfile {
  airport: AirportStats;
  ranks: { departures: number | null; late_rate: number | null; airports: number; late_rate_airports: number };
  /** Network-wide figures for comparison (median ground time is the network median over all turnarounds). */
  network: Omit<AirportStats, 'airport' | 'city' | 'state' | 'is_top10' | 'departure_rank'> & { airports: number; avg_departures_per_airport: number };
}

export interface AirportMonth {
  year_month: string;
  scheduled_departures: number | null;
  cancel_rate: number | null;
  dep_late15_rate: number | null;
  avg_dep_delay_min: number | null;
  arrivals: number | null;
  arr_late15_rate: number | null;
  avg_arr_delay_min: number | null;
  turnarounds: number | null;
  median_ground_min: number | null;
  short_turn_share: number | null;
  avg_inbound_delay_min: number | null;
  avg_outbound_delay_min: number | null;
  propagated_delay_min: number | null;
  pass_through: number | null;
}

export interface AirportHour {
  dep_hour: number;
  departures: number;
  dep_late15_rate: number | null;
  avg_dep_delay_min: number | null;
  network_dep_late15_rate: number | null;
}

/** GET /api/airports/{code}/hourly */
export interface AirportHourly {
  hours: AirportHour[];
  /** "Late rate peaks at 20:00 (41%)." */
  caption: string;
}

export interface AirportBufferMonth {
  year_month: string;
  turnarounds: number;
  turnarounds_with_buffer: number;
  buffer_min: number;
  expected_absorbed_min: number | null;
  realised_absorbed_min: number | null;
  late_departures_avoided: number;
  share_with_buffer: number | null;
}

/** GET /api/airports/{code}/buffer */
export interface AirportBuffer {
  budget: number;
  months: AirportBufferMonth[];
  totals: Omit<AirportBufferMonth, 'year_month'>;
}

export interface ScatterAirport {
  airport: string;
  city: string | null;
  median_ground_min: number;
  avg_inbound_delay_min: number;
  turnarounds: number;
  is_top10: boolean;
}

/** GET /api/airports/network-scatter */
export interface NetworkScatter {
  min_turnarounds: number;
  airports: ScatterAirport[];
  /** Pearson correlation of median ground time and average inbound delay across the airports shown. */
  correlation: number | null;
  caption: string;
}

// ---- Delay Propagation (/api/propagation/...) ----------------------------------------------------------------------

/** One ground-time band of the fitted pass-through curve (gold_passthrough_curve, training period). */
export interface CurveBand {
  sg_band: string;
  sg_mean_min: number | null;
  turnarounds: number;
  pass_through: number | null;
  ci95_low: number | null;
  ci95_high: number | null;
  pass_through_smoothed: number | null;
}

/** GET /api/propagation/segment-curves: engine v2's smoothed curves, one per segment (training period). */
export interface SegmentCurves {
  segments: { segment: string; points: { ground_min: number; pass_through: number }[] }[];
  curve_version: string | null;
}

/** GET /api/propagation/curve */
export interface PropagationCurve {
  bands: CurveBand[];
  /** The smoothed curve every 10 minutes from 0 to 300 (gold_engine_run_log.curve_points). */
  points: { ground_min: number; pass_through: number }[];
  curve_version: string | null;
  threshold_min: number | null;
}

export const SEGMENT_TYPES = ['All turnarounds', 'Airport type', 'Time of day', 'Disruption', 'Period'] as const;
export type SegmentType = (typeof SEGMENT_TYPES)[number];

/** One segment × band row of gold_passthrough_curve (all periods; Short / Medium / Long bands). */
export interface SegmentBand {
  segment_type: SegmentType;
  segment: string;
  sg_band: string;
  sg_mean_min: number | null;
  turnarounds: number;
  pass_through: number | null;
  ci95_low: number | null;
  ci95_high: number | null;
}

/** GET /api/propagation/segments?segment_type= */
export interface PropagationSegments {
  segment_type: SegmentType | 'all';
  rows: SegmentBand[];
  /** Segments and bands in display order. */
  segments: string[];
  bands: string[];
  caption: string | null;
}

export const LEG_PERIODS = ['all', 'train', 'validate', 'test'] as const;
export type LegPeriod = (typeof LEG_PERIODS)[number];

/** One row of gold_delay_by_leg: departures by flight number of the aircraft's day. */
export interface DelayByLeg {
  leg: number;
  leg_label: string;
  flights: number;
  avg_dep_delay_min: number | null;
  median_dep_delay_min: number | null;
  dep_late15_rate: number | null;
}

/** GET /api/propagation/by-leg?period=all */
export interface PropagationByLeg {
  period: LegPeriod;
  legs: DelayByLeg[];
  caption: string;
}

export const PROPAGATION_KPIS = [
  'absorption_threshold', 'pass_through_short', 'pass_through_medium', 'pass_through_long', 'delay_buildup', 'median_ground_time',
  'short_turn_share',
] as const;
export type PropagationKpiName = (typeof PROPAGATION_KPIS)[number];

/** GET /api/propagation/kpis */
export interface PropagationKpis {
  kpis: Record<PropagationKpiName, Kpi | null>;
}

/** GET /api/propagation/calculate?ground_min=&inbound_delay_min=&extra_min= */
export type { AbsorptionResult } from './propagation.ts';
// ---- Input Data (/api/datasets/...) ------------------------------------------------------------------------------

export type DatasetGroupId = 'input' | 'gold';

/** How a column is shown and profiled, from its SQL type. */
export type ColumnKind = 'number' | 'date' | 'timestamp' | 'boolean' | 'text' | 'other';

export interface DatasetItem {
  name: string;
  display_name: string;
  group: DatasetGroupId;
  description: string;
  rows: number | null;
  columns: number | null;
  /** Gold tables only (from gold_table_catalog). */
  grain: string | null;
  dashboard_page: string | null;
}

/** GET /api/datasets */
export interface DatasetsResponse {
  groups: { id: DatasetGroupId; title: string; items: DatasetItem[] }[];
}

export interface DatasetColumn {
  name: string;
  type: string;
  kind: ColumnKind;
}

/** GET /api/datasets/{name}/schema */
export interface DatasetSchema {
  name: string;
  columns: DatasetColumn[];
}

/** GET /api/datasets/{name}/preview?limit=&offset=&sort=&order=&search= */
export interface DatasetPreview {
  columns: DatasetColumn[];
  /** One array per row, in the order of `columns`. */
  rows: unknown[][];
  /** Rows matching the search (all rows without one). */
  total: number;
  limit: number;
  offset: number;
  sort: string | null;
  order: 'asc' | 'desc';
  search: string | null;
}

export interface ColumnProfile extends DatasetColumn {
  nulls: number;
  null_share: number | null;
  /** Numbers and dates. */
  min?: number | string | null;
  max?: number | string | null;
  /** Text and everything else. */
  distinct?: number;
  top?: { value: string; count: number }[];
}

/** GET /api/datasets/{name}/profile */
export interface DatasetProfile {
  name: string;
  rows: number;
  /** Rows the figures are based on: all of them, or a random sample of about 100,000 for big tables. */
  profiled_rows: number;
  sampled: boolean;
  note: string | null;
  columns: ColumnProfile[];
}

// ---- Engine v2 KPIs (/api/kpis/...) ------------------------------------------------------------------------------

/** One row of gold_kpi_catalog: a KPI with its target and the v1 and v2 values. */
export interface KpiCatalogRow {
  engine: string;
  level: string;
  kpi_name: string;
  kpi_label: string;
  target: string | null;
  value_v1: number | null;
  value_v2: number | null;
  target_met: boolean | null;
}

/** GET /api/kpis/catalog */
export interface KpiCatalogResponse {
  rows: KpiCatalogRow[];
  /** The same rows grouped by engine, then level, in display order. */
  groups: { engine: string; levels: { level: string; rows: KpiCatalogRow[] }[] }[];
}

/** One row of gold_engine_kpis: a strategy at one budget, day type and view. */
export interface EngineKpiRow {
  strategy: string;
  mode: EngineMode;
  budget_scenario: number;
  evaluator: Evaluator;
  day_type: string;
  turnarounds: number;
  added_min: number;
  net_added_min: number;
  prevented_min: number;
  own_absorbed_min: number | null;
  prevented_per_100: number | null;
  /** A percentage, e.g. 2.69 */
  pct_departure_delay_prevented: number | null;
  late_departures_avoided: number | null;
  late_avoided_per_1000: number | null;
  otp_change_pp: number | null;
  value_usd: number | null;
  buffer_cost_usd: number | null;
  net_value_usd: number | null;
  eligible_share: number | null;
  max_airport_share: number | null;
  budget_respected: boolean | null;
  /** Main budget, all days only. */
  robustness_worst_case_share: number | null;
}

/** GET /api/kpis/engine */
export interface EngineKpisResponse {
  budget: number | 'all';
  day_type: string;
  evaluator: EvaluatorChoice;
  mode: EngineMode | 'all';
  rows: EngineKpiRow[];
  /** Strategies in the rows, in display order. */
  strategies: string[];
}

/** One row of gold_cost_assumptions (value is text, e.g. "98.41" or "20-150"). */
export interface CostAssumption {
  setting: string;
  value: string | null;
  unit: string | null;
  description: string | null;
  source: string | null;
}

/** GET /api/kpis/costs */
export interface CostsResponse {
  rows: CostAssumption[];
  cost_delay_min_usd: number | null;
  cost_buffer_min_usd: number | null;
  airport_cap_share: number | null;
  /** Planned ground time that can receive buffer, e.g. [20, 150]. */
  eligible_ground_min: [number, number] | null;
  limits: { min: number; max: number };
}

export interface NetValueRow {
  strategy: string;
  mode: EngineMode;
  evaluator: Evaluator;
  prevented_min: number;
  added_min: number;
  net_added_min: number;
  value_usd: number;
  buffer_cost_usd: number;
  /** Negative when the buffer costs more than the delay it prevents (a real result). */
  net_value_usd: number;
  /** Adding buffer pays only below this cost per buffer minute; null when nothing is added. */
  break_even_buffer_cost_usd: number | null;
}

/** GET /api/kpis/net-value?budget=5&cost_delay=98.41&cost_buffer=50.72 */
export interface NetValueResponse {
  budget: number;
  day_type: string;
  cost_delay_min_usd: number;
  cost_buffer_min_usd: number;
  rows: NetValueRow[];
}
