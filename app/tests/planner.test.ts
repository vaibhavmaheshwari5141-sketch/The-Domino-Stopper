// Buffer Planner endpoints on the stand-in tables in tests/fixtures.ts (one day, six turnarounds, budgets 2 and 5).
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PlannerDay, PlannerDetail, PlannerSummary, PlannerTurnaroundsResponse } from '../shared/api-types.ts';
import { passThroughAt } from '../shared/planner.ts';
import type { ApiHandler } from '../server/app.ts';
import { clearAll } from '../server/cache.ts';
import { createDevHandler } from '../server/dev.ts';
import { writeStandInTables } from './fixtures.ts';

let dir: string;
let api: ApiHandler;
const get = (path: string) => api(new Request(`http://localhost/api/planner/${path}`));
const json = async <T>(path: string): Promise<T> => {
  const res = await get(path);
  expect(res.status, `${path}: ${res.status}`).toBe(200);
  return res.json() as Promise<T>;
};
const ids = (r: PlannerTurnaroundsResponse) => r.rows.map((row) => row.tail_number);
const DAY = 'date=2026-03-15&budget=5';

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'domino-planner-'));
  await writeStandInTables(dir);
  clearAll();
  api = await createDevHandler({ DATA_MODE: 'local', LOCAL_DATA_DIR: dir });
});

afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('planner/dates and planner/airports', () => {
  it('lists the days of a budget with their disruption flag', async () => {
    const days = await json<PlannerDay[]>('dates?budget=5');
    expect(days.map((d) => [d.flight_date, d.is_disruption_day, d.buffer_used_min <= d.budget_min])).toEqual([
      ['2026-03-15', true, true], ['2026-03-16', false, true],
    ]);
  });

  it('lists the airports of a day, busiest first', async () => {
    expect(await json('airports?date=2026-03-15')).toEqual([{ airport: 'DFW', turnarounds: 4 }, { airport: 'CLT', turnarounds: 2 }]);
  });
});

describe('planner/summary', () => {
  it('reads the network totals from the daily plan and counts reasons and risk bands', async () => {
    const s = await json<PlannerSummary>(`summary?${DAY}`);
    expect(s).toMatchObject({
      airport: null, turnarounds: 6, turnarounds_with_buffer: 3, buffer_used_min: 30, budget_min: 30, expected_absorbed_min: 9.5,
      realised_absorbed_min: 16, late_departures_avoided: 2, is_disruption_day: true, absorption_threshold_min: 60.4,
    });
    expect(s.breakdown.total).toBe(6);
    expect(s.breakdown.reasons[0]).toEqual({ reason_code: 'Added: likely late arrival and ground time already absorbs delay', turnarounds: 2 });
    expect(s.breakdown.risk_bands).toEqual([
      { risk_band: 'High', turnarounds: 2, with_buffer: 2 },
      { risk_band: 'Medium', turnarounds: 3, with_buffer: 1 },
      { risk_band: 'Low', turnarounds: 1, with_buffer: 0 },
    ]);
  });

  it('aggregates the recommendations for one airport', async () => {
    const s = await json<PlannerSummary>(`summary?${DAY}&airport=clt`);
    expect(s).toMatchObject({
      airport: 'CLT', turnarounds: 2, turnarounds_with_buffer: 1, buffer_used_min: 5, budget_min: 10, expected_absorbed_min: 1.5,
      realised_absorbed_min: 3, late_departures_avoided: 1, is_disruption_day: true,
    });
  });

  it('answers 404 for a day without a plan', async () => {
    expect((await get('summary?date=2025-01-01&budget=5')).status).toBe(404);
  });
});

