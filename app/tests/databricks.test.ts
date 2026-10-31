// The Databricks source against a mocked Statement Execution API (no network, no credentials needed).
import { describe, expect, it, vi } from 'vitest';
import type { DatabricksConfig } from '../server/config.ts';
import { DataAccessError, query, setDataSource } from '../server/db.ts';
import { createDatabricksSource } from '../server/sources/databricks.ts';

const cfg: DatabricksConfig = {
  host: 'dbc-test.cloud.databricks.com', warehouseId: 'wh1', token: 'dapi-secret',
  catalog: 'workspace', schema: 'bufferengine', timeoutSeconds: 10,
};

const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
const columns = [{ name: 'airport', type_name: 'STRING' }, { name: 'turns', type_name: 'LONG' }, { name: 'share', type_name: 'DOUBLE' }];

describe('Databricks source', () => {
  it('sends a parameterised statement and follows polling and result chunks', async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(ok({ statement_id: 's1', status: { state: 'PENDING' } }))
      .mockResolvedValueOnce(ok({
        statement_id: 's1', status: { state: 'SUCCEEDED' }, manifest: { schema: { columns } },
        result: { data_array: [['DFW', '900', '0.5']], next_chunk_index: 1 },
      }))
      .mockResolvedValueOnce(ok({ data_array: [['CLT', '700', null]] }));
    setDataSource(createDatabricksSource(cfg, fetchMock));

    const rows = await query('SELECT airport, turns, share FROM t WHERE turns >= :min AND airport <> :skip', { min: 600, skip: 'ORD' });

    expect(rows).toEqual([{ airport: 'DFW', turns: 900, share: 0.5 }, { airport: 'CLT', turns: 700, share: null }]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://dbc-test.cloud.databricks.com/api/2.0/sql/statements');
    expect((init!.headers as Record<string, string>).Authorization).toBe('Bearer dapi-secret');
    const body = JSON.parse(init!.body as string);
    expect(body).toMatchObject({ warehouse_id: 'wh1', catalog: 'workspace', schema: 'bufferengine', format: 'JSON_ARRAY', disposition: 'INLINE' });
    expect(body.parameters).toEqual([{ name: 'min', value: '600', type: 'BIGINT' }, { name: 'skip', value: 'ORD', type: 'STRING' }]);
    expect(fetchMock.mock.calls[1][0]).toBe('https://dbc-test.cloud.databricks.com/api/2.0/sql/statements/s1');
    expect(fetchMock.mock.calls[2][0]).toBe('https://dbc-test.cloud.databricks.com/api/2.0/sql/statements/s1/result/chunks/1');
  });

  it('reports failed statements and HTTP errors as DataAccessError without the token', async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(ok({ statement_id: 's2', status: { state: 'FAILED', error: { message: 'TABLE_OR_VIEW_NOT_FOUND' } } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ message: 'Invalid access token' }), { status: 403 }));
    setDataSource(createDatabricksSource(cfg, fetchMock));

    await expect(query('SELECT 1')).rejects.toThrow(/FAILED: TABLE_OR_VIEW_NOT_FOUND/);
    const err = await query('SELECT 1').catch((e) => e);
    expect(err).toBeInstanceOf(DataAccessError);
    expect(err.message).toBe('Databricks API 403: Invalid access token');
    expect(err.message).not.toContain('dapi-secret');
  });

  it('fails clearly when credentials are missing', async () => {
    setDataSource(createDatabricksSource({ ...cfg, token: '' }, vi.fn<typeof fetch>()));
    await expect(query('SELECT 1')).rejects.toThrow(/DATABRICKS_TOKEN/);
  });
});
