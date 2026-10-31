// Risk Forecast endpoints on the stand-in tables (tests/fixtures.ts): 10 turnarounds in March, and 60 generated ones
// on 2026-04-10 at ORD (i = 0..59: late chance 0.10 + 0.01 i, predicted inbound 0.5 i, ground 30 + 3 i, actual inbound i;
// 40 depart at 10:xx and 20 at 18:xx).
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ModelQuality, RiskGroundBand, RiskHeatmap, RiskSummary, RiskTrendRow, RiskTurnaround } from '../shared/api-types.ts';
import type { ApiHandler } from '../server/app.ts';
import { clearAll } from '../server/cache.ts';
import { createDevHandler } from '../server/dev.ts';
import { writeStandInTables } from './fixtures.ts';

let dir: string;
let api: ApiHandler;
const get = (path: string) => api(new Request(`http://localhost/api/risk/${path}`));
const json = async <T>(path: string): Promise<T> => {
  const res = await get(path);
  expect(res.status, `${path}: ${res.status}`).toBe(200);
  return res.json() as Promise<T>;
};
const APRIL = 'start=2026-04-10&end=2026-04-10';

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'domino-risk-'));
  await writeStandInTables(dir);
  clearAll();
  api = await createDevHandler({ DATA_MODE: 'local', LOCAL_DATA_DIR: dir });
});

afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('risk/summary', () => {
  it('counts the whole test period by default', async () => {
    const s = await json<RiskSummary>('summary');
    expect(s).toMatchObject({ start: '2026-01-01', end: '2026-08-31', airport: null, turnarounds: 70, high: 39, medium: 21, low: 10 });
  });

  it('summarises a range: average late chance, flagged share, actual share, bands and inbound delay', async () => {
    const s = await json<RiskSummary>(`summary?${APRIL}&airport=ord`);
    expect(s).toMatchObject({ airport: 'ORD', turnarounds: 60, high: 36, medium: 16, low: 8 });
    expect(s.avg_late_chance).toBeCloseTo(0.395);
    expect(s.predicted_late_share).toBeCloseTo(20 / 60);
    expect(s.actual_late_share).toBeCloseTo(45 / 60);
    expect(s.avg_pred_inbound_delay_min).toBeCloseTo(14.75);
  });
});

describe('risk/heatmap', () => {
  it('averages by airport and hour and hides cells with fewer than 30 turnarounds', async () => {
    const h = await json<RiskHeatmap>(`heatmap?${APRIL}`);
    expect(h.airports).toEqual([{ airport: 'ORD', turnarounds: 60 }]);
    expect(h.hours).toEqual([10, 18]);
    expect(h.min_turnarounds).toBe(30);
    expect(h.cells[0]).toMatchObject({ airport: 'ORD', hour: 10, turnarounds: 40 });
    expect(h.cells[0].value).toBeCloseTo(0.295);
    expect(h.cells[1]).toEqual({ airport: 'ORD', hour: 18, turnarounds: 20, value: null });
    const delay = await json<RiskHeatmap>(`heatmap?${APRIL}&metric=pred_inbound_delay_min`);
    expect(delay.cells[0].value).toBeCloseTo(9.75);
  });

  it('keeps the busiest airports, busiest first', async () => {
    const h = await json<RiskHeatmap>('heatmap?top=5');
    expect(h.airports.map((a) => a.airport)).toEqual(['ORD', 'CLT', 'DFW', 'MIA', 'TPA']);
  });
});

describe('risk/trend and risk/by-ground-time', () => {
  it('compares predicted and actual by month', async () => {
    const all = await json<RiskTrendRow[]>('trend');
    expect(all.map((r) => [r.year_month, r.turnarounds])).toEqual([['2026-03', 10], ['2026-04', 60]]);
    const ord = await json<RiskTrendRow[]>('trend?airport=ORD');
    expect(ord).toHaveLength(1);
    expect(ord[0].avg_late_chance).toBeCloseTo(0.395);
    expect(ord[0].actual_late_share).toBeCloseTo(0.75);
  });

  it('groups late chance by planned ground time band, shortest first', async () => {
    const bands = await json<RiskGroundBand[]>('by-ground-time?airport=ORD');
    expect(bands.map((b) => [b.band, b.turnarounds])).toEqual([
      ['Up to 45 min', 6], ['46–55 min', 3], ['56–65 min', 3], ['66–80 min', 5], ['81–120 min', 14], ['Over 120 min', 29],
    ]);
    expect(bands[0].avg_late_chance).toBeCloseTo(0.125);
  });
});

describe('risk/model-quality', () => {
  it('returns deciles, test and validate metrics and inputs for the two models, and a caption', async () => {
    const q = await json<ModelQuality>('model-quality');
    expect(q.deciles).toHaveLength(40);
    expect(new Set(q.deciles.map((d) => d.model))).toEqual(new Set(['late_warning', 'inbound_risk']));
    expect(q.metrics).toHaveLength(8);
    expect(q.metrics.some((m) => m.period === 'train')).toBe(false);
    expect(q.features.filter((f) => f.model === 'late_warning').map((f) => f.rank)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(q.decile_caption).toBe('The riskiest tenth was late 60% of the time; the safest 6%.');
  });
});

describe('risk/airports', () => {
  it('lists the airports of a range, busiest first', async () => {
    expect(await json('airports')).toEqual([
      { airport: 'ORD', turnarounds: 60 }, { airport: 'CLT', turnarounds: 4 }, { airport: 'DFW', turnarounds: 4 },
      { airport: 'MIA', turnarounds: 1 }, { airport: 'TPA', turnarounds: 1 },
    ]);
    expect(await json(`airports?${APRIL}`)).toEqual([{ airport: 'ORD', turnarounds: 60 }]);
  });
});

describe('risk/top-turnarounds', () => {
  it('lists the riskiest turnarounds of a day, optionally at one airport', async () => {
    const top = await json<RiskTurnaround[]>('top-turnarounds?date=2026-03-15&limit=2');
    expect(top.map((r) => r.tail_number)).toEqual(['N600AA', 'N100AA']);
    expect(top[0]).toMatchObject({ airport: 'CLT', inbound_flight_no: 600, outbound_to: 'MIA', risk_band: 'High', actual_late15: true });
    const dfw = await json<RiskTurnaround[]>('top-turnarounds?date=2026-03-15&airport=DFW');
    expect(dfw.map((r) => r.tail_number)).toEqual(['N100AA', 'N200AA', 'N300AA', 'N400AA']);
  });
});

it('refuses parameters outside the allowed values', async () => {
  for (const path of ['summary?start=2026-05-01&end=2026-04-01', 'summary?start=2026-13-01', 'heatmap?metric=actual_late15',
    'heatmap?top=100', 'trend?airport=ORDX', 'top-turnarounds?limit=0', 'top-turnarounds?date=yesterday']) {
    expect((await get(path)).status, path).toBe(400);
  }
});
