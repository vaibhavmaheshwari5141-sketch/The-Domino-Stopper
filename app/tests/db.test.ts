// Data access rules that do not depend on any data: allow-list, placeholders, value conversion.
import { beforeEach, describe, expect, it } from 'vitest';
import { readConfig } from '../server/config.ts';
import { coerce, t, toDuckdbPlaceholders, UnknownTableError, setDataSource } from '../server/db.ts';
import { createDatabricksSource } from '../server/sources/databricks.ts';
import { createLocalSource } from '../server/sources/local.ts';

describe('t()', () => {
  beforeEach(() => setDataSource(createLocalSource('does-not-exist')));

  it('allows the gold tables and discovered sample_* tables only', () => {
    expect(t('gold_kpi_headline')).toBe('gold_kpi_headline');
    for (const bad of ['users', 'gold_kpi_headline; DROP TABLE x', 'sample_rotations', 'sample_', 'sample_x y', '']) {
      expect(() => t(bad)).toThrow(UnknownTableError);
    }
  });

  it('qualifies names with catalog and schema on Databricks', () => {
    setDataSource(createDatabricksSource(readConfig({}).databricks));
    expect(t('gold_kpi_headline')).toBe('workspace.bufferengine.gold_kpi_headline');
  });
});

describe('config', () => {
  it('reads the warehouse id from the HTTP path and rejects unsafe identifiers', () => {
    const cfg = readConfig({ DATABRICKS_HTTP_PATH: '/sql/1.0/warehouses/abc123', DATABRICKS_SERVER_HOSTNAME: 'https://dbc-1.cloud.databricks.com/' });
    expect(cfg.databricks.warehouseId).toBe('abc123');
    expect(cfg.databricks.host).toBe('dbc-1.cloud.databricks.com');
    expect(cfg.dataMode).toBe('databricks');
    expect(() => readConfig({ DATABRICKS_SCHEMA: 'x; DROP' })).toThrow(/plain SQL identifier/);
  });
});

it('rewrites :name placeholders but not string literals or :: casts', () => {
  const sql = "SELECT ':x' AS s, d::DATE FROM t WHERE a = :airport AND b > :min_turns";
  expect(toDuckdbPlaceholders(sql)).toBe("SELECT ':x' AS s, d::DATE FROM t WHERE a = $airport AND b > $min_turns");
});

it('converts values to JSON-safe types for both dialects', () => {
  expect(coerce('42', 'BIGINT')).toBe(42);
  expect(coerce('42', 'LONG')).toBe(42);
  expect(coerce('1.25', 'DECIMAL(5,2)')).toBe(1.25);
  expect(coerce('NaN', 'DOUBLE')).toBeNull();
  expect(coerce('Infinity', 'DOUBLE')).toBeNull();
  expect(coerce('true', 'BOOLEAN')).toBe(true);
  expect(coerce('2026-01-15', 'DATE')).toBe('2026-01-15');
  expect(coerce('2026-10-25 10:01:00', 'TIMESTAMP')).toBe('2026-10-25T10:01:00');
  expect(coerce('[1,2]', 'ARRAY')).toEqual([1, 2]);
  expect(coerce(null, 'INT')).toBeNull();
});
