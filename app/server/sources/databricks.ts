// Databricks source: runs SQL on a SQL warehouse through the Statement Execution REST API
// (POST /api/2.0/sql/statements). Plain fetch, no driver, so it runs in any serverless host.
// Docs: https://docs.databricks.com/api/statement-execution/v1/statement-execution

import type { DatabricksConfig } from '../config.ts';
import { DataAccessError, type DataSource, type Params, type RawResult, type SqlValue } from '../db.ts';

interface StatementResponse {
  statement_id: string;
  status: { state: 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELED' | 'CLOSED'; error?: { message?: string } };
  manifest?: { schema?: { columns?: { name: string; type_name: string }[] }; truncated?: boolean };
  result?: ResultChunk;
}

interface ResultChunk {
  data_array?: (string | null)[][];
  next_chunk_index?: number;
}

const POLL_MS = 1000;

function sqlType(v: SqlValue): string {
  if (typeof v === 'boolean') return 'BOOLEAN';
  if (typeof v === 'number') return Number.isInteger(v) ? 'BIGINT' : 'DOUBLE';
  return 'STRING';
}

/** Named parameters (:name) in the API's format. A parameter without a value is NULL. */
export function toStatementParameters(params: Params): { name: string; value?: string; type: string }[] {
  return Object.entries(params).map(([name, v]) => (v === null ? { name, type: 'STRING' } : { name, value: String(v), type: sqlType(v) }));
}

export function createDatabricksSource(cfg: DatabricksConfig, fetchImpl: typeof fetch = fetch): DataSource {
  const base = `https://${cfg.host}/api/2.0/sql/statements`;

  async function call<T>(url: string, init?: RequestInit): Promise<T> {
    const res = await fetchImpl(url, {
      ...init,
      headers: { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    });
    if (!res.ok) {
      let message = res.statusText;
      try {
        message = ((await res.json()) as { message?: string }).message ?? message;
      } catch {
        // not JSON
      }
      throw new DataAccessError(`Databricks API ${res.status}: ${message}`);
    }
    return (await res.json()) as T;
  }

  const source: DataSource = {
    mode: 'databricks',
    tableRef: (name) => `${cfg.catalog}.${cfg.schema}.${name}`,
    quoteIdent: (name) => `\`${name.replaceAll('`', '``')}\``,

    async sampleTables() {
      // Catalog and schema are checked identifiers (config.ts)
      const { columns, rows } = await source.execute(`SHOW TABLES IN ${cfg.catalog}.${cfg.schema} LIKE 'sample_*'`, {});
      const i = columns.findIndex((c) => c.name === 'tableName');
      return rows.map((r) => String(r[i]));
    },

    async execute(sql: string, params: Params): Promise<RawResult> {
      if (!cfg.host || !cfg.warehouseId || !cfg.token) {
        throw new DataAccessError('Databricks needs DATABRICKS_SERVER_HOSTNAME, DATABRICKS_HTTP_PATH and DATABRICKS_TOKEN');
      }
      const deadline = Date.now() + cfg.timeoutSeconds * 1000;
      let st = await call<StatementResponse>(base, {
        method: 'POST',
        body: JSON.stringify({
          warehouse_id: cfg.warehouseId,
          catalog: cfg.catalog,
          schema: cfg.schema,
          statement: sql,
          parameters: toStatementParameters(params),
          disposition: 'INLINE',
          format: 'JSON_ARRAY',
          wait_timeout: `${Math.min(50, Math.max(5, cfg.timeoutSeconds))}s`,   // the API accepts 5 to 50 seconds
          on_wait_timeout: 'CONTINUE',
        }),
      });

      // Still queued or running (for example while the warehouse starts): poll until done or out of time
      while (st.status.state === 'PENDING' || st.status.state === 'RUNNING') {
        if (Date.now() + POLL_MS > deadline) {
          await call(`${base}/${st.statement_id}/cancel`, { method: 'POST' }).catch(() => undefined);
          throw new DataAccessError(`Databricks statement did not finish within ${cfg.timeoutSeconds}s`);
        }
        await new Promise((r) => setTimeout(r, POLL_MS));
        st = await call<StatementResponse>(`${base}/${st.statement_id}`);
      }
      if (st.status.state !== 'SUCCEEDED') {
        throw new DataAccessError(`Databricks statement ${st.status.state}: ${st.status.error?.message ?? 'no message'}`);
      }

      const columns = (st.manifest?.schema?.columns ?? []).map((c) => ({ name: c.name, type: c.type_name }));
      const rows: unknown[][] = [...(st.result?.data_array ?? [])];
      let next = st.result?.next_chunk_index;
      while (next !== undefined) {
        const chunk = await call<ResultChunk>(`${base}/${st.statement_id}/result/chunks/${next}`);
        rows.push(...(chunk.data_array ?? []));
        next = chunk.next_chunk_index;
      }
      if (st.manifest?.truncated) console.warn('Databricks result was truncated (over 25 MiB); add filters or LIMIT');
      return { columns, rows };
    },
  };
  return source;
}
