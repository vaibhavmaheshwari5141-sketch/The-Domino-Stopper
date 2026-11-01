// Input Data endpoints (/api/datasets/...): browse the input sample tables (sample_*, found at run time) and the
// 25 gold tables. Table names only come from t() after an allow-list check, column names only from the table's own
// schema, and the search text only goes in as a parameter. gold_buffer_recommendation has 1.7M rows, so every
// endpoint pages, limits or samples on the server.

import type {
  ColumnKind, ColumnProfile, DatasetColumn, DatasetItem, DatasetPreview, DatasetProfile, DatasetSchema, DatasetsResponse,
} from '../../shared/api-types.ts';
import { formatNumber } from '../../shared/format.ts';
import { CATALOG_DESCRIPTION, GROUP_TITLES, INPUT_DESCRIPTIONS, INPUT_FALLBACK_DESCRIPTION } from '../../src/config/datasets.ts';
import { cached } from '../cache.ts';
import { toCsv } from '../csv.ts';
import { GOLD_TABLES, type Params, column, dataMode, discoverSampleTables, ident, isAllowedTable, query, t } from '../db.ts';
import { HttpError } from '../http.ts';
import { intInRange, oneOf } from '../params.ts';

const LIST_TTL_SECONDS = 600;
const PREVIEW_MAX = 500;
const DOWNLOAD_MAX = 5000;
const MAX_OFFSET = 100_000_000;
const SEARCH_MAX = 100;
const PROFILE_FULL_MAX = 500_000;       // bigger tables are profiled on a sample
const PROFILE_SAMPLE = 100_000;
const TOP_VALUES = 5;
const NAME = /^[A-Za-z0-9_]{1,128}$/;

// ---- column types --------------------------------------------------------------------------------------------------

const NUMBER = /^(TINYINT|SMALLINT|INTEGER|INT|BIGINT|HUGEINT|UTINYINT|USMALLINT|UINTEGER|UBIGINT|UHUGEINT|BYTE|SHORT|LONG|FLOAT|REAL|DOUBLE|DECIMAL|NUMERIC)\b/;

/** Databricks (DESCRIBE TABLE: "bigint", "decimal(10,2)") and DuckDB ("BIGINT", "VARCHAR") types to one kind. */
export function columnKind(type: string): ColumnKind {
  const ty = type.trim().toUpperCase();
  if (NUMBER.test(ty)) return 'number';
  if (ty === 'DATE') return 'date';
  if (ty.startsWith('TIMESTAMP')) return 'timestamp';
  if (ty === 'BOOLEAN' || ty === 'BOOL') return 'boolean';
  if (/^(STRING|VARCHAR|CHAR|TEXT)\b/.test(ty)) return 'text';
  return 'other';
}

const hasRange = (kind: ColumnKind) => kind === 'number' || kind === 'date' || kind === 'timestamp';

// ---- parameters ----------------------------------------------------------------------------------------------------

/** A well-formed name; whether the dataset exists is checked in the loader (404), as sample tables are found at run time. */
function datasetName(p: URLSearchParams): string {
  const name = p.get('name') ?? '';
  if (!NAME.test(name)) throw new HttpError(404, 'Unknown dataset');
  return name;
}

function text(p: URLSearchParams, key: string, max: number): string | null {
  const v = p.get(key)?.trim().slice(0, max);
  return v ? v : null;
}

export function nameParams(p: URLSearchParams): URLSearchParams {
  return new URLSearchParams({ name: datasetName(p) });
}

function rowsParams(p: URLSearchParams, maxLimit: number, defaultLimit: number): URLSearchParams {
  const out = new URLSearchParams({
    name: datasetName(p),
    limit: String(intInRange(p, 'limit', 1, maxLimit, defaultLimit)),
    offset: String(intInRange(p, 'offset', 0, MAX_OFFSET, 0)),
    order: oneOf(p, 'order', ['asc', 'desc'] as const, 'asc'),
  });
  // Free text, checked against the table's columns (sort) or bound as a parameter (search) before use
  const sort = text(p, 'sort', 128);
  const search = text(p, 'search', SEARCH_MAX);
  if (sort) out.set('sort', sort);
  if (search) out.set('search', search);
  return out;
}

