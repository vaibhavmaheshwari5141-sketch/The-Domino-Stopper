// Server settings, read from environment variables (.env locally, the host's environment settings in production).
// Nothing here is ever sent to the browser: the React app only sees VITE_* variables.

import { isAbsolute, resolve } from 'node:path';
import type { DataMode } from '../shared/api-types.ts';

export interface DatabricksConfig {
  host: string;              // e.g. dbc-1234abcd-5678.cloud.databricks.com
  warehouseId: string;       // last part of the HTTP path /sql/1.0/warehouses/<id>
  token: string;
  catalog: string;
  schema: string;
  timeoutSeconds: number;    // give up on a statement after this long (warehouse cold starts take a while)
}

export interface Config {
  dataMode: DataMode;
  databricks: DatabricksConfig;
  localDataDir: string;      // absolute path
  localInputDir: string;     // absolute path: input samples (CSV or parquet) for the Input Data page
  corsOrigins: string[];
  cacheTtlSeconds: number;
}

export class ConfigError extends Error {
  name = 'ConfigError';
}

type Env = Record<string, string | undefined>;

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

function identifier(env: Env, key: string, fallback: string): string {
  const v = env[key]?.trim() || fallback;
  // Catalog and schema become part of SQL text, so only plain identifiers are accepted
  if (!IDENTIFIER.test(v)) throw new ConfigError(`${key} must be a plain SQL identifier, got "${v}"`);
  return v;
}

function positiveInt(env: Env, key: string, fallback: number): number {
  const raw = env[key]?.trim();
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) throw new ConfigError(`${key} must be a whole number of seconds, got "${raw}"`);
  return n;
}

export function readConfig(env: Env = process.env, root: string = process.cwd()): Config {
  const mode = (env.DATA_MODE?.trim() || 'databricks').toLowerCase();
  if (mode !== 'databricks' && mode !== 'local') throw new ConfigError(`DATA_MODE must be "databricks" or "local", got "${mode}"`);

  const httpPath = env.DATABRICKS_HTTP_PATH?.trim() ?? '';
  const localDir = env.LOCAL_DATA_DIR?.trim() || 'consumption_tables/parquet';
  const inputDir = env.LOCAL_INPUT_DIR?.trim() || '../../exports/samples';

  return {
    dataMode: mode,
    databricks: {
      host: (env.DATABRICKS_SERVER_HOSTNAME ?? '').trim().replace(/^https?:\/\//, '').replace(/\/+$/, ''),
      warehouseId: env.DATABRICKS_WAREHOUSE_ID?.trim() || httpPath.split('/').filter(Boolean).pop() || '',
      token: env.DATABRICKS_TOKEN?.trim() ?? '',
      catalog: identifier(env, 'DATABRICKS_CATALOG', 'workspace'),
      schema: identifier(env, 'DATABRICKS_SCHEMA', 'bufferengine'),
      timeoutSeconds: positiveInt(env, 'DATABRICKS_TIMEOUT_SECONDS', 45),
    },
    localDataDir: isAbsolute(localDir) ? localDir : resolve(root, localDir),
    localInputDir: isAbsolute(inputDir) ? inputDir : resolve(root, inputDir),
    corsOrigins: (env.CORS_ORIGINS ?? 'http://localhost:5173').split(',').map((o) => o.trim()).filter(Boolean),
    cacheTtlSeconds: positiveInt(env, 'CACHE_TTL_SECONDS', 600),
  };
}
