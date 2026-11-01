// Input Data endpoints in local mode: stand-in gold tables (tests/fixtures.ts) plus input samples written as CSV and
// parquet to a temporary input folder, and one 600,000-row gold table to check paging and profile sampling.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DuckDBInstance } from '@duckdb/node-api';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DatasetPreview, DatasetProfile, DatasetSchema, DatasetsResponse } from '../shared/api-types.ts';
import type { ApiHandler } from '../server/app.ts';
import { clearAll } from '../server/cache.ts';
import { createDevHandler } from '../server/dev.ts';
import { columnKind } from '../server/routes/datasets.ts';
import { writeStandInTables } from './fixtures.ts';

let dataDir: string;
let inputDir: string;
let api: ApiHandler;
const get = (path: string) => api(new Request(`http://localhost/api/${path}`));
const json = async <T>(path: string): Promise<T> => {
  const res = await get(path);
  expect(res.status, `${path}: ${res.status}`).toBe(200);
  return res.json() as Promise<T>;
};

async function copy(select: string, path: string, format: 'csv' | 'parquet') {
  const conn = await (await DuckDBInstance.create(':memory:')).connect();
  await conn.run(`COPY (${select}) TO '${path.replaceAll('\\', '/')}' (FORMAT ${format}${format === 'csv' ? ', HEADER' : ''})`);
  conn.closeSync();
}

beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'domino-datasets-'));
  inputDir = mkdtempSync(join(tmpdir(), 'domino-samples-'));
  await writeStandInTables(dataDir);
  // 600,000 rows: over the 500,000-row profile limit
  await copy(`SELECT i AS leg_id, CASE WHEN i % 10 = 0 THEN NULL ELSE i % 7 END AS leg, 'band ' || (i % 3)::VARCHAR AS band
              FROM range(600000) r(i)`, join(dataDir, 'gold_delay_by_leg.parquet'), 'parquet');

  // Rotations: 30 flights of two aircraft; every fifth departure delay missing
  await copy(`SELECT CASE WHEN i < 20 THEN 'N101AA' ELSE 'N202AA' END AS tail_number, DATE '2026-03-01' + i::INTEGER AS flight_date,
                     i AS leg, CASE WHEN i % 2 = 0 THEN 'DFW' ELSE 'Charlotte CLT' END AS origin,
                     CASE WHEN i % 5 = 0 THEN NULL ELSE i * 1.5 END AS dep_delay
              FROM range(30) r(i)`, join(inputDir, 'rotations_sample.csv'), 'csv');
  await copy(`SELECT * FROM (VALUES ('DFW', 'morning', 35.0), ('CLT', 'evening', 40.5)) v(station, tod_band, mtt_min)`,
    join(inputDir, 'mtt_estimates_sample.parquet'), 'parquet');
  writeFileSync(join(inputDir, 'odd_one.csv'), 'my column,n\n"=cmd()",1\n"a, ""quoted"" value",2\n');
  writeFileSync(join(inputDir, 'bad-name_sample.csv'), 'x\n1\n');      // not a valid table name: skipped
  writeFileSync(join(inputDir, 'notes.txt'), 'ignored');

  clearAll();
  api = await createDevHandler({ DATA_MODE: 'local', LOCAL_DATA_DIR: dataDir, LOCAL_INPUT_DIR: inputDir });
});

afterAll(() => {
  rmSync(dataDir, { recursive: true, force: true });
  rmSync(inputDir, { recursive: true, force: true });
});