export const previewParams = (p: URLSearchParams) => rowsParams(p, PREVIEW_MAX, 100);
export const downloadParams = (p: URLSearchParams) => rowsParams(p, DOWNLOAD_MAX, DOWNLOAD_MAX);

async function requireDataset(name: string): Promise<void> {
  if (!GOLD_TABLES.has(name)) await discoverSampleTables(LIST_TTL_SECONDS);
  if (!isAllowedTable(name)) throw new HttpError(404, `Unknown dataset: ${name}`);
}

// ---- schema --------------------------------------------------------------------------------------------------------

async function describe(name: string): Promise<DatasetColumn[]> {
  const local = dataMode() === 'local';
  const rows = await query<Record<string, unknown>>(`${local ? 'DESCRIBE' : 'DESCRIBE TABLE'} ${t(name)}`);
  const columns: DatasetColumn[] = [];
  for (const r of rows) {
    const colName = String((local ? r.column_name : r.col_name) ?? '');
    const type = String((local ? r.column_type : r.data_type) ?? '');
    if (!colName || colName.startsWith('#')) break;        // Databricks lists partitioning and other details after the columns
    columns.push({ name: colName, type, kind: columnKind(type) });
  }
  return columns;
}

const describeCached = cached('datasets/describe', LIST_TTL_SECONDS, (p) => describe(p.get('name')!));
const columnsOf = (name: string) => describeCached(new URLSearchParams({ name }));

export async function getSchema(p: URLSearchParams): Promise<DatasetSchema> {
  const name = p.get('name')!;
  await requireDataset(name);
  return { name, columns: await columnsOf(name) };
}

// ---- list ----------------------------------------------------------------------------------------------------------

interface CatalogRow {
  table_name: string;
  grain: string | null;
  dashboard_page: string | null;
  description: string | null;
  n_rows: number | null;
  n_columns: number | null;
}

const goldItems = cached('datasets/gold', LIST_TTL_SECONDS, async (): Promise<DatasetItem[]> => {
  const catalog = 'gold_table_catalog';
  const [rows, [own], ownColumns] = await Promise.all([
    query<CatalogRow>(
      `SELECT table_name, grain, dashboard_page, description, ${ident('rows')} AS n_rows, ${ident('columns')} AS n_columns
       FROM ${t(catalog)}
       WHERE run_id = (SELECT run_id FROM ${t('gold_engine_run_log')} ORDER BY run_timestamp_utc DESC LIMIT 1)`,
    ),
    query<{ n: number }>(`SELECT COUNT(*) AS n FROM ${t(catalog)}`),
    columnsOf(catalog),
  ]);
  const items: DatasetItem[] = rows
    .filter((r) => GOLD_TABLES.has(r.table_name) && r.table_name !== catalog)
    .map((r) => ({
      name: r.table_name, display_name: r.table_name.replace(/^gold_/, ''), group: 'gold', description: r.description ?? '',
      rows: r.n_rows, columns: r.n_columns, grain: r.grain, dashboard_page: r.dashboard_page,
    }));
  items.push({
    name: catalog, display_name: 'table_catalog', group: 'gold', description: CATALOG_DESCRIPTION, rows: own?.n ?? null,
    columns: ownColumns.length, grain: 'gold table x run', dashboard_page: null,
  });
  return items.sort((a, b) => a.name.localeCompare(b.name));
});

const inputStats = cached('datasets/input', LIST_TTL_SECONDS, async (p): Promise<DatasetItem[]> => {
  const names = p.getAll('table');
  const [counts, schemas] = await Promise.all([
    // Index literals only, so the statement holds no names except allow-listed table references
    query<{ i: number; n: number }>(names.map((n, i) => `SELECT ${i} AS i, COUNT(*) AS n FROM ${t(n)}`).join(' UNION ALL ')),
    Promise.all(names.map(columnsOf)),
  ]);
  return names.map((name, i) => {
    const short = name.replace(/^sample_/, '');
    return {
      name, display_name: short, group: 'input', description: INPUT_DESCRIPTIONS[short] ?? INPUT_FALLBACK_DESCRIPTION,
      rows: counts.find((c) => c.i === i)?.n ?? null, columns: schemas[i].length, grain: null, dashboard_page: null,
    };
  });
});

