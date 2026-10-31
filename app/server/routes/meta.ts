import type { CatalogEntry, EngineRun, MetaResponse } from '../../shared/api-types.ts';
import { HttpError } from '../http.ts';
import { ident, query, t } from '../db.ts';

const RUN_COLUMNS = ['run_id', 'run_timestamp_utc', 'data_tag', 'train_period', 'validate_period', 'test_period',
  'model_version', 'engine_version', 'curve_version', 'main_budget', 'checks_passed', 'checks_total'];

export async function getMeta(): Promise<MetaResponse> {
  const runs = await query<EngineRun>(
    `SELECT ${RUN_COLUMNS.join(', ')} FROM ${t('gold_engine_run_log')} ORDER BY run_timestamp_utc DESC LIMIT 1`,
  );
  const run = runs[0];
  if (!run) throw new HttpError(503, 'gold_engine_run_log has no rows; run notebook 08 first');

  const tables = await query<CatalogEntry>(
    `SELECT table_name, grain, dashboard_page, description, ${ident('rows')} FROM ${t('gold_table_catalog')}
     WHERE run_id = :run_id ORDER BY table_name`,
    { run_id: run.run_id },
  );
  return { run, tables };
}