describe('GET /api/datasets', () => {
  it('lists the discovered input samples and the gold tables from the latest catalog run', async () => {
    const { groups } = await json<DatasetsResponse>('datasets');
    expect(groups.map((g) => [g.id, g.title])).toEqual([['input', 'Input tables (samples)'], ['gold', 'Output tables (gold)']]);

    const input = groups[0].items;
    expect(input.map((i) => i.name)).toEqual(['sample_mtt_estimates', 'sample_odd_one', 'sample_rotations']);
    expect(input[2]).toEqual({
      name: 'sample_rotations', display_name: 'rotations', group: 'input', description: "Each aircraft's sequence of flights per day.",
      rows: 30, columns: 5, grain: null, dashboard_page: null,
    });
    expect(input[1].description).toBe('Sample of an input table used by the project.');

    const gold = groups[1].items;
    // gold_unknown is not on the allow-list and gold_old belongs to an older run; the catalog lists itself
    expect(gold.map((g) => g.name)).toEqual(['gold_buffer_recommendation', 'gold_dim_airport', 'gold_engine_kpis', 'gold_kpi_headline', 'gold_table_catalog']);
    expect(gold[0]).toMatchObject({ rows: 1701088, columns: 17, grain: 'turnaround x budget', dashboard_page: '6a Recommendations' });
    expect(gold[4]).toMatchObject({ display_name: 'table_catalog', description: 'Describes every other gold table.', rows: 6, columns: 8 });
    expect(gold[2]).toMatchObject({ rows: 132, grain: 'strategy x budget x mode x evaluator x day type' });
  });
});

describe('GET /api/datasets/{name}/...', () => {
  it('describes columns with their types', async () => {
    const schema = await json<DatasetSchema>('datasets/sample_rotations/schema');
    expect(schema.columns.map((c) => [c.name, c.kind])).toEqual([
      ['tail_number', 'text'], ['flight_date', 'date'], ['leg', 'number'], ['origin', 'text'], ['dep_delay', 'number'],
    ]);
  });

  it('answers 404 for anything not on the allow-list', async () => {
    for (const name of ['users', 'gold_unknown', 'sample_nope', 'sample_bad-name', "x';DROP TABLE y;--", '%2e%2e']) {
      for (const part of ['schema', 'preview', 'profile', 'download']) {
        expect((await get(`datasets/${encodeURIComponent(name)}/${part}`)).status, `${name}/${part}`).toBe(404);
      }
    }
  });

  it('pages, sorts and searches on the server', async () => {
    const first = await json<DatasetPreview>('datasets/sample_rotations/preview?limit=10&offset=0&sort=leg');
    expect(first.total).toBe(30);
    expect(first.rows).toHaveLength(10);
    expect(first.rows[0]).toEqual(['N101AA', '2026-03-01', 0, 'DFW', null]);
    const last = await json<DatasetPreview>('datasets/sample_rotations/preview?limit=10&offset=25&sort=leg&order=desc');
    expect(last.rows.map((r) => r[2])).toEqual([4, 3, 2, 1, 0]);
    // Nulls last in either direction
    const byDelay = await json<DatasetPreview>('datasets/sample_rotations/preview?limit=30&sort=dep_delay&order=desc');
    expect(byDelay.rows.slice(-6).every((r) => r[4] === null)).toBe(true);

    const found = await json<DatasetPreview>('datasets/sample_rotations/preview?search=charlotte%20clt&limit=100');
    expect(found.total).toBe(15);
    expect(found.rows.every((r) => r[3] === 'Charlotte CLT')).toBe(true);
    expect((await json<DatasetPreview>("datasets/sample_rotations/preview?search=x'%20OR%20'1'%3D'1")).total).toBe(0);
    expect((await json<DatasetPreview>('datasets/sample_mtt_estimates/preview?search=EVEN')).rows).toEqual([['CLT', 'evening', 40.5]]);
  });

  it('pages a 600,000-row table without reading it all, and handles column names with spaces', async () => {
    const page = await json<DatasetPreview>('datasets/gold_delay_by_leg/preview?limit=50&offset=599990&sort=leg_id');
    expect(page.total).toBe(600000);
    expect(page.rows.map((r) => r[0])).toEqual([599990, 599991, 599992, 599993, 599994, 599995, 599996, 599997, 599998, 599999]);
    const odd = await json<DatasetPreview>('datasets/sample_odd_one/preview?sort=my%20column&order=desc');
    expect(odd.columns.map((c) => c.name)).toEqual(['my column', 'n']);
  });

  it('rejects bad paging and sorting', async () => {
    for (const q of ['limit=501', 'limit=0', 'offset=-1', 'order=up', 'sort=nope', 'sort=leg%3B%20DROP%20TABLE%20x']) {
      expect((await get(`datasets/sample_rotations/preview?${q}`)).status, q).toBe(400);
    }
  });

  it('downloads up to 5,000 rows as CSV', async () => {
    const res = await get('datasets/sample_odd_one/download');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/csv');
    expect(res.headers.get('content-disposition')).toBe('attachment; filename="sample_odd_one_preview.csv"');
    expect(await res.text()).toBe('my column,n\r\n\'=cmd(),1\r\n"a, ""quoted"" value",2\r\n');
    const big = await get('datasets/gold_delay_by_leg/download');
    expect((await big.text()).trim().split('\r\n')).toHaveLength(5001);
    expect((await get('datasets/gold_delay_by_leg/download?limit=5001')).status).toBe(400);
  });

  it('profiles small tables in full', async () => {
    const p = await json<DatasetProfile>('datasets/sample_rotations/profile');
    expect(p).toMatchObject({ rows: 30, profiled_rows: 30, sampled: false, note: null });
    const [tail, date, leg, origin, delay] = p.columns;
    expect(tail).toMatchObject({ nulls: 0, distinct: 2, top: [{ value: 'N101AA', count: 20 }, { value: 'N202AA', count: 10 }] });
    expect(date).toMatchObject({ kind: 'date', min: '2026-03-01', max: '2026-03-30', nulls: 0 });
    expect(leg).toMatchObject({ min: 0, max: 29 });
    expect(origin.top).toHaveLength(2);
    expect(delay).toMatchObject({ nulls: 6, null_share: 0.2, min: 1.5, max: 43.5 });
    // Every value different: no top values
    const mtt = await json<DatasetProfile>('datasets/sample_mtt_estimates/profile');
    expect(mtt.columns[0]).toMatchObject({ distinct: 2, top: [] });
  });

  it('profiles big tables on a sample of about 100,000 rows, and says so', async () => {
    const p = await json<DatasetProfile>('datasets/gold_delay_by_leg/profile');
    expect(p.rows).toBe(600000);
    expect(p.sampled).toBe(true);
    expect(p.profiled_rows).toBeGreaterThan(90_000);
    expect(p.profiled_rows).toBeLessThan(110_000);
    expect(p.note).toMatch(/^Based on a sample of [\d,]+ of 600,000 rows/);
    const [, leg, band] = p.columns;
    expect(leg.null_share).toBeGreaterThan(0.08);
    expect(leg.null_share).toBeLessThan(0.12);
    expect(band.distinct).toBe(3);
    expect(band.top!.reduce((s, t) => s + t.count, 0)).toBe(p.profiled_rows);       // counts and top values: one sample
  });
});