/** Not cached as a whole: sample discovery looks again while none are found, so new samples appear on refresh. */
export async function getDatasets(): Promise<DatasetsResponse> {
  const names = await discoverSampleTables(LIST_TTL_SECONDS);
  const [input, gold] = await Promise.all([
    names.length ? inputStats(new URLSearchParams(names.map((n) => ['table', n]))) : Promise.resolve([]),
    goldItems(new URLSearchParams()),
  ]);
  return {
    groups: [
      { id: 'input', title: GROUP_TITLES.input, items: input },
      { id: 'gold', title: GROUP_TITLES.gold, items: gold },
    ],
  };
}

// ---- preview and download ------------------------------------------------------------------------------------------

interface RowsQuery {
  name: string;
  columns: DatasetColumn[];
  limit: number;
  offset: number;
  sort: string | null;
  order: 'asc' | 'desc';
  search: string | null;
}

async function readRowsQuery(p: URLSearchParams): Promise<RowsQuery> {
  const name = p.get('name')!;
  await requireDataset(name);
  const columns = await columnsOf(name);
  const sort = p.get('sort');
  if (sort !== null && !columns.some((c) => c.name === sort)) throw new HttpError(400, `sort must be a column of ${name}`);
  return {
    name, columns, sort, search: p.get('search'),
    limit: Number(p.get('limit')), offset: Number(p.get('offset')), order: p.get('order') === 'desc' ? 'desc' : 'asc',
  };
}

/** WHERE clause for a case-insensitive "contains" over the text columns; no text columns means no match. */
function searchClause(q: RowsQuery): { where: string; params: Params } {
  if (!q.search) return { where: '', params: {} };
  const textColumns = q.columns.filter((c) => c.kind === 'text');
  if (!textColumns.length) return { where: ' WHERE 1 = 0', params: {} };
  return {
    where: ` WHERE ${textColumns.map((c) => `instr(LOWER(${column(c.name)}), :search) > 0`).join(' OR ')}`,
    params: { search: q.search.toLowerCase() },
  };
}

async function selectRows(q: RowsQuery, where: string, params: Params): Promise<unknown[][]> {
  const order = q.sort ? ` ORDER BY ${column(q.sort)} ${q.order === 'desc' ? 'DESC' : 'ASC'} NULLS LAST` : '';
  const rows = await query(
    `SELECT ${q.columns.map((c) => column(c.name)).join(', ')} FROM ${t(q.name)}${where}${order} LIMIT ${q.limit} OFFSET ${q.offset}`,
    params,
  );
  return rows.map((r) => q.columns.map((c) => r[c.name]));
}

export async function getPreview(p: URLSearchParams): Promise<DatasetPreview> {
  const q = await readRowsQuery(p);
  const { where, params } = searchClause(q);
  const [rows, [count]] = await Promise.all([
    selectRows(q, where, params),
    query<{ n: number }>(`SELECT COUNT(*) AS n FROM ${t(q.name)}${where}`, params),
  ]);
  return { columns: q.columns, rows, total: count?.n ?? 0, limit: q.limit, offset: q.offset, sort: q.sort, order: q.order, search: q.search };
}

export async function getDownload(p: URLSearchParams): Promise<{ filename: string; body: string }> {
  const q = await readRowsQuery(p);
  const { where, params } = searchClause(q);
  const rows = await selectRows({ ...q, offset: 0 }, where, params);
  return { filename: `${q.name}_preview.csv`, body: toCsv(q.columns.map((c) => c.name), rows) };
}

// ---- profile -------------------------------------------------------------------------------------------------------

