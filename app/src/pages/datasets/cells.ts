// Display of raw table values by column kind. Numbers keep their digits (no thousands separators, so years and IDs
// read as stored); dates and timestamps are shown as in the rest of the app, in UTC.
import { CATALOG_PAGES } from '../../config/datasets';
import type { ColumnKind } from '../../lib/api';
import { EMPTY, formatDate, formatTimeUtc } from '../../lib/format';

export const KIND_LABELS: Record<ColumnKind, string> = {
  number: 'Number', date: 'Date', timestamp: 'Date and time', boolean: 'True / false', text: 'Text', other: 'Other',
};

const plain = new Intl.NumberFormat('en-US', { maximumFractionDigits: 4, useGrouping: false });

export function formatCell(v: unknown, kind: ColumnKind): string {
  if (v === null || v === undefined) return EMPTY;
  if (typeof v === 'object') return JSON.stringify(v);
  if (kind === 'number' && typeof v === 'number') return plain.format(v);
  if (kind === 'date' || kind === 'timestamp') {
    const day = formatDate(String(v));
    if (day === EMPTY) return String(v);
    return kind === 'date' ? day : `${day} ${formatTimeUtc(String(v))}`;
  }
  return String(v);
}

/** The value as stored, for tooltips. */
export function rawCell(v: unknown): string {
  if (v === null || v === undefined) return 'null';
  return typeof v === 'object' ? JSON.stringify(v) : String(v);
}

/** Pages of this platform named in a gold_table_catalog.dashboard_page text such as "Filters; pages 3, 4, 6". */
export function usedOnPages(dashboardPage: string | null): { path: string; title: string }[] {
  const pages: { path: string; title: string }[] = [];
  for (const [, key] of (dashboardPage ?? '').matchAll(/\b(\d+a?)\b/g)) {
    const page = CATALOG_PAGES[key];
    if (page && !pages.some((p) => p.path === page.path)) pages.push(page);
  }
  return pages;
}
