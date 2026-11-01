// Engine v2 endpoints on the stand-in tables (tests/fixtures.ts): /api/kpis/..., /api/planner/reallocation and the
// v2 segment curves. Engine KPIs there: Spread evenly 4, Engine 12, Reallocate 6, Hindsight 25 per 100 buffer minutes
// in the curve view, four times that in the model view; budgets 5 and 10; all and normal days.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type {
  AbsorptionResult, CostsResponse, EngineKpisResponse, KpiCatalogResponse, NetValueResponse, ReallocationResponse, SegmentCurves,
} from '../shared/api-types.ts';
import type { ApiHandler } from '../server/app.ts';
import { clearAll } from '../server/cache.ts';
import { createDevHandler } from '../server/dev.ts';
import { writeStandInTables } from './fixtures.ts';

let dir: string;
let api: ApiHandler;
const get = (path: string) => api(new Request(`http://localhost/api/${path}`));
const json = async <T>(path: string): Promise<T> => {
  const res = await get(path);
  expect(res.status, `${path}: ${res.status}`).toBe(200);
  return res.json() as Promise<T>;
};
const enc = encodeURIComponent;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'domino-kpis-'));
  await writeStandInTables(dir);
  clearAll();
  api = await createDevHandler({ DATA_MODE: 'local', LOCAL_DATA_DIR: dir });
});

afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('kpis/catalog', () => {
  it('groups the KPIs by engine, then level, in display order', async () => {
    const c = await json<KpiCatalogResponse>('kpis/catalog');
    expect(c.rows).toHaveLength(7);
    expect(c.groups.map((g) => g.engine)).toEqual(['Prediction engine', 'Buffer engine']);
    expect(c.groups[1].levels.map((l) => l.level)).toEqual(['Main', 'Money', 'Robustness', 'Guardrail']);
    expect(c.groups[1].levels[3].rows.map((r) => r.kpi_name)).toEqual(['guardrail_eligible_share', 'budget_respected']);
    expect(c.rows.find((r) => r.kpi_name === 'engine_robustness')?.target_met).toBeNull();
  });
});

describe('kpis/engine', () => {
  it('returns one row per strategy for one view, and both views only when asked: never added together', async () => {
    const curve = await json<EngineKpisResponse>(`kpis/engine?budget=5&day_type=${enc('all days')}&evaluator=curve`);
    expect(curve.rows).toHaveLength(4);
    expect(new Set(curve.rows.map((r) => r.strategy)).size).toBe(4);
    expect(curve.strategies).toEqual(['Spread evenly', 'Engine (our method)', 'Engine: reallocate (no added buffer)', 'Hindsight (not possible)']);
    const both = await json<EngineKpisResponse>('kpis/engine?budget=5');
    expect(both.evaluator).toBe('both');
    expect(both.rows).toHaveLength(8);
    const engine = both.rows.filter((r) => r.strategy === 'Engine (our method)');
    expect(engine.map((r) => [r.evaluator, r.prevented_per_100, r.prevented_min])).toEqual([['curve', 12, 600], ['response model', 48, 2400]]);
  });

  it('filters by mode and day type, and sweeps every budget', async () => {
    const realloc = await json<EngineKpisResponse>('kpis/engine?budget=5&mode=reallocate&evaluator=curve');
    expect(realloc.rows).toHaveLength(1);
    expect(realloc.rows[0]).toMatchObject({ strategy: 'Engine: reallocate (no added buffer)', mode: 'reallocate', net_added_min: 0, buffer_cost_usd: 0 });
    const normal = await json<EngineKpisResponse>(`kpis/engine?budget=10&day_type=${enc('normal days')}`);
    expect(normal.rows.every((r) => r.day_type === 'normal days' && r.budget_scenario === 10)).toBe(true);
    expect(normal.rows.filter((r) => r.strategy === 'Hindsight (not possible)').map((r) => r.evaluator)).toEqual(['curve']);
    const sweep = await json<EngineKpisResponse>('kpis/engine?budget=all&evaluator=curve');
    expect(sweep.budget).toBe('all');
    expect(sweep.rows.map((r) => r.budget_scenario)).toEqual([5, 5, 5, 5, 10, 10, 10, 10]);
  });

  it('refuses values outside the allowed lists', async () => {
    for (const path of ['kpis/engine?budget=3', 'kpis/engine?evaluator=model', 'kpis/engine?mode=remove', 'kpis/engine?day_type=weekends']) {
      expect((await get(path)).status, path).toBe(400);
    }
  });
});

describe('kpis/costs', () => {
  it('returns the stored assumptions and the numbers the page needs', async () => {
    const c = await json<CostsResponse>('kpis/costs');
    expect(c.rows).toHaveLength(6);
    expect(c).toMatchObject({ cost_delay_min_usd: 98.41, cost_buffer_min_usd: 50.72, airport_cap_share: 0.2, eligible_ground_min: [20, 150], limits: { min: 0, max: 500 } });
  });
});

