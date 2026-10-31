import type { HealthResponse } from '../../shared/api-types.ts';
import { DataAccessError, dataMode, query } from '../db.ts';

export async function getHealth(): Promise<HealthResponse> {
  let databaseOk = false;
  try {
    const rows = await query<{ ok: number }>('SELECT 1 AS ok');
    databaseOk = rows[0]?.ok === 1;
  } catch (err) {
    if (!(err instanceof DataAccessError)) throw err;
    console.warn(`Health check query failed: ${err.message}`);
  }
  return { status: databaseOk ? 'ok' : 'degraded', data_mode: dataMode(), database_ok: databaseOk };
}
