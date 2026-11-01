// Display formatting. Every helper returns an en dash for null, undefined, NaN or an unparseable date,
// so a missing value never renders as "NaN" or "null".

export const EMPTY = '–';

type Num = number | null | undefined;
type DateInput = string | Date | null | undefined;

const isNum = (v: Num): v is number => typeof v === 'number' && Number.isFinite(v);

const formatters = new Map<string, Intl.NumberFormat>();
function nf(options: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = JSON.stringify(options);
  let f = formatters.get(key);
  if (!f) formatters.set(key, (f = new Intl.NumberFormat('en-US', options)));
  return f;
}

/** 1641071 -> "1,641,071"; with digits = 1, 3.14159 -> "3.1" */
export function formatNumber(v: Num, digits = 0): string {
  return isNum(v) ? nf({ minimumFractionDigits: digits, maximumFractionDigits: digits }).format(v) : EMPTY;
}

/** 1641071 -> "1.64M", 25300 -> "25.3K", 950 -> "950" */
export function formatCompact(v: Num, significantDigits = 3): string {
  return isNum(v) ? nf({ notation: 'compact', maximumSignificantDigits: significantDigits }).format(v) : EMPTY;
}

/** A fraction as a percentage: 0.259 -> "25.9%" */
export function formatPercent(fraction: Num, digits = 1): string {
  return isNum(fraction)
    ? nf({ style: 'percent', minimumFractionDigits: digits, maximumFractionDigits: digits }).format(fraction)
    : EMPTY;
}

/** 63 -> "63 min", 1250 -> "1,250 min" */
export function formatMinutes(v: Num, digits = 0): string {
  return isNum(v) ? `${formatNumber(v, digits)} min` : EMPTY;
}

/** US dollars. Compact: 2066592 -> "$2.1M", -84249509 -> "-$84.2M"; otherwise 11.0985 -> "$11.10". */
export function formatUsd(v: Num, compact = true): string {
  if (!isNum(v)) return EMPTY;
  return compact
    ? nf({ style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 }).format(v)
    : nf({ style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
}

/** Percentage points with a sign: 0.6539 -> "+0.65 pp" */
export function formatPp(v: Num, digits = 2): string {
  return isNum(v) ? `${v > 0 ? '+' : ''}${formatNumber(v, digits)} pp` : EMPTY;
}

/** 4.04 -> "4.0x" */
export function formatMultiplier(v: Num, digits = 1): string {
  return isNum(v) ? `${v.toFixed(digits)}x` : EMPTY;
}

// The backend sends dates as "2026-01-15" and timestamps as naive UTC ("2026-10-25T10:01:00"). Both are read as
// UTC and shown in UTC, so a day never shifts with the viewer's time zone.
function toDate(v: DateInput): Date | null {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  let s = v.trim().replace(' ', 'T');
  if (/^\d{4}-\d{2}$/.test(s)) s += '-01';
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) s += 'T00:00:00';
  if (!/(Z|[+-]\d{2}:?\d{2})$/i.test(s)) s += 'Z';
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

const dateFormatters = new Map<string, Intl.DateTimeFormat>();
function df(options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = JSON.stringify(options);
  let f = dateFormatters.get(key);
  if (!f) dateFormatters.set(key, (f = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', ...options })));
  return f;
}

/** "2026-01-15" -> "15 Jan 2026" */
export function formatDate(v: DateInput): string {
  const d = toDate(v);
  return d ? df({ day: 'numeric', month: 'short', year: 'numeric' }).format(d) : EMPTY;
}

/** "2026-01-15" -> "Thu 15 Jan 2026" */
export function formatDayLong(v: DateInput): string {
  const d = toDate(v);
  return d ? df({ weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).format(d).replace(',', '') : EMPTY;
}

/** Clock time in UTC: "2026-03-16T00:22:00" -> "00:22" */
export function formatTimeUtc(v: DateInput): string {
  const d = toDate(v);
  return d ? df({ hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d) : EMPTY;
}

/** Whole days from `from` to `to` (both dates or timestamps, compared as UTC calendar days); null if either is missing. */
export function dayOffset(from: DateInput, to: DateInput): number | null {
  const a = toDate(from);
  const b = toDate(to);
  if (!a || !b) return null;
  const day = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return Math.round((day(b) - day(a)) / 86_400_000);
}

/** "2026-10-25T10:01:00" -> "25 Oct 2026, 10:01 UTC" */
export function formatDateTime(v: DateInput): string {
  const d = toDate(v);
  return d
    ? `${df({ day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d)} UTC`
    : EMPTY;
}

/** A year_month key: "2026-01" -> "Jan 2026" */
export function formatMonth(v: DateInput): string {
  const d = toDate(v);
  return d ? df({ month: 'short', year: 'numeric' }).format(d) : EMPTY;
}

/** Axis label for a year_month key: "2026-01" -> "Jan 26" */
export function formatMonthShort(v: DateInput): string {
  const d = toDate(v);
  return d ? `${df({ month: 'short' }).format(d)} ${String(d.getUTCFullYear()).slice(2)}` : EMPTY;
}

/** A period written as "2026-01-01 to 2026-08-31" -> "Jan–Aug 2026"; across years "Oct 2025–Feb 2026" */
export function formatPeriod(v: string | null | undefined): string {
  const [from, to] = (v ?? '').split(/\s+to\s+/).map(toDate);
  if (!from || !to) return v?.trim() || EMPTY;
  const month = (d: Date) => df({ month: 'short' }).format(d);
  return from.getUTCFullYear() === to.getUTCFullYear()
    ? `${month(from)}–${month(to)} ${to.getUTCFullYear()}`
    : `${formatMonth(from)}–${formatMonth(to)}`;
}
