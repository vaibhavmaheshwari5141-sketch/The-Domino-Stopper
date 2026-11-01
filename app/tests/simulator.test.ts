// Scenario Simulator endpoints on the stand-in tables (tests/fixtures.ts). Strategy factors there: Spread evenly 3,
// Shortest first 2, Riskiest first 10, Engine 12, Hindsight 25 (absorbed per 100 buffer minutes at budget 5, all days).
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SimAllocationResponse, SimDailyResponse, SimStrategiesResponse, SimSweepResponse } from '../shared/api-types.ts';
import type { ApiHandler } from '../server/app.ts';
import { clearAll } from '../server/cache.ts';
import { createDevHandler } from '../server/dev.ts';
import { writeStandInTables } from './fixtures.ts';

let dir: string;
let api: ApiHandler;
const get = (path: string) => api(new Request(`http://localhost/api/simulator/${path}`));
const json = async <T>(path: string): Promise<T> => {
  const res = await get(path);
  expect(res.status, `${path}: ${res.status}`).toBe(200);
  return res.json() as Promise<T>;
};
const enc = encodeURIComponent;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'domino-sim-'));
  await writeStandInTables(dir);
  clearAll();
  api = await createDevHandler({ DATA_MODE: 'local', LOCAL_DATA_DIR: dir });
});

afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('simulator/strategies and simulator/sweep', () => {
  it('returns every strategy the data holds in display order, without "No buffer", and the replay period', async () => {
    const r = await json<SimStrategiesResponse>('strategies?budget=5&day_type=all%20days');
    expect(r.rows.map((x) => x.strategy)).toEqual(['Spread evenly', 'Shortest first', 'Riskiest first', 'Engine (our method)',
      'Engine: reallocate (no added buffer)', 'Hindsight (not possible)']);
    expect(r.rows.map((x) => x.mode)).toEqual(['add', 'add', 'add', 'add', 'reallocate', 'add']);
    const engine = r.rows[3];
    expect(engine).toMatchObject({ added_min: 5000, absorbed_min: 600, pct_removed: 6, absorbed_per_100_added: 12, late_avoided_per_1000: 6, engine_vs_this: null });
    expect(r.rows[0].engine_vs_this).toBe(4);
    expect(r.rows[0].engine_vs_this_ci95_low).toBeCloseTo(3.92);
    expect(r.period).toEqual({ days: 3, disruption_days: 1, first_day: '2026-01-01', last_day: '2026-02-01' });
  });

  it('switches day type and budget', async () => {
    const disruption = await json<SimStrategiesResponse>(`strategies?budget=5&day_type=${enc('disruption days')}`);
    expect(disruption.rows.find((x) => x.strategy === 'Engine (our method)')?.absorbed_per_100_added).toBe(18);
    const b10 = await json<SimStrategiesResponse>('strategies?budget=10');
    expect(b10.day_type).toBe('all days');
    expect(b10.rows.find((x) => x.strategy === 'Engine (our method)')?.absorbed_per_100_added).toBeCloseTo(9.6);
  });

  it('sweeps every strategy over every budget, budget first', async () => {
    const s = await json<SimSweepResponse>('sweep?day_type=all%20days');
    expect(s.rows).toHaveLength(12);
    expect(s.rows.slice(0, 6).every((x) => x.budget_scenario === 5)).toBe(true);
    expect(s.rows.map((x) => x.strategy).slice(0, 2)).toEqual(['Spread evenly', 'Shortest first']);
  });
});

describe('simulator/daily', () => {
  it('returns daily rows for the chosen strategies and a monthly roll-up', async () => {
    const d = await json<SimDailyResponse>('daily?budget=5');
    expect(d.strategies).toEqual(['Spread evenly', 'Engine (our method)']);
    expect(d.daily).toHaveLength(6);
    expect(d.monthly).toEqual([
      { year_month: '2026-01', strategy: 'Spread evenly', buffer_added_min: 10000, absorbed_min: 400, late_departures_avoided: 3, disruption_days: 1 },
      { year_month: '2026-01', strategy: 'Engine (our method)', buffer_added_min: 10000, absorbed_min: 1500, late_departures_avoided: 8, disruption_days: 1 },
      { year_month: '2026-02', strategy: 'Spread evenly', buffer_added_min: 5000, absorbed_min: 120, late_departures_avoided: 0, disruption_days: 0 },
      { year_month: '2026-02', strategy: 'Engine (our method)', buffer_added_min: 5000, absorbed_min: 500, late_departures_avoided: 2, disruption_days: 0 },
    ]);
    const risky = await json<SimDailyResponse>(`daily?budget=5&strategies=${enc('Riskiest first')}`);
    expect(risky.daily.map((x) => x.absorbed_min)).toEqual([400]);
  });
});

describe('simulator/allocation', () => {
  it('orders the groups naturally and explains the pattern in a sentence', async () => {
    const risk = await json<SimAllocationResponse>(`allocation?budget=5&grouping=${enc('Inbound-risk fifth')}`);
    expect(risk.rows.map((r) => r.group)).toEqual(['1 lowest risk', '2', '3', '4', '5 highest risk']);
    expect(risk.caption).toBe('50% of the buffer goes to the riskiest fifth of turnarounds, and 1% to the safest fifth.');

    const ground = await json<SimAllocationResponse>(`allocation?grouping=${enc('Ground-time band')}`);
    expect(ground.rows.map((r) => r.group)).toEqual(['Short (up to 55)', 'Medium (56-80)', 'Long (81-120)', 'Very long (over 120)']);
    expect(ground.caption).toBe('Stops over 80 minutes get 50% of the buffer but are 20% of turnarounds; short stops (up to 55 min) get 20% against 40% of turnarounds.');

    const type = await json<SimAllocationResponse>(`allocation?grouping=${enc('Airport type')}`);
    expect(type.rows[0].group).toBe('Ten busiest');
    expect(type.caption).toBe('The ten busiest airports get 70% of the buffer and have 60% of the turnarounds.');
  });

  it('keeps the top 15 airports by engine buffer', async () => {
    const a = await json<SimAllocationResponse>('allocation?grouping=Airport');
    expect(a.rows).toHaveLength(15);
    expect(a.rows[0].group).toBe('AAX');
    expect(a.caption).toBe('AAX gets the most buffer: 11%, for 11% of the turnarounds. The top 15 airports get 98% together.');
  });
});

it('refuses values outside the allowed lists', async () => {
  for (const path of ['strategies?budget=3', `strategies?day_type=weekends`, `allocation?grouping=Region`, `daily?strategies=${enc("Engine'; DROP")}`,
    `daily?strategies=${enc(Array.from({ length: 13 }, (_, i) => `S${i}`).join(','))}`, 'sweep?day_type=all']) {
    expect((await get(path)).status, path).toBe(400);
  }
});

it('reads strategy names from the data: unknown names return no rows, and "No buffer" is never returned', async () => {
  const r = await json<SimDailyResponse>(`daily?strategies=${enc('Engine (our method),Magic,No buffer')}`);
  expect(new Set(r.daily.map((d) => d.strategy))).toEqual(new Set(['Engine (our method)']));
});
