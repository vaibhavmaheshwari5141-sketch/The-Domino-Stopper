// /api/health, /api/meta and /api/overview in local mode against the real parquet files from notebook 08.
// Skipped, with the folder named, when LOCAL_DATA_DIR has no parquet files.
import { existsSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { OVERVIEW_KPIS } from '../shared/api-types.ts';
import { clearAll } from '../server/cache.ts';
import { readConfig } from '../server/config.ts';
import { createDevHandler } from '../server/dev.ts';

const env = { ...process.env, DATA_MODE: 'local' };
const dir = readConfig(env).localDataDir;
const hasData = existsSync(dir) && readdirSync(dir).some((f) => f.endsWith('.parquet'));
const title = hasData ? `API on real data in ${dir}` : `API on real data (SKIPPED: no parquet files in ${dir}; copy notebook 08's consumption_tables/parquet there or set LOCAL_DATA_DIR)`;

describe.skipIf(!hasData)(title, () => {
  const call = async (path: string) => {
    clearAll();
    return (await createDevHandler(env))(new Request(`http://localhost${path}`));
  };

  it('GET /api/health reports database_ok', async () => {
    expect(await (await call('/api/health')).json()).toEqual({ status: 'ok', data_mode: 'local', database_ok: true });
  });

  it('GET /api/meta returns a run_id and the table catalog', async () => {
    const body = await (await call('/api/meta')).json();
    expect(body.run.run_id).toBeTruthy();
    expect(body.tables.length).toBeGreaterThan(0);
  });

  it('GET /api/overview has every key and a sensible late-warning AUC', async () => {
    const body = await (await call('/api/overview?budget=5')).json();
    for (const key of ['kpis', 'strategy', 'monthly', 'summary', 'insights', 'context']) expect(body).toHaveProperty(key);
    for (const name of OVERVIEW_KPIS) expect(body.kpis).toHaveProperty(name);
    const auc = body.kpis.late_warning_auc.value;
    expect(auc).toBeGreaterThan(0.5);
    expect(auc).toBeLessThan(1);
    expect(body.insights).toHaveLength(5);
  });

  it('Buffer Planner: 2026-03-15 at 5 min matches the engine output', async () => {
    const s = await (await call('/api/planner/summary?date=2026-03-15&budget=5')).json();
    expect(s).toMatchObject({ turnarounds: 1415, turnarounds_with_buffer: 275, buffer_used_min: 7060, late_departures_avoided: 5 });
    expect(s.expected_absorbed_min).toBeCloseTo(887.7, 1);
    expect(s.realised_absorbed_min).toBeCloseTo(1748.8, 1);
    expect(s.buffer_used_min).toBeLessThanOrEqual(s.budget_min);
    const counts = Object.fromEntries(s.breakdown.reasons.map((r: { reason_code: string; turnarounds: number }) => [r.reason_code.split(': ')[1], r.turnarounds]));
    expect(counts).toEqual({
      'budget used on turnarounds with more value per minute': 699,
      'low inbound risk': 325,
      'likely late arrival and ground time already absorbs delay': 191,
      'too short, extra minutes absorb almost nothing': 116,
      'enough minutes to reach the range where delay is absorbed': 84,
    });
    const table = await (await call('/api/planner/turnarounds?date=2026-03-15&budget=5&limit=50')).json();
    expect(table.total).toBe(1415);
    expect(table.rows).toHaveLength(50);
    expect(table.rows[0].day_rank).toBe(1);
  });

  it('Buffer Planner: buffer used never exceeds the budget, on any day or budget', async () => {
    for (const budget of [2, 5, 10, 15]) {
      const days: { buffer_used_min: number; budget_min: number }[] = await (await call(`/api/planner/dates?budget=${budget}`)).json();
      expect(days).toHaveLength(243);
      expect(days.filter((d) => d.buffer_used_min > d.budget_min)).toEqual([]);
    }
  });

  it('Aircraft Day: N156UW on 2026-03-15 has the expected chain', async () => {
    const day = await (await call('/api/aircraft-day?tail=N156UW&date=2026-03-15&budget=5')).json();
    expect(day.turnarounds.map((x: { airport: string }) => x.airport)).toEqual(['CLT', 'TPA', 'CLT', 'RIC', 'CLT', 'DFW']);
    expect(day.flights.map((f: { flight_no: number; from: string; to: string }) => `${f.flight_no} ${f.from}-${f.to}`)).toEqual([
      '2718 PIT-CLT', '2516 CLT-TPA', '2516 TPA-CLT', '3118 CLT-RIC', '3118 RIC-CLT', '3101 CLT-DFW', '2512 DFW-ONT',
    ]);
    expect(day.breaks).toBe(0);
    const last = day.turnarounds[5];
    expect(last).toMatchObject({ sched_ground_min: 62, risk_band: 'High', actual_inbound_delay_min: 87, actual_outbound_delay_min: 126 });
    expect(last.p_late15).toBeCloseTo(0.5, 1);
    expect(last.pred_inbound_delay_min).toBeCloseTo(15.6, 1);
    const list = await (await call('/api/aircraft-day/aircraft?date=2026-03-15&budget=5&search=N156UW')).json();
    expect(list.aircraft[0]).toMatchObject({ tail_number: 'N156UW', turnarounds: 6, flights: 7, first_airport: 'PIT', last_airport: 'ONT' });
  });

  it('Scenario Simulator: budget 5 and the budget sweep match the replay', async () => {
    type Row = { strategy: string; budget_scenario: number; absorbed_min: number; absorbed_per_100_added: number; pct_removed: number;
      engine_vs_this: number | null; engine_vs_this_ci95_low: number | null; engine_vs_this_ci95_high: number | null };
    const pick = (rows: Row[], s: string) => rows.find((r) => r.strategy === s)!;
    const all = await (await call('/api/simulator/strategies?budget=5&day_type=all%20days')).json();
    const engine = pick(all.rows, 'Engine (our method)');
    const even = pick(all.rows, 'Spread evenly');
    expect(Math.round(engine.absorbed_min)).toBe(271117);
    expect(engine.absorbed_per_100_added).toBeCloseTo(12.8, 1);
    expect(engine.pct_removed).toBeCloseTo(5.35, 2);
    expect(even.engine_vs_this).toBeCloseTo(4.04, 2);
    expect(even.engine_vs_this_ci95_low).toBeCloseTo(3.97, 2);
    expect(even.engine_vs_this_ci95_high).toBeCloseTo(4.11, 2);
    expect(pick(all.rows, 'Riskiest first').engine_vs_this).toBeCloseTo(1.21, 2);
    expect(Math.round(even.absorbed_min)).toBe(67190);
    expect(even.absorbed_per_100_added).toBeCloseTo(3.2, 1);
    expect(all.period.disruption_days).toBe(16);

    const sweep = await (await call('/api/simulator/sweep?day_type=all%20days')).json();
    const enginePer100 = sweep.rows.filter((r: Row) => r.strategy === 'Engine (our method)').map((r: Row) => Math.round(r.absorbed_per_100_added * 10) / 10);
    expect(enginePer100).toEqual([17.3, 12.8, 9.7, 8.0]);

    const disruption = await (await call('/api/simulator/strategies?budget=5&day_type=disruption%20days')).json();
    expect(pick(disruption.rows, 'Engine (our method)').absorbed_per_100_added).toBeCloseTo(20.5, 1);
    expect(pick(disruption.rows, 'Spread evenly').absorbed_per_100_added).toBeCloseTo(5.6, 1);

    const alloc = await (await call('/api/simulator/allocation?budget=5&grouping=Inbound-risk%20fifth')).json();
    expect(alloc.caption).toMatch(/^64% of the buffer goes to the riskiest fifth/);
  });

  it('Risk Forecast: whole test period, deciles and AUC match the models', async () => {
    const s = await (await call('/api/risk/summary')).json();
    expect(s).toMatchObject({ turnarounds: 425272, high: 127582, medium: 170108, low: 127582 });
    const q = await (await call('/api/risk/model-quality')).json();
    type D = { model: string; period: string; decile: number; observed: number };
    const lw = q.deciles.filter((d: D) => d.model === 'late_warning' && d.period === 'test');
    expect(lw.find((d: D) => d.decile === 10).observed).toBeCloseTo(0.643, 3);
    expect(lw.find((d: D) => d.decile === 1).observed).toBeCloseTo(0.107, 3);
    type M = { model: string; predictor: string; period: string; measure: string; value: number };
    const auc = (predictor: string) => q.metrics.find((m: M) => m.model === 'late_warning' && m.period === 'test' && m.measure === 'AUC' && m.predictor === predictor).value;
    expect(auc('LightGBM model')).toBeCloseTo(0.703, 3);
    expect(auc('Baseline: airport and hour late-rate')).toBeCloseTo(0.619, 3);
    expect(q.decile_caption).toBe('The riskiest tenth was late 64% of the time; the safest 11%.');
    const heat = await (await call('/api/risk/heatmap')).json();
    expect(heat.airports).toHaveLength(20);
    expect(heat.cells.filter((c: { turnarounds: number; value: number | null }) => c.turnarounds < 30).every((c: { value: number | null }) => c.value === null)).toBe(true);
  });

  it('Airport Insights: 137 airports; DFW, CLT and MIA lead', async () => {
    const list = await (await call('/api/airports/list?min_departures=0')).json();
    expect(list.total).toBe(137);
    type A = { airport: string; departures: number; turnarounds: number; median_ground_min: number; departure_rank: number };
    const [dfw, clt, mia] = list.airports as A[];
    expect(dfw).toMatchObject({ airport: 'DFW', departures: 274840, turnarounds: 198423, median_ground_min: 67, departure_rank: 1 });
    expect(clt).toMatchObject({ airport: 'CLT', departures: 193316, median_ground_min: 66, departure_rank: 2 });
    expect(mia).toMatchObject({ airport: 'MIA', median_ground_min: 81, departure_rank: 3 });
    const profile = await (await call('/api/airports/DFW/profile')).json();
    expect(profile.ranks.departures).toBe(1);
    expect(profile.network.median_ground_min).toBe(61);
    const scatter = await (await call('/api/airports/network-scatter')).json();
    expect(scatter.correlation).toBeLessThan(-0.3);
  });

  it('Delay Propagation: the 63-minute rule, the curve, the snowball and the calculator', async () => {
    const { kpis } = await (await call('/api/propagation/kpis')).json();
    expect(kpis.absorption_threshold.value).toBeCloseTo(62.9, 1);
    expect(kpis.pass_through_short.value).toBeCloseTo(0.981, 3);
    expect(kpis.pass_through_medium.value).toBeCloseTo(0.971, 3);
    expect(kpis.pass_through_long.value).toBeCloseTo(0.282, 3);
    expect(kpis.delay_buildup.value).toBeCloseTo(18.8, 1);
    const curve = await (await call('/api/propagation/curve')).json();
    type B = { sg_band: string; pass_through_smoothed: number };
    const smoothed = Object.fromEntries((curve.bands as B[]).map((b) => [b.sg_band, b.pass_through_smoothed]));
    expect(curve.bands).toHaveLength(19);
    expect(smoothed['61-65']).toBeCloseTo(0.99, 2);
    expect(smoothed['111-120']).toBeCloseTo(0.72, 2);
    expect(smoothed['over 240']).toBeCloseTo(0.075, 3);
    expect(curve.points).toHaveLength(31);
    const legs = await (await call('/api/propagation/by-leg?period=all')).json();
    expect(legs.legs.map((l: { avg_dep_delay_min: number }) => Math.round(l.avg_dep_delay_min * 10) / 10)).toEqual([11.9, 17.4, 22.5, 27.4, 33.3, 40]);
    const calc = await (await call('/api/propagation/calculate?ground_min=60&inbound_delay_min=30&extra_min=30')).json();
    expect([calc.pass_through_now, calc.pass_through_after]).toEqual([0.9927, 0.8594]);
    expect(calc.delay_absorbed).toBeCloseTo(4.0, 2);
    expect((await (await call('/api/propagation/calculate?ground_min=30&inbound_delay_min=30&extra_min=10')).json()).delay_absorbed).toBe(0);
    const seg = await (await call('/api/propagation/segments?segment_type=Airport%20type')).json();
    expect(seg.caption).toBe('Long turnarounds at the ten busiest airports pass on 0.25 of the delay, against 0.56 elsewhere.');
  });
});