describe('planner/turnarounds', () => {
  it('sorts by day rank (unranked last, riskiest first) and pages on the server', async () => {
    const all = await json<PlannerTurnaroundsResponse>(`turnarounds?${DAY}`);
    expect(all.total).toBe(6);
    expect(ids(all)).toEqual(['N100AA', 'N200AA', 'N600AA', 'N300AA', 'N500AA', 'N400AA']);
    expect(all.rows[0]).toMatchObject({
      inbound_flight_no: 1446, inbound_from: 'TUL', airport: 'DFW', outbound_flight_no: 1207, outbound_to: 'TUS',
      sched_outbound_dep_utc: '2026-03-16T00:22:00', recommended_extra_min: 15, new_ground_min: 136, very_short_turn_flag: false,
      late_avoided_flag: true, actual_inbound_delay_min: 40,
    });
    const page = await json<PlannerTurnaroundsResponse>(`turnarounds?${DAY}&limit=2&offset=2`);
    expect([page.total, ...ids(page)]).toEqual([6, 'N600AA', 'N300AA']);
    const byRisk = await json<PlannerTurnaroundsResponse>(`turnarounds?${DAY}&sort=p_late15&order=desc&limit=2`);
    expect(ids(byRisk)).toEqual(['N600AA', 'N100AA']);
  });

  it('applies every filter, and the breakdown follows the filters', async () => {
    expect((await json<PlannerTurnaroundsResponse>(`turnarounds?${DAY}&show=buffered`)).total).toBe(3);
    expect((await json<PlannerTurnaroundsResponse>(`turnarounds?${DAY}&show=not_buffered`)).total).toBe(3);
    expect(ids(await json<PlannerTurnaroundsResponse>(`turnarounds?${DAY}&risk_band=High`))).toEqual(['N100AA', 'N600AA']);
    expect((await json<PlannerTurnaroundsResponse>(`turnarounds?${DAY}&very_short=exclude`)).total).toBe(5);
    expect(ids(await json<PlannerTurnaroundsResponse>(`turnarounds?${DAY}&airport=CLT`))).toEqual(['N600AA', 'N500AA']);
    const buffered = await json<PlannerTurnaroundsResponse>(`turnarounds?${DAY}&show=buffered`);
    expect(buffered.breakdown.reasons.every((r) => r.reason_code.startsWith('Added'))).toBe(true);
  });

  it('searches tail numbers and flight numbers on either leg', async () => {
    expect(ids(await json<PlannerTurnaroundsResponse>(`turnarounds?${DAY}&search=n10`))).toEqual(['N100AA']);
    expect(ids(await json<PlannerTurnaroundsResponse>(`turnarounds?${DAY}&search=AA2516`))).toEqual(['N500AA']);
    expect(ids(await json<PlannerTurnaroundsResponse>(`turnarounds?${DAY}&search=1446`))).toEqual(['N100AA']);
    expect((await json<PlannerTurnaroundsResponse>(`turnarounds?${DAY}&search=${encodeURIComponent("%' OR 1=1 --")}`)).total).toBe(0);
  });

  it('refuses parameters outside the allowed lists', async () => {
    for (const bad of ['budget=7', 'date=2026-02-30', 'date=2026-13-01', 'date=', 'sort=turn_id', 'order=up', 'airport=DF', 'limit=1000', 'offset=-1',
      'show=some', 'risk_band=Extreme', 'very_short=maybe']) {
      const qs = new URLSearchParams(DAY);
      const [key, value] = bad.split('=');
      qs.set(key, value);
      expect((await get(`turnarounds?${qs}`)).status, bad).toBe(400);
    }
  });
});

describe('planner/turnaround/{turn_id}', () => {
  it('returns the turnaround, its recommendation at every budget, the curve and three reasons', async () => {
    const d = await json<PlannerDetail>('turnaround/20260315-1446-TUL-DFW?budget=5');
    expect(d.turnaround).toMatchObject({ tail_number: 'N100AA', budget_scenario: 5, recommended_extra_min: 15, new_ground_min: 136, risk_band: 'High' });
    expect(d.budgets.map((b) => [b.budget_scenario, b.recommended_extra_min])).toEqual([[2, 10], [5, 15]]);
    expect(d.curve).toHaveLength(5);
    expect(passThroughAt(d.curve, 121)).toBeCloseTo(0.716);
    expect(d.day_risk_share).toBeCloseTo(2 / 6);
    expect(d.why).toEqual([
      'Late chance 40% (riskiest 33% of the day).',
      'Predicted inbound delay 15.6 min.',
      'At 121 min of ground time the curve passes on 72% of delay; at 136 min it passes on 66%.',
    ]);
    expect(d.reason_sentence).toMatch(/^Buffer added/);
  });

  it('explains a turnaround that lost out on value', async () => {
    const d = await json<PlannerDetail>('turnaround/20260315-2718-PIT-CLT');
    expect(d.why[2]).toMatch(/^Each buffer minute here would absorb 0\.01 min/);
  });

  it('answers 400 for a malformed id and 404 for an unknown one', async () => {
    expect((await get('turnaround/not-an-id')).status).toBe(400);
    expect((await get('turnaround/20260315-9999-XXX-YYY')).status).toBe(404);
  });
});

describe('planner/export', () => {
  it('downloads the filtered rows as CSV', async () => {
    const res = await get(`export?${DAY}&airport=CLT`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/csv');
    expect(res.headers.get('content-disposition')).toBe('attachment; filename="buffer-plan_2026-03-15_budget-5_CLT.csv"');
    const lines = (await res.text()).trim().split('\r\n');
    expect(lines).toHaveLength(3);
    expect(lines[0].split(',').slice(0, 5)).toEqual(['flight_date', 'airport', 'turn_id', 'tail_number', 'inbound_flight']);
    expect(lines[1]).toContain('AA600');
  });
});
