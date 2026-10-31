// Data access layer: one `query()` over the active data source (Databricks, or local parquet via DuckDB).
//
// Write SQL once with `:name` placeholders and table references from `t()`; it runs unchanged on both sources:
//
//   await query(`SELECT * FROM ${t('gold_dim_airport')} WHERE airport = :airport`, { airport: code });
//
// Rules: table names only ever come from `t()` (allow-listed), and values only ever go in `params`. Never put
// request input into SQL text. Cast dates explicitly, e.g. `flight_date = CAST(:day AS DATE)`, so both dialects agree.

import type { DataMode } from '../shared/api-types.ts';

export type SqlValue = string | number | boolean | null;
export type Params = Record<string, SqlValue>;
export type Row = Record<string, unknown>;

/** What a source returns: column names with their SQL type, and rows of JSON values (numbers usually as strings). */
export interface RawResult {
  columns: { name: string; type: string }[];
  rows: unknown[][];
}

export interface DataSource {
  readonly mode: DataMode;
  tableRef(name: string): string;
  /** Quotes any column name, escaping the quote character. */
  quoteIdent(name: string): string;
  execute(sql: string, params: Params): Promise<RawResult>;
  /** The input sample tables (`sample_<name>`) available right now. */
  sampleTables(): Promise<string[]>;
}

export class UnknownTableError extends Error {
  name = 'UnknownTableError';
}

/** The data source could not run a query (missing config, unreachable warehouse, missing table, bad SQL). */
export class DataAccessError extends Error {
  name = 'DataAccessError';
}

// The 21 gold tables written by notebook 08_consumption_tables
export const GOLD_TABLES: ReadonlySet<string> = new Set([
  'gold_dim_airport', 'gold_dim_date', 'gold_kpi_headline', 'gold_network_daily', 'gold_airport_month',
  'gold_airport_hour', 'gold_passthrough_curve', 'gold_delay_by_leg', 'gold_ml_predictions', 'gold_model_metrics',
  'gold_model_deciles', 'gold_feature_importance', 'gold_buffer_recommendation', 'gold_buffer_plan_daily',
  'gold_buffer_plan_airport', 'gold_sim_strategy', 'gold_sim_daily', 'gold_buffer_allocation', 'gold_data_quality',
  'gold_engine_run_log', 'gold_table_catalog',
]);
export const SAMPLE_TABLE = /^sample_[A-Za-z0-9_]+$/;      // input samples from databricks/03_input_tables_sample.py
const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

let active: DataSource | null = null;
// Input sample tables join the allow-list once discovered (they differ between workspaces, so they are not listed here)
const sampleTables = new Set<string>();
let discovery: { expires: number; value: Promise<string[]> } | null = null;

export function setDataSource(source: DataSource): void {
  active = source;
  sampleTables.clear();
  discovery = null;
}

function source(): DataSource {
  if (!active) throw new DataAccessError('No data source configured');
  return active;
}

export function dataMode(): DataMode {
  return source().mode;
}

// ---- SQL building ------------------------------------------------------------------------------------------------

export function isAllowedTable(name: string): boolean {
  return GOLD_TABLES.has(name) || sampleTables.has(name);
}

/**
 * Finds the input sample tables and adds them to the allow-list. Called at start-up and again by the Input Data
 * endpoints; the answer is reused for `ttlSeconds`, so new samples appear without a restart. Failures and empty
 * answers are not kept.
 */
export function discoverSampleTables(ttlSeconds = 600): Promise<string[]> {
  const now = Date.now();
  if (discovery && discovery.expires > now) return discovery.value;
  const entry: { expires: number; value: Promise<string[]> } = { expires: now + ttlSeconds * 1000, value: Promise.resolve([]) };
  entry.value = source()
    .sampleTables()
    .then((names) => {
      const valid = names.filter((n) => SAMPLE_TABLE.test(n)).sort();
      for (const n of valid) sampleTables.add(n);
      if (!valid.length && discovery === entry) discovery = null;      // none yet: look again next time
      return valid;
    })
    .catch((err: unknown) => {
      if (discovery === entry) discovery = null;
      throw err instanceof DataAccessError ? err : new DataAccessError(err instanceof Error ? err.message : String(err), { cause: err });
    });
  discovery = entry;
  return entry.value;
}

/** The table reference to put in SQL: catalog.schema.name on Databricks, the bare view name locally. */
export function t(name: string): string {
  if (typeof name !== 'string' || !isAllowedTable(name)) throw new UnknownTableError(`Table "${name}" is not on the allow-list`);
  return source().tableRef(name);
}

/** Quote a column whose name is a SQL keyword (for example `rows`), in the active dialect. */
export function ident(name: string): string {
  if (!IDENTIFIER.test(name)) throw new Error(`Not a plain identifier: "${name}"`);
  return source().quoteIdent(name);
}

/** Quote a column name read from a table's schema (CSV headers may hold spaces). Never pass request text here. */
export function column(name: string): string {
  return source().quoteIdent(name);
}

// A single-quoted string literal (left untouched) or a `:name` placeholder (not part of a `::type` cast)
const PLACEHOLDER = /'(?:[^']|'')*'|(?<![:\w]):([A-Za-z_]\w*)/g;

/** Rewrite `:name` placeholders as DuckDB's `$name`, leaving string literals and `::` casts alone. */
export function toDuckdbPlaceholders(sql: string): string {
  return sql.replace(PLACEHOLDER, (match, name?: string) => (name ? `$${name}` : match));
}

// ---- query -------------------------------------------------------------------------------------------------------

export async function query<T = Row>(sql: string, params: Params = {}): Promise<T[]> {
  let raw: RawResult;
  try {
    raw = await source().execute(sql, params);
  } catch (err) {
    if (err instanceof DataAccessError) throw err;
    throw new DataAccessError(err instanceof Error ? `${err.name}: ${err.message}` : String(err), { cause: err });
  }
  const { columns, rows } = raw;
  return rows.map((row) => Object.fromEntries(columns.map((c, i) => [c.name, coerce(row[i], c.type)])) as T);
}

// ---- JSON-safe values --------------------------------------------------------------------------------------------

const NUMERIC = /^(TINYINT|SMALLINT|INTEGER|INT|BIGINT|HUGEINT|UTINYINT|USMALLINT|UINTEGER|UBIGINT|BYTE|SHORT|LONG|FLOAT|REAL|DOUBLE|DECIMAL|NUMERIC)\b/;
const TIMESTAMP = /^TIMESTAMP/;
const NESTED = /^(ARRAY|STRUCT|MAP)\b/;

/**
 * Turn one value from either source into a JSON-safe value for its SQL type: numbers to numbers (NaN and infinity
 * to null), booleans to booleans, dates as "YYYY-MM-DD", timestamps as ISO "YYYY-MM-DDTHH:MM:SS", nested JSON parsed.
 */
export function coerce(value: unknown, type: string): unknown {
  if (value === null || value === undefined) return null;
  const ty = type.toUpperCase();
  if (NUMERIC.test(ty)) {
    const n = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(n) ? n : null;
  }
  if (ty === 'BOOLEAN') return value === true || value === 'true';
  if (TIMESTAMP.test(ty) && typeof value === 'string') return value.replace(' ', 'T');
  if (NESTED.test(ty) && typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  if (typeof value === 'bigint') return Number(value);
  return value;
}
