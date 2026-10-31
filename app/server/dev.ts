// Builds the API handler for local use (vite dev / vite preview / tests). DATA_MODE picks the source.
// Only this file loads the DuckDB source, so the deployed function never bundles it.

import { type ApiHandler, createApiHandler } from './app.ts';
import { readConfig } from './config.ts';
import { discoverSampleTables } from './db.ts';
import { createDatabricksSource } from './sources/databricks.ts';

export async function createDevHandler(env: Record<string, string | undefined>, root?: string): Promise<ApiHandler> {
  const config = readConfig(env, root);
  if (config.dataMode === 'local') {
    const { createLocalSource } = await import('./sources/local.ts');
    const source = createLocalSource(config.localDataDir, config.localInputDir);
    console.info(`API: DATA_MODE=local, ${(await source.tables()).length} tables from ${config.localDataDir}`);
    const handler = createApiHandler(config, source);
    // Input samples join the allow-list at start-up (and are rescanned when the Input Data page asks again)
    const samples = await discoverSampleTables(config.cacheTtlSeconds);
    console.info(`API: ${samples.length} input sample tables from ${config.localInputDir}`);
    return handler;
  }
  const { host, catalog, schema } = config.databricks;
  console.info(`API: DATA_MODE=databricks, ${catalog}.${schema} on ${host || '<DATABRICKS_SERVER_HOSTNAME not set>'}`);
  return createApiHandler(config, createDatabricksSource(config.databricks));
}