/**
 * Big tables are profiled on about PROFILE_SAMPLE rows picked by a hash of each row. Unlike random(), the hash picks
 * the same rows in both profile queries, so the counts and the top values describe one sample.
 */
function profileSource(name: string, columns: DatasetColumn[], rows: number): { from: string; sampled: boolean } {
  if (rows <= PROFILE_FULL_MAX) return { from: t(name), sampled: false };
  const every = Math.max(2, Math.round(rows / PROFILE_SAMPLE));
  const key = columns.filter((c) => c.kind !== 'other').slice(0, 12).map((c) => `CAST(${column(c.name)} AS STRING)`);
  // hash() is signed on Databricks and unsigned in DuckDB; ((h % k) + k) % k is a non-negative remainder in both
  const h = `hash(concat_ws('|', ${key.join(', ')}))`;
  return { from: `(SELECT * FROM ${t(name)} WHERE ((${h} % ${every}) + ${every}) % ${every} = 0) s`, sampled: true };
}

export async function getProfile(p: URLSearchParams): Promise<DatasetProfile> {
  const name = p.get('name')!;
  await requireDataset(name);
  const [columns, [total]] = await Promise.all([columnsOf(name), query<{ n: number }>(`SELECT COUNT(*) AS n FROM ${t(name)}`)]);
  const rows = total?.n ?? 0;
  const { from, sampled } = profileSource(name, columns, rows);

  // One pass for every column: non-null count, then min and max (numbers, dates) or the number of distinct values
  const aggregates = columns.flatMap((c, i) => {
    const col = column(c.name);
    return hasRange(c.kind)
      ? [`COUNT(${col}) AS nn${i}`, `MIN(${col}) AS min${i}`, `MAX(${col}) AS max${i}`]
      : [`COUNT(${col}) AS nn${i}`, `COUNT(DISTINCT CAST(${col} AS STRING)) AS d${i}`];
  });
  const [agg] = await query(`SELECT COUNT(*) AS n${aggregates.map((a) => `, ${a}`).join('')} FROM ${from}`);
  const profiled = Number(agg?.n ?? 0);

  const profiles: ColumnProfile[] = columns.map((c, i) => {
    const nonNull = Number(agg?.[`nn${i}`] ?? 0);
    const base = { ...c, nulls: profiled - nonNull, null_share: profiled ? (profiled - nonNull) / profiled : null };
    return hasRange(c.kind)
      ? { ...base, min: (agg?.[`min${i}`] ?? null) as number | string | null, max: (agg?.[`max${i}`] ?? null) as number | string | null }
      : { ...base, distinct: Number(agg?.[`d${i}`] ?? 0), top: [] };
  });

  // Top values, only where they say something (not every value different, and not all null)
  const topIndexes = profiles.flatMap((c, i) => (c.distinct !== undefined && c.distinct > 0 && c.distinct < profiled - c.nulls ? [i] : []));
  if (topIndexes.length) {
    const groups = topIndexes.map((i) => {
      const v = `CAST(${column(columns[i].name)} AS STRING)`;
      return `SELECT ${i} AS i, ${v} AS v, COUNT(*) AS n FROM ${from} WHERE ${column(columns[i].name)} IS NOT NULL GROUP BY ${v}`;
    });
    const top = await query<{ i: number; v: string; n: number }>(
      `SELECT i, v, n FROM (
         SELECT i, v, n, ROW_NUMBER() OVER (PARTITION BY i ORDER BY n DESC, v) AS rk FROM (${groups.join(' UNION ALL ')}) g
       ) r WHERE rk <= ${TOP_VALUES} ORDER BY i, rk`,
    );
    for (const r of top) profiles[r.i].top!.push({ value: r.v, count: r.n });
  }

  return {
    name, rows, profiled_rows: profiled, sampled, columns: profiles,
    note: sampled
      ? `Based on a sample of ${formatNumber(profiled)} of ${formatNumber(rows)} rows (tables over ${formatNumber(PROFILE_FULL_MAX)} rows are sampled).`
      : null,
  };
}