describe('kpis/net-value', () => {
  it('uses the stored costs by default and keeps negative net values', async () => {
    const n = await json<NetValueResponse>('kpis/net-value?budget=5');
    expect(n).toMatchObject({ budget: 5, day_type: 'all days', cost_delay_min_usd: 98.41, cost_buffer_min_usd: 50.72 });
    expect(n.rows).toHaveLength(8);
    const engine = n.rows.find((r) => r.strategy === 'Engine (our method)' && r.evaluator === 'curve')!;
    // 600 min prevented x 98.41 - 5,000 min added x 50.72
    expect(engine.net_value_usd).toBeCloseTo(600 * 98.41 - 5000 * 50.72);
    expect(engine.net_value_usd).toBeLessThan(0);
    expect(engine.break_even_buffer_cost_usd).toBeCloseTo((600 * 98.41) / 5000);
    // Reallocation adds nothing: no buffer cost, no break-even
    const realloc = n.rows.find((r) => r.mode === 'reallocate' && r.evaluator === 'response model')!;
    expect(realloc).toMatchObject({ net_added_min: 0, buffer_cost_usd: 0, break_even_buffer_cost_usd: null });
    expect(realloc.net_value_usd).toBeCloseTo(1200 * 98.41);
  });

  it('recomputes for the costs asked for, and refuses costs outside 0 to 500', async () => {
    const n = await json<NetValueResponse>('kpis/net-value?budget=5&cost_delay=200&cost_buffer=10');
    const engine = n.rows.find((r) => r.strategy === 'Engine (our method)' && r.evaluator === 'curve')!;
    expect(engine.net_value_usd).toBeCloseTo(600 * 200 - 5000 * 10);
    expect(engine.break_even_buffer_cost_usd).toBeCloseTo(24);
    for (const bad of ['cost_delay=-1', 'cost_buffer=500.5', 'cost_delay=abc', 'budget=7']) {
      expect((await get(`kpis/net-value?${bad}`)).status, bad).toBe(400);
    }
  });
});

describe('planner/reallocation', () => {
  it('lists the stops that give and receive minutes, with their flight chain, and a day summary', async () => {
    const r = await json<ReallocationResponse>('planner/reallocation?date=2026-03-16');
    expect(r.budget).toBe(5);
    expect(r.rows.map((x) => [x.tail_number, x.airport, x.role, x.change_min])).toEqual([['N700AA', 'TPA', 'receives', 10], ['N700AA', 'MIA', 'gives', -10]]);
    expect(r.rows[0]).toMatchObject({ inbound_from: 'CLT', outbound_to: 'CLT', outbound_flight_no: 201, risk_band: 'High', p_late15: 0.45 });
    expect(r.summary).toEqual({
      aircraft: 1, receiving: 1, giving: 1, minutes_moved: 10, net_added_min: 0,
      expected_prevented_min: 2.5, realised_prevented_min: 1.8, realised_prevented_resp_min: 4.3,
    });
  });

  it('filters by airport and tail, and refuses bad parameters', async () => {
    expect((await json<ReallocationResponse>('planner/reallocation?date=2026-03-16&airport=MIA')).rows.map((x) => x.role)).toEqual(['gives']);
    expect((await json<ReallocationResponse>('planner/reallocation?date=2026-03-16&tail=N800')).rows).toEqual([]);
    expect((await json<ReallocationResponse>('planner/reallocation?date=2026-03-15&tail=n100')).summary.minutes_moved).toBe(5);
    for (const bad of ['date=2026-13-01', 'date=2026-03-16&airport=MIAMI', '']) {
      expect((await get(`planner/reallocation?${bad}`)).status, bad).toBe(400);
    }
  });
});

describe('propagation: engine v2 segment curves', () => {
  it('returns one sorted curve per segment, with the ground time read as a number', async () => {
    const s = await json<SegmentCurves>('propagation/segment-curves');
    expect(s.segments.map((x) => x.segment)).toEqual(['All turnarounds', 'Ten busiest | Morning']);
    expect(s.segments[1].points.map((p) => p.ground_min)).toEqual([0, 60, 120, 300]);
  });

  it('lets the calculator use a segment curve, and answers 404 for an unknown segment', async () => {
    const r = await json<AbsorptionResult>(`propagation/calculate?ground_min=60&inbound_delay_min=30&extra_min=60&curve=${enc('Ten busiest | Morning')}`);
    expect(r.pass_through_now).toBeCloseTo(0.97);
    expect(r.pass_through_after).toBeCloseTo(0.6);
    expect((await get(`propagation/calculate?curve=${enc('Nowhere | Night')}`)).status).toBe(404);
    expect((await get(`propagation/calculate?curve=${enc("x'; DROP")}`)).status).toBe(400);
  });
});
