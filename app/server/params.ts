// Query-parameter validation. Every value a route uses comes through one of these, so it is either an allowed value,
// a checked number or date, or the request is refused with 400 before any SQL runs.

import { HttpError } from './http.ts';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function get(params: URLSearchParams, key: string): string | null {
  const v = params.get(key)?.trim();
  return v ? v : null;
}

export function oneOf<T extends string>(params: URLSearchParams, key: string, allowed: readonly T[], fallback: T): T {
  const v = get(params, key);
  if (v === null) return fallback;
  if (!(allowed as readonly string[]).includes(v)) throw new HttpError(400, `${key} must be one of: ${allowed.join(', ')}`);
  return v as T;
}

export function oneOfNumber<T extends number>(params: URLSearchParams, key: string, allowed: readonly T[], fallback: T): T {
  const v = get(params, key);
  if (v === null) return fallback;
  const n = Number(v);
  if (!(allowed as readonly number[]).includes(n)) throw new HttpError(400, `${key} must be one of: ${allowed.join(', ')}`);
  return n as T;
}

export function intInRange(params: URLSearchParams, key: string, min: number, max: number, fallback: number): number {
  const v = get(params, key);
  if (v === null) return fallback;
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw new HttpError(400, `${key} must be a whole number from ${min} to ${max}`);
  return n;
}

/** A calendar date "YYYY-MM-DD". */
export function isoDate(params: URLSearchParams, key: string, fallback?: string): string {
  const v = get(params, key) ?? fallback ?? null;
  if (v === null) throw new HttpError(400, `${key} is required (a date like 2026-03-15)`);
  const d = new Date(`${v}T00:00:00Z`);
  // Real calendar days only: rejects month 13 (an invalid Date) and 2026-02-30 (which would roll over to March)
  if (!DATE.test(v) || Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v) {
    throw new HttpError(400, `${key} must be a date like 2026-03-15`);
  }
  return v;
}

/** A month "YYYY-MM", or null when absent. */
export function optionalYearMonth(params: URLSearchParams, key: string): string | null {
  const v = get(params, key);
  if (v === null) return null;
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(v)) throw new HttpError(400, `${key} must be a month like 2026-03`);
  return v;
}

/** A three-letter airport code, or null for all airports. */
export function airportCode(params: URLSearchParams, key = 'airport'): string | null {
  const v = get(params, key)?.toUpperCase() ?? null;
  if (v === null || v === 'ALL') return null;
  if (!/^[A-Z]{3}$/.test(v)) throw new HttpError(400, `${key} must be a three-letter airport code`);
  return v;
}

/** Free-text search reduced to letters and digits (tail and flight numbers only use those), at most 12 characters. */
export function searchText(params: URLSearchParams, key = 'search'): string | null {
  const v = (get(params, key) ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
  return v || null;
}

/** An aircraft registration such as "N156UW", or null when absent. */
export function optionalTailNumber(params: URLSearchParams, key: string): string | null {
  return get(params, key) === null ? null : tailNumber(params, key);
}

/** An aircraft registration such as "N156UW" (letters and digits, 2 to 8). */
export function tailNumber(params: URLSearchParams, key = 'tail'): string {
  const v = get(params, key)?.toUpperCase() ?? null;
  if (v === null) throw new HttpError(400, `${key} is required (a tail number such as N156UW)`);
  if (!/^[A-Z0-9]{2,8}$/.test(v)) throw new HttpError(400, `${key} must be a tail number such as N156UW`);
  return v;
}

/** A date range from `start` and `end` (both "YYYY-MM-DD", defaults when absent); refuses a range that ends before it starts. */
export function dateRange(params: URLSearchParams, defaults: { start: string; end: string }): { start: string; end: string } {
  const start = isoDate(params, 'start', defaults.start);
  const end = isoDate(params, 'end', defaults.end);
  if (end < start) throw new HttpError(400, 'end must be on or after start');
  return { start, end };
}
