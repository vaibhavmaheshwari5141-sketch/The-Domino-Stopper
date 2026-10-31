// Airport Insights endpoints on the stand-in tables (tests/fixtures.ts): DFW, CLT, ORD and TPA, with DFW over two months.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AirportBuffer, AirportHourly, AirportListResponse, AirportMonth, AirportProfile, NetworkScatter } from '../shared/api-types.ts';
import type { ApiHandler } from '../server/app.ts';
import { clearAll } from '../server/cache.ts';
import { createDevHandler } from '../server/dev.ts';
import { pearson } from '../server/routes/airports.ts';
import { writeStandInTables } from './fixtures.ts';

let dir: string;
let api: ApiHandler;
const get = (path: string) => api(new Request(`http://localhost/api/airports/${path}`));
const json = async <T>(path: string): Promise<T> => {
  const res = await get(path);
  expect(res.status, `${path}: ${res.status}`).toBe(200);
  return res.json() as Promise<T>;
};
const codes = (r: AirportListResponse) => r.airports.map((a) => a.airport);

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'domino-airports-'));
  await writeStandInTables(dir);
  clearAll();
  api = await createDevHandler({ DATA_MODE: 'local', LOCAL_DATA_DIR: dir });
});

afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('airports/list', () => {
  it('lists airports with whole-period weighted figures, busiest first', async () => {
    const all = await json<AirportListResponse>('list?min_departures=0');
    expect(codes(all)).toEqual(['DFW', 'CLT', 'ORD', 'TPA']);
    const dfw = all.airports[0];
    expect(dfw).toMatchObject({ city: 'Dallas/Fort Worth, TX', departures: 1000, turnarounds: 800, median_ground_min: 67, is_top10: true, departure_rank: 1 });
    expect(dfw.dep_late15_rate).toBeCloseTo(0.24);
    expect(dfw.arr_late15_rate).toBeCloseTo(0.26);
    expect(dfw.avg_arr_delay_min).toBeCloseTo(16);
    expect(dfw.short_turn_share).toBeCloseTo(0.1375);
    expect(dfw.avg_inbound_delay_min).toBeCloseTo(7.5);
    expect(dfw.pass_through).toBeCloseTo(0.4);          // only the month that had enough late inbound flights counts
    expect(dfw.propagated_delay_min).toBe(4000);
    expect(all.airports.find((a) => a.airport === 'ORD')?.pass_through).toBeNull();
  });

  it('filters by size, search and ten busiest, and sorts', async () => {
    expect(codes(await json<AirportListResponse>('list'))).toEqual(['DFW']);    // default: 1,000+ departures only
    expect(codes(await json<AirportListResponse>('list?min_departures=600'))).toEqual(['DFW', 'CLT']);
    expect(codes(await json<AirportListResponse>('list?min_departures=0&search=charl'))).toEqual(['CLT']);
    expect(codes(await json<AirportListResponse>('list?min_departures=0&search=tpa'))).toEqual(['TPA']);
    expect(codes(await json<AirportListResponse>('list?min_departures=0&top10=true'))).toEqual(['DFW', 'CLT', 'ORD']);
    expect(codes(await json<AirportListResponse>('list?min_departures=0&sort=dep_late15_rate'))).toEqual(['TPA', 'CLT', 'DFW', 'ORD']);
    expect(codes(await json<AirportListResponse>('list?min_departures=0&sort=median_ground_min'))).toEqual(['TPA', 'ORD', 'DFW', 'CLT']);
  });
});

describe('airports/{code}', () => {
  it('profiles an airport with ranks and network averages', async () => {
    const p = await json<AirportProfile>('dfw/profile');
    expect(p.airport.airport).toBe('DFW');
    expect(p.ranks).toEqual({ departures: 1, late_rate: 1, airports: 4, late_rate_airports: 1 });
    expect(p.network).toMatchObject({ departures: 2250, median_ground_min: 61, airports: 4, avg_departures_per_airport: 562.5 });
    expect((await json<AirportProfile>('CLT/profile')).ranks.late_rate).toBeNull();      // under 1,000 departures: not ranked
  });

  it('returns monthly rows, hourly rows with the network line and a peak caption, and the buffer plan', async () => {
    const months = await json<AirportMonth[]>('DFW/monthly');
    expect(months.map((m) => m.year_month)).toEqual(['2025-01', '2026-01']);
    const hourly = await json<AirportHourly>('DFW/hourly');
    expect(hourly.hours.map((h) => h.dep_hour)).toEqual([7, 18, 22]);
    expect(hourly.hours[1].network_dep_late15_rate).toBeCloseTo(0.35);
    expect(hourly.caption).toBe('Late rate peaks at 18:00 (40%).');
    const buffer = await json<AirportBuffer>('DFW/buffer?budget=5');
    expect(buffer.months).toHaveLength(2);
    expect(buffer.totals).toMatchObject({ turnarounds: 900, turnarounds_with_buffer: 150, buffer_min: 3750, expected_absorbed_min: 400, realised_absorbed_min: 430, late_departures_avoided: 5 });
    expect(buffer.totals.share_with_buffer).toBeCloseTo(150 / 900);
    expect((await json<AirportBuffer>('DFW/buffer?budget=2')).totals.buffer_min).toBe(1000);
  });

  it('answers 400 for a malformed code and 404 for an unknown airport', async () => {
    expect((await get('DFWX/profile')).status).toBe(400);
    expect((await get('ZZZ/profile')).status).toBe(404);
    expect((await get('DFW/buffer?budget=3')).status).toBe(400);
  });
});

describe('airports/network-scatter', () => {
  it('plots airports with enough turnarounds and states the correlation it shows', async () => {
    const s = await json<NetworkScatter>('network-scatter?min_turnarounds=100');
    expect(s.airports.map((a) => a.airport)).toEqual(['DFW', 'CLT', 'ORD']);
    const r = pearson([67, 66, 75], [7.5, 12, 3]);
    expect(s.correlation).toBeCloseTo(r!);
    expect(s.caption).toMatch(/^Airports with more inbound delay tend to have shorter ground times \(correlation −0\.\d\d across the 3 airports with 100\+ turnarounds\)/);
  });
});
