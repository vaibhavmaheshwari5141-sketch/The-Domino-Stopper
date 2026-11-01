// The local source and the API handler on stand-in parquet files (tests/fixtures.ts) written to a temporary
// folder. Runs without the real data.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { OverviewResponse } from '../shared/api-types.ts';
import type { ApiHandler } from '../server/app.ts';
import { clearAll } from '../server/cache.ts';
import { query, t } from '../server/db.ts';
import { createDevHandler } from '../server/dev.ts';
import { writeStandInTables } from './fixtures.ts';

let dir: string;
let api: ApiHandler;
const get = async (path: string, headers: Record<string, string> = {}) => api(new Request(`http://localhost${path}`, { headers }));

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'domino-'));
  await writeStandInTables(dir);
  clearAll();
  api = await createDevHandler({ DATA_MODE: 'local', LOCAL_DATA_DIR: dir });
});

afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('local source', () => {
  it('binds parameters and turns NaN into null', async () => {
    const rows = await query(`SELECT airport, turns, share FROM ${t('gold_dim_airport')} WHERE turns >= :min ORDER BY turns DESC`, { min: 600 });
    expect(rows).toEqual([{ airport: 'DFW', turns: 900, share: 0.5 }, { airport: 'CLT', turns: 700, share: null }]);
  });

  it('treats SQL-looking input as a value', async () => {
    expect(await query(`SELECT * FROM ${t('gold_dim_airport')} WHERE airport = :a`, { a: "x' OR '1'='1" })).toEqual([]);
  });
});

describe('API on stand-in data', () => {
  it('GET /api/health', async () => {
    const res = await get('/api/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok', data_mode: 'local', database_ok: true });
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('GET /api/meta returns the latest run and its catalog rows', async () => {
    const res = await get('/api/meta');
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.run).toMatchObject({ run_id: 'run-1', run_timestamp_utc: '2026-10-25T10:01:00', main_budget: 5, checks_total: 40 });
    expect(body.tables.map((r: { table_name: string }) => r.table_name))
      .toEqual(['gold_buffer_recommendation', 'gold_dim_airport', 'gold_engine_kpis', 'gold_kpi_headline', 'gold_unknown']);
    expect(body.tables[1].rows).toBeNull();
    expect(res.headers.get('netlify-cdn-cache-control')).toContain('max-age=600');
  });

  it('also answers on the Netlify function path, and rejects unknown routes and methods', async () => {
    expect((await get('/.netlify/functions/api/health')).status).toBe(200);
    expect((await get('/api/nope')).status).toBe(404);
    expect((await get('/api/toString')).status).toBe(404);
    expect((await api(new Request('http://localhost/api/meta', { method: 'POST' }))).status).toBe(405);
  });

  it('sends CORS headers only to allowed origins', async () => {
    expect((await get('/api/health', { Origin: 'http://localhost:5173' })).headers.get('access-control-allow-origin')).toBe('http://localhost:5173');
    expect((await get('/api/health', { Origin: 'http://evil.example' })).headers.get('access-control-allow-origin')).toBeNull();
  });
});

describe('GET /api/overview on stand-in data', () => {
  it('returns KPIs, both views of the engine KPIs, guardrails, weighted monthly figures and text built from the KPIs', async () => {
    const res = await get('/api/overview?budget=5');
    expect(res.status).toBe(200);
    const body: OverviewResponse = await res.json();

    expect(Object.keys(body).sort()).toEqual(['context', 'engine_kpis', 'guardrails', 'insights', 'kpis', 'monthly', 'summary']);
    expect(body.kpis.late_warning_auc?.value).toBe(0.7);
    expect(body.kpis.engine_prevented_per_100_resp?.value).toBe(50);
    // One row per strategy and view, all days only: 4 strategies x 2 views
    expect(body.engine_kpis).toHaveLength(8);
    expect(body.engine_kpis.every((r) => r.day_type === 'all days' && r.budget_scenario === 5)).toBe(true);
    expect(body.engine_kpis.filter((r) => r.strategy === 'Engine (our method)').map((r) => [r.evaluator, r.prevented_per_100]))
      .toEqual([['curve', 12], ['response model', 48]]);
    expect(body.guardrails.map((g) => g.kpi_name).sort()).toEqual(['budget_respected', 'guardrail_eligible_share']);
    expect(body.monthly).toEqual([
      { year_month: '2026-01', late_arrival_rate: 0.35, avg_arrival_delay_min: 17.5, operated_flights: 400, disruption_days: 1 },
      { year_month: '2026-02', late_arrival_rate: 0.1, avg_arrival_delay_min: 5, operated_flights: 200, disruption_days: 0 },
    ]);
    expect(body.summary).toBe('Across 1M flights, 25.0% arrived 15+ minutes late. With 5 extra minutes of buffer per turnaround, the engine '
      + "prevents 12.0–50.0 minutes of delay per 100 buffer minutes across each aircraft's day (curve view to model view). "
      + 'Moving minutes from long sits to risky stops is worth $2M–$12.6M with no buffer added.');
    expect(body.insights.map((i) => i.id)).toEqual(['threshold', 'placement', 'realloc', 'break_even', 'risk']);
    expect(body.insights[0].title).toBe('The 60-minute rule');
    expect(body.insights[1].body).toBe('Model view 50.0 per 100 min (v1 23.0); worst case across both views 85% of the best strategy (v1 39%).');
    expect(body.insights[3].metric).toBe('$11.10–$51.40');
    expect(body.insights[4]).toMatchObject({ metric: 'AUC 0.700', metric_label: 'v1 0.690' });
    expect(body.context).toEqual({ budget: 5, kpi_budget: 5, test_period: '2026-01-01 to 2026-08-31', run_id: 'run-1' });
  });

  it('returns no engine rows for a budget the engine did not plan, and null for a missing KPI', async () => {
    const body: OverviewResponse = await (await get('/api/overview?budget=7')).json();
    expect(body.engine_kpis).toEqual([]);
    expect(body.kpis.engine_v1_prevented_per_100).not.toBeNull();
  });

  it('defaults to budget 5 and rejects invalid budgets', async () => {
    expect(((await (await get('/api/overview')).json()) as OverviewResponse).context.budget).toBe(5);
    for (const bad of ['abc', '-1', '2.5', '999']) expect((await get(`/api/overview?budget=${bad}`)).status).toBe(400);
  });
});
