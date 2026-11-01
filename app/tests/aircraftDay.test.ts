// Aircraft Day endpoints on the stand-in tables (tests/fixtures.ts). On 2026-03-16 N700AA flies PIT-CLT-TPA-CLT and
// then shows up at MIA (a break in the chain); N800AA has a single stop at CLT.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AircraftDay, AircraftListResponse } from '../shared/api-types.ts';
import type { ApiHandler } from '../server/app.ts';
import { clearAll } from '../server/cache.ts';
import { createDevHandler } from '../server/dev.ts';
import { writeStandInTables } from './fixtures.ts';

let dir: string;
let api: ApiHandler;
const get = (path: string) => api(new Request(`http://localhost/api/aircraft-day${path}`));
const json = async <T>(path: string): Promise<T> => {
  const res = await get(path);
  expect(res.status, `${path}: ${res.status}`).toBe(200);
  return res.json() as Promise<T>;
};

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'domino-aircraft-'));
  await writeStandInTables(dir);
  clearAll();
  api = await createDevHandler({ DATA_MODE: 'local', LOCAL_DATA_DIR: dir });
});

afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('aircraft-day/aircraft', () => {
  it('lists the day\'s aircraft, most buffer first, with their risk dots and route ends', async () => {
    const list = await json<AircraftListResponse>('/aircraft?date=2026-03-16&budget=5');
    expect(list.total).toBe(2);
    expect(list.aircraft[0]).toEqual({
      tail_number: 'N700AA', turnarounds: 3, flights: 5, risk_bands: ['Low', 'High', 'Medium'], highest_risk: 'High',
      buffer_min: 15, buffered_turnarounds: 2, first_airport: 'PIT', last_airport: 'BOS', any_late_departure: true,
    });
    expect(list.aircraft[1]).toMatchObject({ tail_number: 'N800AA', turnarounds: 1, flights: 2, buffer_min: 0, any_late_departure: false });
  });

  it('filters by airport, searches tails and limits the list', async () => {
    expect((await json<AircraftListResponse>('/aircraft?date=2026-03-16&airport=MIA')).aircraft.map((a) => a.tail_number)).toEqual(['N700AA']);
    expect((await json<AircraftListResponse>('/aircraft?date=2026-03-16&search=n8')).aircraft.map((a) => a.tail_number)).toEqual(['N800AA']);
    const limited = await json<AircraftListResponse>('/aircraft?date=2026-03-16&limit=1');
    expect([limited.total, limited.aircraft.length]).toEqual([2, 1]);
    const pinned = await json<AircraftListResponse>('/aircraft?date=2026-03-16&limit=1&selected=N800AA');
    expect(pinned.aircraft.map((a) => a.tail_number)).toEqual(['N700AA', 'N800AA']);
    expect((await json<AircraftListResponse>('/aircraft?date=2026-03-15')).total).toBe(6);
  });

  it('refuses bad parameters', async () => {
    for (const qs of ['', 'date=2026-13-01', 'date=2026-03-16&budget=3', 'date=2026-03-16&airport=CHARLOTTE', 'date=2026-03-16&limit=0']) {
      expect((await get(`/aircraft?${qs}`)).status, qs).toBe(400);
    }
  });
});

describe('aircraft-day', () => {
  it('builds the chain in time order and marks a break instead of inventing a flight', async () => {
    const day = await json<AircraftDay>('?tail=n700aa&date=2026-03-16&budget=5');
    expect(day.turnarounds.map((x) => x.airport)).toEqual(['CLT', 'TPA', 'MIA']);
    expect(day.flights.map((f) => `${f.flight_no} ${f.from}-${f.to}`)).toEqual(['100 PIT-CLT', '200 CLT-TPA', '201 TPA-CLT', '300 ORD-MIA', '301 MIA-BOS']);
    expect(day.chain.map((c) => (c.type === 'break' ? `break ${c.arrived_at}/${c.next_airport}` : `${c.type[0]}${c.index}`))).toEqual(
      ['f0', 't0', 'f1', 't1', 'f2', 'break CLT/MIA', 'f3', 't2', 'f4'],
    );
    expect(day.breaks).toBe(1);
    // Delays come from the stops: departure from the stop it leaves, arrival from the stop it lands at; unknown stays null
    expect(day.flights[1]).toMatchObject({ dep_delay_min: -13, arr_delay_min: 30, sched_dep_utc: '2026-03-16T13:00:00', departs_turn: 0, arrives_turn: 1 });
    expect(day.flights[0]).toMatchObject({ sched_dep_utc: null, dep_delay_min: null, arr_delay_min: -10 });
    expect(day.flights[2]).toMatchObject({ sched_arr_utc: null, arr_delay_min: null, arrives_turn: null });
    expect(day.totals).toEqual({ turnarounds: 3, buffered_turnarounds: 2, buffer_min: 15, expected_absorbed_min: 4.5, realised_absorbed_min: 7, late_departures_avoided: 1 });
    expect(day.plan_sentence).toBe('The engine adds 15 minutes in total: 10 minutes at TPA before AA201 and 5 minutes at MIA before AA301. '
      + 'These are the stops where extra ground time prevents the most delay across the day.');
    expect(day.turnarounds[1]).toMatchObject({ chain_multiplier: 2.5, protects_later_flights: true });
  });

  it('adds the reallocation plan: the stop that gives, the stop that receives, and nothing added', async () => {
    const day = await json<AircraftDay>('?tail=N700AA&date=2026-03-16&budget=10');     // the plan is always the main budget's
    expect(day.turnarounds.map((x) => x.realloc_change_min)).toEqual([null, 10, -10]);
    expect(day.turnarounds[1]).toMatchObject({ realloc_expected_change_min: 3, realloc_realised_min: 2 });
    expect(day.reallocation).toEqual({
      budget: 5, minutes_moved: 10, receiving: 1, giving: 1, expected_change_min: 2.5,
      sentence: 'Reallocation moves 10 minutes from the long sit at MIA to the risky stop at TPA, adding nothing to the day (expected change in delay prevented: +2.5 min).',
    });
  });

  it('explains an aircraft without buffer', async () => {
    const day = await json<AircraftDay>('?tail=N800AA&date=2026-03-16&budget=5');
    expect(day.plan_sentence).toBe('The engine adds no buffer to N800AA today: the same minutes prevent more delay on other aircraft.');
    expect(day.reallocation.minutes_moved).toBe(0);
    expect(day.reallocation.sentence).toMatch(/^Reallocation leaves N800AA as planned today/);
  });

  it('answers 404 with a friendly message for an aircraft that did not fly that day, and 400 for a bad tail', async () => {
    const res = await get('?tail=N999ZZ&date=2026-03-16&budget=5');
    expect(res.status).toBe(404);
    expect((await res.json()).detail).toMatch(/^N999ZZ has no turnarounds on Mon 16 Mar 2026/);
    expect((await get('?tail=N7-00&date=2026-03-16')).status).toBe(400);
    expect((await get('?date=2026-03-16')).status).toBe(400);
  });
});
