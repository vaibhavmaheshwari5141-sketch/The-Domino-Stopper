// Stand-in gold tables for tests: tiny parquet files with notebook 08's table and column names.
// The values are made up for testing only; they are not results.
import { join } from 'node:path';
import { DuckDBInstance } from '@duckdb/node-api';

const RUN = "'run-1'";

const TABLES: Record<string, string> = {
  gold_dim_airport: `SELECT * FROM (VALUES
      ('DFW', 900, 0.5, 'Dallas/Fort Worth, TX', 'TX', 1000, 1000, 800, 67.0, true, 1),
      ('CLT', 700, 'nan'::DOUBLE, 'Charlotte, NC', 'NC', 700, 700, 600, 66.0, true, 2),
      ('ORD', 500, 0.2, 'Chicago, IL', 'IL', 500, 500, 300, 75.0, true, 3),
      ('TPA', 10, 0.1, 'Tampa, FL', 'FL', 50, 50, 20, 90.0, false, 4)
    ) v(airport, turns, share, city, state, departures, arrivals, turnarounds, median_ground_min, is_top10, departure_rank)`,

  // Airport months. DFW: two months (pass-through only in the first); CLT, ORD, TPA: one each
  gold_airport_month: `SELECT * FROM (VALUES
      ('DFW', '2025-01', 400, 0.02, 0.30, 12.0, 400, 0.20, 10.0, 300.0, 68.0, 0.20, 5.0, 6.0, 1000.0, 0.4, true),
      ('DFW', '2026-01', 600, 0.01, 0.20, 8.0, 600, 0.30, 20.0, 500.0, 66.0, 0.10, 9.0, 10.0, 3000.0, NULL, true),
      ('CLT', '2026-01', 700, 0.00, 0.35, 10.0, 700, 0.25, 12.0, 600.0, 66.0, 0.30, 12.0, 13.0, 2000.0, 0.9, true),
      ('ORD', '2026-01', 500, 0.03, 0.10, 5.0, 500, 0.15, 6.0, 300.0, 75.0, 0.05, 3.0, 4.0, 500.0, NULL, true),
      ('TPA', '2026-01', 50, 0.00, 0.50, 20.0, 50, 0.40, 25.0, 20.0, 90.0, 0.50, 20.0, 22.0, 50.0, NULL, false)
    ) v(airport, year_month, scheduled_departures, cancel_rate, dep_late15_rate, avg_dep_delay_min, arrivals, arr_late15_rate,
        avg_arr_delay_min, turnarounds, median_ground_min, short_turn_share, avg_inbound_delay_min, avg_outbound_delay_min,
        propagated_delay_min, pass_through, is_top10_airport)`,

  // DFW 22:00 has a high late rate but under 100 departures, so it is not the "peak"
  gold_airport_hour: `SELECT airport, dep_hour::SMALLINT AS dep_hour, departures::BIGINT AS departures, dep_late15_rate, avg_dep_delay_min FROM (VALUES
      ('DFW', 7, 200, 0.10, 4.0), ('DFW', 18, 300, 0.40, 20.0), ('DFW', 22, 50, 0.90, 60.0), ('CLT', 18, 100, 0.20, 9.0)
    ) v(airport, dep_hour, departures, dep_late15_rate, avg_dep_delay_min)`,

  gold_buffer_plan_airport: `SELECT airport, year_month, b::BIGINT AS budget_scenario, n::BIGINT AS turnarounds, wb::BIGINT AS turnarounds_with_buffer,
      buf::BIGINT AS buffer_min, exp AS expected_absorbed_min, real AS realised_absorbed_min, avoided::BIGINT AS late_departures_avoided,
      wb * 1.0 / n AS share_with_buffer
    FROM (VALUES ('DFW', '2026-01', 5, 500, 100, 2500, 300.0, 350.0, 4), ('DFW', '2026-02', 5, 400, 50, 1250, 100.0, 80.0, 1),
                 ('DFW', '2026-01', 2, 500, 40, 1000, 150.0, 120.0, 2)) v(airport, year_month, b, n, wb, buf, exp, real, avoided)`,

  gold_engine_run_log: `SELECT ${RUN} AS run_id, TIMESTAMP '2026-10-25 10:01:00' AS run_timestamp_utc, 'data-v1.0' AS data_tag,
    '2025-01-01 to 2025-09-30' AS train_period, '2025-10-01 to 2025-12-31' AS validate_period, '2026-01-01 to 2026-08-31' AS test_period,
    'lgbm-1.0' AS model_version, 'engine-1.0' AS engine_version, 'curve-train2025-1.0' AS curve_version,
    5::BIGINT AS main_budget, 40::BIGINT AS checks_passed, 40::BIGINT AS checks_total,
    '{"0": 0.99, "60": 0.99, "100": 0.8, "200": 0.4, "300": 0.2}' AS curve_points,
    '{"Ten busiest | Morning": {"0": 0.97, "60": 0.97, "120": 0.6, "300": 0.3}, "Other airports | Evening": {"0": 1.0, "100": 0.9, "300": 0.3}}' AS segment_curve_points`,

  // Pass-through curve: four fitted bands (the small "up to 30" band is smoothed like the next), and segment rows.
  // Time of day: afternoon short turns pass on only 0.85, so the caption leaves out "nearly all of it".
  gold_passthrough_curve: `SELECT ct AS curve_type, st AS segment_type, seg AS segment, band AS sg_band, m AS sg_mean_min, n::BIGINT AS turnarounds,
      pt AS pass_through, pt - 0.05 AS ci95_low, pt + 0.05 AS ci95_high, sm AS pass_through_smoothed, 'curve-train2025-1.0' AS curve_version
    FROM (VALUES
      ('fitted_curve (training period)', 'All turnarounds', 'All', '61-65', 63.0, 800, 1.01, 0.99),
      ('fitted_curve (training period)', 'All turnarounds', 'All', 'up to 30', 20.0, 100, 0.55, 0.99),
      ('fitted_curve (training period)', 'All turnarounds', 'All', '111-120', 115.0, 300, 0.72, 0.72),
      ('fitted_curve (training period)', 'All turnarounds', 'All', '56-60', 58.0, 1000, 1.0, 0.99),
      ('segment (all periods)', 'All turnarounds', 'All', 'Short (up to 55)', 45.0, 5000, 0.98, NULL),
      ('segment (all periods)', 'All turnarounds', 'All', 'Medium (56-80)', 66.0, 4000, 0.97, NULL),
      ('segment (all periods)', 'All turnarounds', 'All', 'Long (over 80)', 150.0, 3000, 0.28, NULL),
      ('segment (all periods)', 'Airport type', 'Other airports', 'Long (over 80)', 150.0, 1000, 0.56, NULL),
      ('segment (all periods)', 'Airport type', 'Other airports', 'Short (up to 55)', 45.0, 3000, 1.01, NULL),
      ('segment (all periods)', 'Airport type', 'Other airports', 'Medium (56-80)', 66.0, 1500, 0.98, NULL),
      ('segment (all periods)', 'Airport type', 'Ten busiest', 'Short (up to 55)', 44.0, 2000, 0.9, NULL),
      ('segment (all periods)', 'Airport type', 'Ten busiest', 'Medium (56-80)', 67.0, 2500, 0.97, NULL),
      ('segment (all periods)', 'Airport type', 'Ten busiest', 'Long (over 80)', 140.0, 2000, 0.25, NULL),
      ('segment (all periods)', 'Time of day', 'Morning (05-11)', 'Short (up to 55)', 45.0, 900, 0.95, NULL),
      ('segment (all periods)', 'Time of day', 'Morning (05-11)', 'Long (over 80)', 150.0, 400, 0.46, NULL),
      ('segment (all periods)', 'Time of day', 'Afternoon (12-16)', 'Short (up to 55)', 45.0, 900, 0.85, NULL),
      ('segment (all periods)', 'Time of day', 'Afternoon (12-16)', 'Long (over 80)', 150.0, 400, 0.26, NULL),
      -- Engine v2 segment curves: sg_band holds the ground time as text, stored out of order
      ('v2 segment curve (training period)', 'Engine v2 segment', 'Ten busiest | Morning', '120', 120.0, NULL, NULL, 0.6),
      ('v2 segment curve (training period)', 'Engine v2 segment', 'Ten busiest | Morning', '0', 0.0, NULL, NULL, 0.97),
      ('v2 segment curve (training period)', 'Engine v2 segment', 'Ten busiest | Morning', '60', 60.0, NULL, NULL, 0.97),
      ('v2 segment curve (training period)', 'Engine v2 segment', 'Ten busiest | Morning', '300', 300.0, NULL, NULL, 0.3),
      ('v2 segment curve (training period)', 'Engine v2 segment', 'All turnarounds', '0', 0.0, NULL, NULL, 1.0),
      ('v2 segment curve (training period)', 'Engine v2 segment', 'All turnarounds', '300', 300.0, NULL, NULL, 0.25)
    ) v(ct, st, seg, band, m, n, pt, sm)`,

  gold_delay_by_leg: `SELECT period, leg::BIGINT AS leg, label AS leg_label, n::BIGINT AS flights, avg AS avg_dep_delay_min,
      med::DOUBLE AS median_dep_delay_min, late AS dep_late15_rate
    FROM (VALUES ('all', 2, '2', 900, 17.4, -1, 0.25), ('all', 1, '1', 1000, 11.9, -4, 0.15), ('all', 3, '3', 700, 22.5, 0, 0.30),
                 ('all', 6, '6+', 100, 40.0, 8, 0.43), ('test', 1, '1', 400, 13.2, -4, 0.16), ('test', 2, '2', 350, 18.8, -1, 0.26)
    ) v(period, leg, label, n, avg, med, late)`,

  // Buffer Planner: 2026-03-15, six turnarounds at DFW and CLT, budgets 2 and 5. Aircraft Day: chains on 2026-03-16.
  // Columns: date, turn_id, airport, tail, from, to, in flight, out flight, outbound departure (UTC), ground, very short,
  //          late chance, predicted inbound delay, risk band, actual inbound delay
  gold_ml_predictions: `SELECT turn_id, d AS flight_date, strftime(d, '%Y-%m') AS year_month, tail_number, airport, inbound_from,
      outbound_to, inbound_flight_no, outbound_flight_no, dep - INTERVAL (ground) MINUTE AS sched_inbound_arr_utc, dep AS sched_outbound_dep_utc,
      hour(dep)::BIGINT AS sched_dep_hour_local, ground AS sched_ground_min, very_short AS very_short_turn_flag, 2::BIGINT AS leg_of_day,
      true AS is_top10_airport, true AS is_disruption_day, p AS p_late15, pred_in + 1 AS pred_outbound_delay_min,
      pred_in AS pred_inbound_delay_min, 5::BIGINT AS risk_decile, 5::BIGINT AS inbound_risk_decile, band AS risk_band,
      actual_in AS actual_inbound_delay_min, actual_in - 3.0 AS actual_outbound_delay_min, actual_in >= 15 AS actual_late15,
      'lgbm-2.0' AS model_version, ${RUN} AS run_id, p - 0.02 AS p_late15_v1, 40::BIGINT AS airport_departures_that_hour
    FROM (VALUES
      (DATE '2026-03-15', '20260315-1446-TUL-DFW', 'DFW', 'N100AA', 'TUL', 'TUS', 1446, 1207, TIMESTAMP '2026-03-16 00:22:00', 121.0, false, 0.40, 15.6, 'High', 40.0),
      (DATE '2026-03-15', '20260315-2336-CLE-DFW', 'DFW', 'N200AA', 'CLE', 'PHX', 2336, 1152, TIMESTAMP '2026-03-15 18:00:00', 55.0, false, 0.35, 8.0, 'Medium', 5.0),
      (DATE '2026-03-15', '20260315-3330-MIA-DFW', 'DFW', 'N300AA', 'MIA', 'MIA', 3330, 3331, TIMESTAMP '2026-03-15 12:00:00', 15.0, true, 0.30, 6.0, 'Medium', 0.0),
      (DATE '2026-03-15', '20260315-0400-AUS-DFW', 'DFW', 'N400AA', 'AUS', 'ELP', 400, 401, TIMESTAMP '2026-03-15 14:00:00', 90.0, false, 0.05, 1.0, 'Low', -4.0),
      (DATE '2026-03-15', '20260315-2718-PIT-CLT', 'CLT', 'N500AA', 'PIT', 'TPA', 2718, 2516, TIMESTAMP '2026-03-15 16:00:00', 80.0, false, 0.25, 4.0, 'Medium', 2.0),
      (DATE '2026-03-15', '20260315-0600-BOS-CLT', 'CLT', 'N600AA', 'BOS', 'MIA', 600, 601, TIMESTAMP '2026-03-15 20:00:00', 100.0, false, 0.45, 12.0, 'High', 22.0),
      -- 2026-03-16: aircraft chains for the Aircraft Day tests. N700AA: PIT-CLT-TPA-CLT, then a break (its next stop is MIA).
      (DATE '2026-03-16', '20260316-0100-PIT-CLT', 'CLT', 'N700AA', 'PIT', 'TPA', 100, 200, TIMESTAMP '2026-03-16 13:00:00', 66.0, false, 0.10, 3.0, 'Low', -10.0),
      (DATE '2026-03-16', '20260316-0200-CLT-TPA', 'TPA', 'N700AA', 'CLT', 'CLT', 200, 201, TIMESTAMP '2026-03-16 16:00:00', 60.0, false, 0.45, 14.0, 'High', 30.0),
      (DATE '2026-03-16', '20260316-0300-ORD-MIA', 'MIA', 'N700AA', 'ORD', 'BOS', 300, 301, TIMESTAMP '2026-03-17 01:00:00', 100.0, false, 0.35, 9.0, 'Medium', 20.0),
      (DATE '2026-03-16', '20260316-0900-DFW-CLT', 'CLT', 'N800AA', 'DFW', 'DFW', 900, 901, TIMESTAMP '2026-03-16 18:00:00', 45.0, false, 0.20, 5.0, 'Medium', 2.0)
      UNION ALL
      SELECT DATE '2026-04-10', '20260410-' || lpad(i::VARCHAR, 4, '0') || '-JFK-ORD', 'ORD', 'N' || (100 + i)::VARCHAR || 'RK', 'JFK', 'LAX',
        1000 + i, 2000 + i, TIMESTAMP '2026-04-10 10:00:00' + to_hours(CASE WHEN i < 40 THEN 0 ELSE 8 END) + to_minutes(i), 30.0 + i * 3, false,
        0.10 + i * 0.01, i * 0.5, CASE WHEN i >= 24 THEN 'High' WHEN i >= 8 THEN 'Medium' ELSE 'Low' END, i * 1.0
      FROM range(60) r(i)
    ) v(d, turn_id, airport, tail_number, inbound_from, outbound_to, inbound_flight_no, outbound_flight_no, dep, ground, very_short, p, pred_in, band, actual_in)`,

  // Columns: turn_id, budget, airport, ground, extra minutes, expected absorbed, realised absorbed, late avoided, reason, rank
  gold_buffer_recommendation: `SELECT turn_id, strptime(left(turn_id, 8), '%Y%m%d')::DATE AS flight_date, '2026-03' AS year_month, airport, budget::BIGINT AS budget_scenario,
      ground AS current_ground_min, extra::BIGINT AS recommended_extra_min, ground + extra AS new_ground_min, exp AS expected_absorbed_min,
      CASE WHEN extra > 0 THEN exp / extra ELSE 0.01 END AS value_per_buffer_min, real AS realised_absorbed_min, avoided AS late_avoided_flag,
      reason AS reason_code, rnk::BIGINT AS day_rank, 'engine-2.0' AS engine_version, 'curve-train2025-1.0' AS curve_version, ${RUN} AS run_id,
      real * 2 AS realised_absorbed_resp_min, ground BETWEEN 20 AND 150 AS eligible_flag,
      CASE WHEN airport IN ('DFW', 'CLT') THEN 'Ten busiest | Morning' ELSE 'Other airports | Morning' END AS segment,
      CASE WHEN extra > 0 THEN 2.5 ELSE 1.2 END AS chain_multiplier, extra >= 10 AS protects_later_flights
    FROM (VALUES
      ('20260315-1446-TUL-DFW', 5, 'DFW', 121.0, 15, 6.0, 12.0, true, 'Added: likely late arrival that extra minutes can absorb', 1),
      ('20260315-2336-CLE-DFW', 5, 'DFW', 55.0, 10, 2.0, 1.0, false, 'Added: planned stop is shorter than a turn usually needs', 2),
      ('20260315-3330-MIA-DFW', 5, 'DFW', 15.0, 0, 0.0, 0.0, false, 'None: very short turn (under 20 min), usually an aircraft swap', NULL),
      ('20260315-0400-AUS-DFW', 5, 'DFW', 90.0, 0, 0.0, 0.0, false, 'None: extra minutes would prevent almost nothing', NULL),
      ('20260315-2718-PIT-CLT', 5, 'CLT', 80.0, 0, 0.0, 0.0, false, 'None: other turnarounds prevent more per minute', NULL),
      ('20260315-0600-BOS-CLT', 5, 'CLT', 100.0, 5, 1.5, 3.0, true, 'Added: likely late arrival that extra minutes can absorb', 3),
      ('20260315-1446-TUL-DFW', 2, 'DFW', 121.0, 10, 4.0, 8.0, true, 'Added: likely late arrival that extra minutes can absorb', 1),
      ('20260315-2336-CLE-DFW', 2, 'DFW', 55.0, 0, 0.0, 0.0, false, 'None: other turnarounds prevent more per minute', NULL),
      ('20260315-3330-MIA-DFW', 2, 'DFW', 15.0, 0, 0.0, 0.0, false, 'None: very short turn (under 20 min), usually an aircraft swap', NULL),
      ('20260315-0400-AUS-DFW', 2, 'DFW', 90.0, 0, 0.0, 0.0, false, 'None: extra minutes would prevent almost nothing', NULL),
      ('20260315-2718-PIT-CLT', 2, 'CLT', 80.0, 0, 0.0, 0.0, false, 'None: other turnarounds prevent more per minute', NULL),
      ('20260315-0600-BOS-CLT', 2, 'CLT', 100.0, 0, 0.0, 0.0, false, 'None: other turnarounds prevent more per minute', NULL),
      ('20260316-0100-PIT-CLT', 5, 'CLT', 66.0, 0, 0.0, 0.0, false, 'None: extra minutes would prevent almost nothing', NULL),
      ('20260316-0200-CLT-TPA', 5, 'TPA', 60.0, 10, 3.0, 5.0, true, 'Added: planned stop is shorter than a turn usually needs', 1),
      ('20260316-0300-ORD-MIA', 5, 'MIA', 100.0, 5, 1.5, 2.0, false, 'Added: likely late arrival that extra minutes can absorb', 2),
      ('20260316-0900-DFW-CLT', 5, 'CLT', 45.0, 0, 0.0, 0.0, false, 'None: other turnarounds prevent more per minute', NULL)
    ) v(turn_id, budget, airport, ground, extra, exp, real, avoided, reason, rnk)`,

  // Late-warning deciles: predicted 5% x decile, observed 6% x decile (so the riskiest tenth is late 60%, the safest 6%)
  gold_model_deciles: `SELECT m AS model, p AS period, d::BIGINT AS decile, 100::BIGINT AS turnarounds,
      CASE WHEN m = 'late_warning' THEN 0.05 * d ELSE 2.0 * d END AS predicted,
      CASE WHEN m = 'late_warning' THEN 0.06 * d ELSE 2.5 * d END AS observed,
      CASE WHEN m = 'late_warning' THEN 'share late 15+ min' ELSE 'inbound delay, minutes' END AS unit
    FROM (VALUES ('late_warning'), ('inbound_risk'), ('outbound_delay')) a(m), (VALUES ('test'), ('validate')) b(p), range(1, 11) r(d)`,

  gold_model_metrics: `SELECT * , 'lgbm-2.0' AS model_version FROM (VALUES
      ('late_warning', 'LightGBM model', 'test', 'AUC', 0.70), ('late_warning', 'Baseline: airport and hour late-rate', 'test', 'AUC', 0.62),
      ('late_warning', 'Baseline: training late-rate', 'test', 'AUC', 0.5), ('late_warning', 'LightGBM model', 'validate', 'AUC', 0.71),
      ('late_warning', 'LightGBM model', 'train', 'AUC', 0.80), ('late_warning', 'LightGBM v1', 'test', 'AUC', 0.69),
      ('late_warning', 'LightGBM model', 'test', 'Top20Capture', 0.36), ('late_warning', 'LightGBM v1', 'test', 'Top20Capture', 0.35),
      ('inbound_risk', 'LightGBM model', 'test', 'RMSE', 37.5), ('inbound_risk', 'Baseline: training average', 'test', 'RMSE', 40.8),
      ('inbound_risk', 'LightGBM model', 'test', 'RankCorrelation', 0.31), ('inbound_risk', 'Baseline: training average', 'test', 'RankCorrelation', 0.0),
      ('outbound_delay', 'LightGBM model', 'test', 'RMSE', 46.0)
    ) v(model, predictor, period, measure, value)`,

  gold_feature_importance: `SELECT * FROM (VALUES
      ('late_warning', 'sg', 'Planned ground time', 27.0, 1), ('late_warning', 'station', 'Airport', 19.5, 2),
      ('late_warning', 'prev_origin', 'Where the arriving flight came from', 13.8, 3), ('late_warning', 'Month', 'Month', 13.5, 4),
      ('late_warning', 'hr', 'Planned departure hour', 12.4, 5), ('late_warning', 'DayOfWeek', 'Weekday', 3.6, 6),
      ('late_warning', 'route_out_late', 'Usual late rate of the outbound route', 2.5, 7), ('inbound_risk', 'sg', 'Planned ground time', 32.5, 1),
      ('outbound_delay', 'station', 'Airport', 24.4, 1)
    ) v(model, feature, feature_label, importance_pct, rank)`,

  gold_buffer_plan_daily: `SELECT d AS flight_date, b::BIGINT AS budget_scenario, 6::BIGINT AS turnarounds, twb::BIGINT AS turnarounds_with_buffer,
      used::BIGINT AS buffer_used_min, exp AS expected_absorbed_min, real AS realised_absorbed_min, avoided::BIGINT AS late_departures_avoided,
      (6 * b)::BIGINT AS budget_min, disruption AS is_disruption_day
    FROM (VALUES (DATE '2026-03-15', 5, 3, 30, 9.5, 16.0, 2, true), (DATE '2026-03-15', 2, 1, 10, 4.0, 8.0, 1, true),
                 (DATE '2026-03-16', 5, 0, 0, 0.0, 0.0, 0, false)) v(d, b, twb, used, exp, real, avoided, disruption)`,

  gold_table_catalog: `SELECT * FROM (VALUES ('gold_kpi_headline', 'KPI', '1 Executive summary', 'Headline numbers', 24::BIGINT, 7::BIGINT, 'kpi_name, value', ${RUN}),
    ('gold_engine_kpis', 'strategy x budget x mode x evaluator x day type', '1 Summary; 6 Simulator; KPI views', 'Engine KPIs in both views', 132, 26, 'strategy, evaluator', ${RUN}),
    ('gold_dim_airport', 'airport', 'Filters; pages 3, 4, 6', 'Airports', NULL, 11, 'airport, city', ${RUN}),
    ('gold_buffer_recommendation', 'turnaround x budget', '6a Recommendations', 'Buffer per turnaround', 1701088, 17, 'turn_id', ${RUN}),
    ('gold_unknown', 'x', 'x', 'not a gold table the app knows', 1, 1, 'x', ${RUN}),
    ('gold_old', 'x', 'x', 'from an older run', 1, 1, 'x', 'run-0')) v(table_name, grain, dashboard_page, description, "rows", "columns", columns_list, run_id)`,

  // late_warning_auc_baseline is left out on purpose, to check that a missing KPI comes back as null
  gold_kpi_headline: `SELECT kpi_name, value, unit, 'Test: Jan - Aug 2026' AS period, 'definition of ' || kpi_name AS definition,
      CASE WHEN kpi_name LIKE 'engine%' THEN 5.0 END AS budget_scenario, ${RUN} AS run_id
    FROM (VALUES ('scheduled_flights', 1000000.0, 'flights'), ('late_arrival_rate', 0.25, 'share'), ('absorption_threshold', 60.4, 'minutes'),
      ('late_warning_auc', 0.7, '0.5 to 1'), ('engine_uplift_vs_even', 3.0, 'times'), ('engine_uplift_vs_even_ci_low', 2.9, 'times'),
      ('engine_uplift_vs_even_ci_high', 3.1, 'times'), ('engine_late_avoided_per_1000', 5.0, 'per 1,000 turnarounds'),
      ('engine_pct_removed', 0.05, 'share'), ('engine_share_of_hindsight', 0.5, 'share'), ('top_decile_late_rate', 0.6, 'share'),
      ('bottom_decile_late_rate', 0.1, 'share'), ('delay_buildup', 18.0, 'minutes'), ('disruption_days', 20.0, 'days'),
      ('turnarounds', 900000.0, 'turnarounds'), ('median_ground_time', 61.0, 'minutes'),
      ('pass_through_short', 0.98, 'min per min'), ('pass_through_medium', 0.97, 'min per min'), ('pass_through_long', 0.28, 'min per min'),
      ('late_warning_auc_v1', 0.69, '0.5 to 1'), ('top20_capture', 0.36, 'share'), ('engine_prevented_per_100', 12.0, 'per 100 buffer min'),
      ('engine_prevented_per_100_resp', 50.0, 'per 100 buffer min'), ('engine_v1_prevented_per_100', 13.0, 'per 100 buffer min'),
      ('engine_v1_prevented_per_100_resp', 23.0, 'per 100 buffer min'), ('engine_otp_change_pp', 0.6, 'percentage points'),
      ('engine_otp_change_pp_resp', 3.5, 'percentage points'), ('engine_robustness', 0.85, 'share'),
      ('engine_break_even_buffer_cost_usd', 11.1, 'USD per minute'), ('engine_break_even_buffer_cost_usd_resp', 51.4, 'USD per minute'),
      ('realloc_minutes_moved', 1000.0, 'minutes'), ('realloc_net_value_usd', 2000000.0, 'USD'), ('realloc_net_value_usd_resp', 12600000.0, 'USD'),
      ('guardrail_eligible_share', 1.0, 'share'), ('guardrail_max_airport_share', 0.2, 'share'), ('cost_delay_min_usd', 98.41, 'USD per minute'),
      ('cost_buffer_min_usd', 50.72, 'USD per minute'))
      v(kpi_name, value, unit)`,

  // Strategy factor f (absorbed per 100 buffer minutes at budget 5, all days); budget 10 is 0.8x, disruption days 1.5x
  gold_sim_strategy: `SELECT s.strategy, b.budget_scenario, d.day_type, CASE WHEN d.day_type = 'disruption days' THEN 100 ELSE 1000 END::BIGINT AS turnarounds,
      b.budget_scenario * 1000.0 AS added_min, per100 * b.budget_scenario * 10.0 AS absorbed_min, per100 / 2 AS pct_removed,
      per100 AS absorbed_per_100_added, s.f / 2 AS late_avoided_per_1000,
      CASE WHEN s.f > 0 AND s.strategy <> 'Engine (our method)' THEN 12.0 / s.f END AS engine_vs_this,
      CASE WHEN s.f > 0 AND s.strategy <> 'Engine (our method)' THEN 12.0 / s.f * 0.98 END AS engine_vs_this_ci95_low,
      CASE WHEN s.f > 0 AND s.strategy <> 'Engine (our method)' THEN 12.0 / s.f * 1.02 END AS engine_vs_this_ci95_high,
      s.f / 25.0 AS share_of_hindsight, s.mode
    FROM (VALUES ('No buffer', 0.0, 'add'), ('Spread evenly', 3.0, 'add'), ('Shortest first', 2.0, 'add'), ('Riskiest first', 10.0, 'add'),
                 ('Engine (our method)', 12.0, 'add'), ('Hindsight (not possible)', 25.0, 'add'),
                 ('Engine: reallocate (no added buffer)', 6.0, 'reallocate')) s(strategy, f, mode),
         (VALUES (5), (10)) b(budget_scenario),
         (VALUES ('all days'), ('normal days'), ('disruption days')) d(day_type),
         LATERAL (SELECT s.f * CASE WHEN b.budget_scenario = 10 THEN 0.8 ELSE 1 END * CASE WHEN d.day_type = 'disruption days' THEN 1.5 ELSE 1 END AS per100)`,

  gold_sim_daily: `SELECT d AS flight_date, s AS strategy, 5::BIGINT AS budget_scenario, added AS buffer_added_min, absorbed AS absorbed_min,
      avoided::BIGINT AS late_departures_avoided, disruption AS is_disruption_day
    FROM (VALUES
      (DATE '2026-01-01', 'Engine (our method)', 5000.0, 600.0, 3, false), (DATE '2026-01-01', 'Spread evenly', 5000.0, 150.0, 1, false),
      (DATE '2026-01-02', 'Engine (our method)', 5000.0, 900.0, 5, true), (DATE '2026-01-02', 'Spread evenly', 5000.0, 250.0, 2, true),
      (DATE '2026-02-01', 'Engine (our method)', 5000.0, 500.0, 2, false), (DATE '2026-02-01', 'Spread evenly', 5000.0, 120.0, 0, false),
      (DATE '2026-02-01', 'Riskiest first', 5000.0, 400.0, 2, false), (DATE '2026-02-01', 'No buffer', 0.0, 0.0, 0, false)
    ) v(d, s, added, absorbed, avoided, disruption)`,

  // Ground-time bands stored out of their natural order; 17 airports to check the top-15 cut
  gold_buffer_allocation: `SELECT 5::BIGINT AS budget_scenario, g AS grouping, grp AS "group", n::BIGINT AS turnarounds, eng AS engine_buffer_min,
      n * 5.0 AS even_buffer_min, eng / SUM(eng) OVER (PARTITION BY g) AS share_of_engine_buffer, n / SUM(n) OVER (PARTITION BY g) AS share_of_turnarounds
    FROM (VALUES
      ('Inbound-risk fifth', '1 lowest risk', 200, 10.0), ('Inbound-risk fifth', '2', 200, 40.0), ('Inbound-risk fifth', '3', 200, 150.0),
      ('Inbound-risk fifth', '4', 200, 300.0), ('Inbound-risk fifth', '5 highest risk', 200, 500.0),
      ('Ground-time band', 'Very long (over 120)', 100, 200.0), ('Ground-time band', 'Short (up to 55)', 400, 200.0),
      ('Ground-time band', 'Long (81-120)', 100, 300.0), ('Ground-time band', 'Medium (56-80)', 400, 300.0),
      ('Airport type', 'Other airports', 400, 300.0), ('Airport type', 'Ten busiest', 600, 700.0)
    ) v(g, grp, n, eng)
    UNION ALL
    SELECT 5, 'Airport', 'A' || chr((65 + i)::INTEGER) || 'X', 10 * (17 - i), 100.0 * (17 - i), 50.0 * (17 - i),
      (17 - i) / 153.0, (17 - i) / 153.0
    FROM range(17) r(i)`,

  // Engine KPIs: Spread evenly, Engine, Reallocate and Hindsight at budgets 5 and 10, all and normal days, both views
  // (Hindsight has the model view at budget 5 only). Curve per 100 = f, model view = 4f. Costs 98.41 / 50.72.
  gold_engine_kpis: `SELECT s.strategy, s.mode, b.budget AS budget_scenario, e.evaluator, d.day_type, 1000::BIGINT AS turnarounds,
      b.budget * 1000.0 AS added_min, CASE WHEN s.mode = 'reallocate' THEN 0.0 ELSE b.budget * 1000.0 END AS net_added_min,
      x.per100 * b.budget * 10.0 AS prevented_min, x.per100 * b.budget * 6.0 AS own_absorbed_min, x.per100 AS prevented_per_100,
      x.per100 / 4 AS pct_departure_delay_prevented, (x.per100 * 2)::BIGINT AS late_departures_avoided, x.per100 / 2 AS late_avoided_per_1000,
      x.per100 / 20 AS otp_change_pp, x.per100 * b.budget * 10.0 * 98.41 AS value_usd,
      CASE WHEN s.mode = 'reallocate' THEN 0.0 ELSE b.budget * 1000.0 * 50.72 END AS buffer_cost_usd,
      x.per100 * b.budget * 10.0 * 98.41 - CASE WHEN s.mode = 'reallocate' THEN 0.0 ELSE b.budget * 1000.0 * 50.72 END AS net_value_usd,
      s.eligible AS eligible_share, s.cap AS max_airport_share, true AS budget_respected,
      CASE WHEN b.budget = 5 AND d.day_type = 'all days' AND s.strategy <> 'Hindsight (not possible)' THEN s.f / 12.0 END AS robustness_worst_case_share,
      98.41 AS cost_delay_min_usd, 50.72 AS cost_buffer_min_usd, 'engine-2.0' AS engine_version, ${RUN} AS run_id
    FROM (VALUES ('Spread evenly', 'add', 4.0, 0.9, 0.25), ('Engine (our method)', 'add', 12.0, 1.0, 0.2),
                 ('Engine: reallocate (no added buffer)', 'reallocate', 6.0, 1.0, 0.26), ('Hindsight (not possible)', 'add', 25.0, 1.0, 0.2)) s(strategy, mode, f, eligible, cap),
         (VALUES (5), (10)) b(budget),
         (VALUES ('curve'), ('response model')) e(evaluator),
         (VALUES ('all days'), ('normal days')) d(day_type),
         LATERAL (SELECT s.f * CASE WHEN e.evaluator = 'curve' THEN 1 ELSE 4 END AS per100) x
    WHERE NOT (s.strategy = 'Hindsight (not possible)' AND e.evaluator = 'response model' AND b.budget <> 5)`,

  gold_kpi_catalog: `SELECT *, ${RUN} AS run_id FROM (VALUES
      ('Buffer engine', 'Guardrail', 'guardrail_eligible_share', 'Share of buffer on 20-150 min turnarounds', '100%', 0.89, 1.0, true),
      ('Prediction engine', 'Main', 'late_warning_auc', 'AUC, very short turns excluded', 'Higher than v1', 0.69, 0.70, true),
      ('Buffer engine', 'Money', 'engine_net_value_usd', 'Net value, add mode (curve view)', 'Above zero', -80000000.0, -84000000.0, false),
      ('Buffer engine', 'Main', 'engine_prevented_per_100', 'Delay prevented per 100 buffer min (curve view)', 'Beat spreading evenly', 13.0, 12.0, true),
      ('Prediction engine', 'Model quality', 'top20_capture', 'Late flights caught in the riskiest 20%', 'Higher than v1', 0.35, 0.36, true),
      ('Buffer engine', 'Guardrail', 'budget_respected', 'Daily budget never exceeded', 'Always', 1.0, 1.0, true),
      ('Buffer engine', 'Robustness', 'engine_robustness', 'Worst-case share of the best strategy', 'Highest of all strategies', 0.39, 0.85, NULL)
    ) v(engine, level, kpi_name, kpi_label, target, value_v1, value_v2, target_met)`,

  gold_cost_assumptions: `SELECT * FROM (VALUES
      ('cost_delay_min_usd', '98.41', 'USD per minute', 'Value of one minute of delay prevented', 'Airlines for America, 2025'),
      ('cost_buffer_min_usd', '50.72', 'USD per minute', 'Cost of one extra planned ground minute', 'Airlines for America, 2025'),
      ('eligible_ground_time_min', '20-150', 'minutes', 'Only turnarounds in this planned range can receive buffer', 'Engine v2 guardrail'),
      ('airport_cap_share', '0.2', 'share of a day''s buffer', 'One airport gets at most this share of a day''s buffer', 'Engine v2 guardrail'),
      ('donor_rule', 'over 150 min, never below 120 min', 'minutes', 'Reallocate mode: which stops can give minutes', 'Engine v2 rule'),
      ('blend_weight', '7.812', 'ratio', 'Weight that puts the curve view on the same scale as the outbound-delay model', 'Learned in this run')
    ) v(setting, value, unit, description, source)`,

  // Reallocation on 2026-03-16: N700AA moves 10 min from its MIA long sit to TPA; N800AA has no move
  gold_buffer_reallocation: `SELECT turn_id, strptime(left(turn_id, 8), '%Y%m%d')::DATE AS flight_date, '2026-03' AS year_month, tail AS tail_number,
      airport, 5::BIGINT AS budget_scenario, role, change::BIGINT AS change_min, ground AS current_ground_min, ground + change AS new_ground_min,
      exp AS expected_change_min, real AS realised_absorbed_min, resp AS realised_absorbed_resp_min, 'engine-2.0' AS engine_version, ${RUN} AS run_id
    FROM (VALUES
      ('20260316-0200-CLT-TPA', 'N700AA', 'TPA', 'receives', 10, 60.0, 3.0, 2.0, 4.0),
      ('20260316-0300-ORD-MIA', 'N700AA', 'MIA', 'gives', -10, 160.0, -0.5, -0.2, 0.3),
      ('20260315-1446-TUL-DFW', 'N100AA', 'DFW', 'receives', 5, 121.0, 1.0, 1.5, 2.0)
    ) v(turn_id, tail, airport, role, change, ground, exp, real, resp)`,

  gold_network_daily: `SELECT * FROM (VALUES
      (DATE '2026-01-01', '2026-01', 100.0, 0.2, 10.0, false), (DATE '2026-01-02', '2026-01', 300.0, 0.4, 20.0, true),
      (DATE '2026-02-01', '2026-02', 200.0, 0.1, 5.0, false)) v(flight_date, year_month, operated_flights, arr_late15_rate, avg_arr_delay_min, is_disruption_day)`,
};

export async function writeStandInTables(dir: string): Promise<void> {
  const conn = await (await DuckDBInstance.create(':memory:')).connect();
  for (const [name, select] of Object.entries(TABLES)) {
    await conn.run(`COPY (${select}) TO '${join(dir, `${name}.parquet`).replaceAll('\\', '/')}' (FORMAT parquet)`);
  }
  conn.closeSync();
}