it('maps Databricks and DuckDB types to one kind', () => {
  expect(['bigint', 'DECIMAL(10,2)', 'double', 'SMALLINT', 'tinyint'].map(columnKind)).toEqual(Array(5).fill('number'));
  expect(['date', 'timestamp', 'TIMESTAMP WITH TIME ZONE', 'boolean', 'string', 'VARCHAR', 'interval', 'array<string>'].map(columnKind))
    .toEqual(['date', 'timestamp', 'timestamp', 'boolean', 'text', 'text', 'other', 'other']);
});

it('finds sample files added after start-up while none were found', async () => {
  const emptyDir = mkdtempSync(join(tmpdir(), 'domino-nosamples-'));
  try {
    clearAll();
    api = await createDevHandler({ DATA_MODE: 'local', LOCAL_DATA_DIR: dataDir, LOCAL_INPUT_DIR: emptyDir });
    expect((await json<DatasetsResponse>('datasets')).groups[0].items).toEqual([]);
    writeFileSync(join(emptyDir, 'rotation_breaks_sample.csv'), 'tail_number,reason\nN1,gap\n');
    expect((await json<DatasetsResponse>('datasets')).groups[0].items.map((i) => [i.name, i.rows])).toEqual([['sample_rotation_breaks', 1]]);
  } finally {
    rmSync(emptyDir, { recursive: true, force: true });
  }
});
