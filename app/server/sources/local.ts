// Local source, for development and as a demo fallback on a laptop: an in-memory DuckDB where every
// <table>.parquet in LOCAL_DATA_DIR is a view named after the file. Never used by the deployed function.
// Input samples (LOCAL_INPUT_DIR): every <name>.csv or <name>.parquet becomes the view sample_<name>, with a
// trailing "_sample" dropped from the file name (rotations_sample.csv -> sample_rotations).

import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { type DuckDBConnection, DuckDBInstance } from '@duckdb/node-api';
import { type DataSource, type Params, type RawResult, toDuckdbPlaceholders } from '../db.ts';

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

export interface LocalSource extends DataSource {
  /** Views registered from the folder. */
  tables(): Promise<string[]>;
}

/** A path from config, not request input, as a SQL string literal. */
const pathLiteral = (dir: string, file: string) => `'${join(dir, file).replaceAll('\\', '/').replaceAll("'", "''")}'`;

async function registerSamples(conn: DuckDBConnection, inputDir: string): Promise<string[]> {
  const files = (await readdir(inputDir).catch(() => [] as string[])).filter((f) => /\.(csv|parquet)$/i.test(f)).sort();
  const names: string[] = [];
  for (const file of files) {
    const isCsv = /\.csv$/i.test(file);
    const name = `sample_${file.replace(/\.(csv|parquet)$/i, '').replace(/_sample$/i, '')}`;
    if (!IDENTIFIER.test(name) || names.includes(name)) {
      console.warn(`Skipping ${file}: not a valid table name, or a second file for ${name}`);
      continue;
    }
    const reader = isCsv ? `read_csv_auto(${pathLiteral(inputDir, file)}, header = true)` : `read_parquet(${pathLiteral(inputDir, file)})`;
    await conn.run(`CREATE OR REPLACE VIEW ${name} AS SELECT * FROM ${reader}`);
    names.push(name);
  }
  return names;
}

export function createLocalSource(dir: string, inputDir?: string): LocalSource {
  let instance: Promise<{ db: DuckDBInstance; tables: string[] }> | null = null;

  async function open() {
    const db = await DuckDBInstance.create(':memory:');
    const conn = await db.connect();
    const files = (await readdir(dir).catch(() => [] as string[])).filter((f) => f.endsWith('.parquet')).sort();
    const tables: string[] = [];
    for (const file of files) {
      const name = file.slice(0, -'.parquet'.length);
      if (!IDENTIFIER.test(name)) {
        console.warn(`Skipping ${file}: file name is not a valid table name`);
        continue;
      }
      await conn.run(`CREATE OR REPLACE VIEW ${name} AS SELECT * FROM read_parquet(${pathLiteral(dir, file)})`);
      tables.push(name);
    }
    conn.closeSync();
    if (!tables.length) console.warn(`No parquet files in ${dir}; local queries against tables will fail`);
    return { db, tables };
  }

  return {
    mode: 'local',
    tableRef: (name) => name,
    quoteIdent: (name) => `"${name.replaceAll('"', '""')}"`,

    async execute(sql: string, params: Params): Promise<RawResult> {
      const { db } = await (instance ??= open());
      const conn = await db.connect();      // one connection per query; the views live in the shared database
      try {
        const reader = await conn.runAndReadAll(toDuckdbPlaceholders(sql), params);
        const types = reader.columnTypes();
        return {
          columns: reader.columnNames().map((name, i) => ({ name, type: String(types[i]) })),
          rows: reader.getRowsJson(),
        };
      } finally {
        conn.closeSync();
      }
    },

    async tables() {
      return (await (instance ??= open())).tables;
    },

    // Rescans the folder each time, so files added later show up without a restart
    async sampleTables() {
      if (!inputDir) return [];
      const { db } = await (instance ??= open());
      const conn = await db.connect();
      try {
        return await registerSamples(conn, inputDir);
      } finally {
        conn.closeSync();
      }
    },
  };
}
