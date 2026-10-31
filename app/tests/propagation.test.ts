// Delay Propagation endpoints on the stand-in tables (tests/fixtures.ts), and the shared calculator on the real curve points.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type {
  AbsorptionResult, PropagationByLeg, PropagationCurve, PropagationKpis, PropagationSegments,
} from '../shared/api-types.ts';
import { bandIndexFor, bandRange, calculateAbsorption } from '../shared/propagation.ts';
import type { ApiHandler } from '../server/app.ts';
import { clearAll } from '../server/cache.ts';
import { createDevHandler } from '../server/dev.ts';
import { writeStandInTables } from './fixtures.ts';

let dir: string;
let api: ApiHandler;
const get = (path: string) => api(new Request(`http://localhost/api/propagation/${path}`));
const json = async <T>(path: string): Promise<T> => {
  const res = await get(path);
  expect(res.status, `${path}: ${res.status}`).toBe(200);
  return res.json() as Promise<T>;
};

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'domino-propagation-'));
  await writeStandInTables(dir);
  clearAll();
  api = await createDevHandler({ DATA_MODE: 'local', LOCAL_DATA_DIR: dir });
});

afterAll(() => rmSync(dir, { recursive: true, force: true }));

// The first points of the real curve_points (notebook 08)
const REAL = [0, 10, 20, 30, 40, 50, 60].map((g) => ({ ground_min: g, pass_through: 0.9927 }))
  .concat([{ ground_min: 70, pass_through: 0.9541 }, { ground_min: 80, pass_through: 0.8944 }, { ground_min: 90, pass_through: 0.8594 }]);

describe('calculator (shared)', () => {
  it('60 min ground, 30 min late, +30 min absorbs about 4 minutes', () => {
    const r = calculateAbsorption(REAL, { ground_min: 60, inbound_delay_min: 30, extra_min: 30 });
    expect(r.pass_through_now).toBe(0.9927);
    expect(r.pass_through_after).toBe(0.8594);
    expect(r.delay_absorbed).toBeCloseTo(4.0, 2);
    expect(r.delay_passed_on_now - r.delay_passed_on_after).toBeCloseTo(r.delay_absorbed, 9);
    expect(r.sentence).toBe('Moving this turnaround from 60 to 90 minutes passes on 86% of the delay instead of 99%.');
  });

  it('30 min ground +10 absorbs nothing; inputs are clamped; no extra gives its own sentence', () => {
    expect(calculateAbsorption(REAL, { ground_min: 30, inbound_delay_min: 30, extra_min: 10 }).delay_absorbed).toBe(0);
    const c = calculateAbsorption(REAL, { ground_min: 500, inbound_delay_min: -3, extra_min: 99 });
    expect([c.ground_min, c.inbound_delay_min, c.extra_min, c.new_ground_min]).toEqual([300, 0, 60, 360]);
    expect(calculateAbsorption(REAL, { ground_min: 65, inbound_delay_min: 20, extra_min: 0 }).sentence)
      .toBe('Without extra buffer, this 65-minute turnaround passes on 97% of the delay.');
    // between points: 75 min is half-way from 0.9541 to 0.8944
    expect(calculateAbsorption(REAL, { ground_min: 60, inbound_delay_min: 10, extra_min: 15 }).pass_through_after).toBeCloseTo(0.92425, 6);
  });

  it('band labels', () => {
    expect(bandRange('up to 30')).toEqual([0, 30]);
    expect(bandRange('61-65')).toEqual([61, 65]);
    expect(bandRange('over 240')).toEqual([241, Infinity]);
    expect(bandRange('Medium (56-80)')).toEqual([56, 80]);
    expect(bandIndexFor(['up to 30', '56-60', '61-65', '66-70'], 62.9)).toBe(2);
    expect(bandIndexFor(['up to 30', '56-60'], 45)).toBe(-1);
  });
});

describe('/api/propagation', () => {
  it('curve: fitted bands by mean ground time, the parsed curve points and the threshold', async () => {
    const c = await json<PropagationCurve>('curve');
    expect(c.bands.map((b) => b.sg_band)).toEqual(['up to 30', '56-60', '61-65', '111-120']);
    expect(c.bands[0]).toMatchObject({ turnarounds: 100, pass_through: 0.55, pass_through_smoothed: 0.99 });
    expect(c.bands[0].ci95_low).toBeCloseTo(0.5, 9);
    expect(c.points).toEqual([
      { ground_min: 0, pass_through: 0.99 }, { ground_min: 60, pass_through: 0.99 }, { ground_min: 100, pass_through: 0.8 },
      { ground_min: 200, pass_through: 0.4 }, { ground_min: 300, pass_through: 0.2 },
    ]);
    expect(c.threshold_min).toBe(60.4);
    expect(c.curve_version).toBe('curve-train2025-1.0');
  });

  it('segments: one type in display order with a caption built from the data', async () => {
    const a = await json<PropagationSegments>('segments?segment_type=Airport%20type');
    expect(a.segments).toEqual(['Ten busiest', 'Other airports']);
    expect(a.bands).toEqual(['Short (up to 55)', 'Medium (56-80)', 'Long (over 80)']);
    expect(a.rows).toHaveLength(6);
    expect(a.rows.every((r) => r.segment_type === 'Airport type')).toBe(true);
    expect(a.caption).toBe('Long turnarounds at the ten busiest airports pass on 0.25 of the delay, against 0.56 elsewhere.');

    const tod = await json<PropagationSegments>('segments?segment_type=Time%20of%20day');
    expect(tod.segments).toEqual(['Morning (05-11)', 'Afternoon (12-16)']);
    expect(tod.caption).toBe('Long turnarounds pass on 0.26 of the delay for Afternoon (12-16), against 0.46 for Morning (05-11).');

    const all = await json<PropagationSegments>('segments');
    expect(all.segment_type).toBe('all');
    expect(all.rows).toHaveLength(13);
    expect(all.caption).toBeNull();
    expect((await get('segments?segment_type=Airline')).status).toBe(400);
  });

  it('by-leg: one period, in leg order, with the snowball caption', async () => {
    const l = await json<PropagationByLeg>('by-leg');
    expect(l.period).toBe('all');
    expect(l.legs.map((r) => [r.leg_label, r.avg_dep_delay_min])).toEqual([['1', 11.9], ['2', 17.4], ['3', 22.5], ['6+', 40]]);
    expect(l.caption).toBe('Average departure delay grows from 11.9 min on the first flight of the day to 40.0 min on flight 6+. '
      + 'Delay that is not absorbed early is carried through the rest of the day.');
    expect((await json<PropagationByLeg>('by-leg?period=test')).legs).toHaveLength(2);
    expect((await get('by-leg?period=2025')).status).toBe(400);
  });

  it('kpis: the propagation KPIs, missing ones as null', async () => {
    const { kpis } = await json<PropagationKpis>('kpis');
    expect(kpis.absorption_threshold?.value).toBe(60.4);
    expect(kpis.pass_through_long?.value).toBe(0.28);
    expect(kpis.delay_buildup?.value).toBe(18);
    expect(kpis.median_ground_time?.value).toBe(61);
    expect(kpis.short_turn_share).toBeNull();
  });

  it('calculate: interpolates the curve, clamps inputs and refuses non-numbers', async () => {
    const r = await json<AbsorptionResult>('calculate?ground_min=60&inbound_delay_min=30&extra_min=30');
    expect(r.pass_through_after).toBeCloseTo(0.8475, 9);                // 0.99 + 30/40 × (0.8 − 0.99)
    expect(r.delay_absorbed).toBeCloseTo(4.275, 9);
    expect((await json<AbsorptionResult>('calculate?ground_min=30&inbound_delay_min=30&extra_min=10')).delay_absorbed).toBe(0);
    const d = await json<AbsorptionResult>('calculate');
    expect([d.ground_min, d.inbound_delay_min, d.extra_min]).toEqual([60, 30, 15]);
    const c = await json<AbsorptionResult>('calculate?ground_min=400&inbound_delay_min=-10&extra_min=75');
    expect([c.ground_min, c.inbound_delay_min, c.extra_min]).toEqual([300, 0, 60]);
    expect((await get('calculate?extra_min=ten')).status).toBe(400);
  });
});
