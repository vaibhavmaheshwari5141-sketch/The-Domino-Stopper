// Airport Insights endpoints (/api/airports/...): one airport at a time, compared with the network.
// Whole-period figures are weighted averages over gold_airport_month: departure rates by departures, arrival rates and
// delays by arrivals, turnaround figures by turnarounds.

import type {
  AirportBuffer, AirportBufferMonth, AirportHour, AirportHourly, AirportListResponse, AirportMonth, AirportProfile, AirportStats,
  NetworkScatter,
} from '../../shared/api-types.ts';
import { formatNumber, formatPercent } from '../../shared/format.ts';
import { PLANNER_BUDGETS } from '../../shared/planner.ts';
import { cached } from '../cache.ts';
import { query, t } from '../db.ts';
import { HttpError } from '../http.ts';
import { intInRange, oneOf, oneOfNumber } from '../params.ts';

const SORTS = ['departures', 'dep_late15_rate', 'median_ground_min', 'propagated_delay_min'] as const;
const RANK_MIN_DEPARTURES = 1000;          // late-rate ranks only among airports with enough flights to be stable
const PEAK_MIN_DEPARTURES = 100;           // hours with fewer departures are not called a "peak"

const normalised = (values: Record<string, string | number | null>) =>
  new URLSearchParams(Object.entries(values).filter(([, v]) => v !== null).map(([k, v]) => [k, String(v)]));

/** Flight-weighted mean of a monthly figure, ignoring months where it is missing. */
const w = (col: string, weight: string) => `SUM(${col} * ${weight}) / NULLIF(SUM(CASE WHEN ${col} IS NOT NULL THEN ${weight} END), 0)`;

const MONTH_AGGREGATES = `
  ${w('dep_late15_rate', 'scheduled_departures')} AS dep_late15_rate,
  ${w('arr_late15_rate', 'arrivals')} AS arr_late15_rate,
  ${w('avg_arr_delay_min', 'arrivals')} AS avg_arr_delay_min,
  ${w('avg_dep_delay_min', 'scheduled_departures')} AS avg_dep_delay_min,
  ${w('cancel_rate', 'scheduled_departures')} AS cancel_rate,
  ${w('short_turn_share', 'turnarounds')} AS short_turn_share,
  ${w('avg_inbound_delay_min', 'turnarounds')} AS avg_inbound_delay_min,
  ${w('pass_through', 'turnarounds')} AS pass_through,
  SUM(propagated_delay_min) AS propagated_delay_min`;

// ---- shared, cached lookups ----------------------------------------------------------------------------------------

/** Every airport with its whole-period figures. Cached; the list, profile, scatter and code check all use it. */
const allAirports = cached('airports/all', 600, async () =>
  query<AirportStats>(
    `WITH m AS (SELECT airport, ${MONTH_AGGREGATES} FROM ${t('gold_airport_month')} GROUP BY airport)
     SELECT d.airport, d.city, d.state, d.departures, d.arrivals, d.turnarounds, d.median_ground_min,
            COALESCE(d.is_top10, FALSE) AS is_top10, d.departure_rank,
            m.dep_late15_rate, m.arr_late15_rate, m.avg_arr_delay_min, m.avg_dep_delay_min, m.cancel_rate, m.short_turn_share,
            m.avg_inbound_delay_min, m.pass_through, m.propagated_delay_min
     FROM ${t('gold_dim_airport')} d LEFT JOIN m ON m.airport = d.airport
     ORDER BY d.departure_rank`,
  ));

const allParams = () => new URLSearchParams();

/** The airport code from the path: three letters, and present in gold_dim_airport (404 otherwise). */
async function knownAirport(p: URLSearchParams): Promise<AirportStats> {
  const code = (p.get('code') ?? '').toUpperCase();
  const airport = (await allAirports(allParams())).find((a) => a.airport === code);
  if (!airport) throw new HttpError(404, `Unknown airport ${code}`);
  return airport;
}

function codeParam(p: URLSearchParams): string {
  const code = (p.get('code') ?? '').toUpperCase();
  if (!/^[A-Z]{3}$/.test(code)) throw new HttpError(400, 'The airport code must be three letters, such as DFW');
  return code;
}

/** Search text for airport codes and city names: letters, spaces and . / - only, at most 30 characters. */
function citySearch(p: URLSearchParams): string | null {
  const v = (p.get('search') ?? '').toUpperCase().replace(/[^A-Z ./-]/g, '').trim().slice(0, 30);
  return v || null;
}

export const listParams = (p: URLSearchParams) => normalised({
  search: citySearch(p),
  min_departures: intInRange(p, 'min_departures', 0, 1_000_000, 1000),
  sort: oneOf(p, 'sort', SORTS, 'departures'),
  top10: oneOf(p, 'top10', ['true', 'false'] as const, 'false') === 'true' ? 'true' : null,
});
export const codeParams = (p: URLSearchParams) => normalised({ code: codeParam(p) });
export const bufferParams = (p: URLSearchParams) => normalised({ code: codeParam(p), budget: oneOfNumber(p, 'budget', PLANNER_BUDGETS, 5) });
export const scatterParams = (p: URLSearchParams) => normalised({ min_turnarounds: intInRange(p, 'min_turnarounds', 0, 1_000_000, 1000) });

// ---- endpoints -----------------------------------------------------------------------------------------------------

export async function getList(p: URLSearchParams): Promise<AirportListResponse> {
  const search = p.get('search');
  const minDepartures = Number(p.get('min_departures'));
  const sort = p.get('sort') as (typeof SORTS)[number];
  const rows = (await allAirports(allParams())).filter((a) =>
    a.departures >= minDepartures
    && (!p.get('top10') || a.is_top10)
    && (!search || a.airport.includes(search) || (a.city ?? '').toUpperCase().includes(search)));
  rows.sort((a, b) => (b[sort] ?? -Infinity) - (a[sort] ?? -Infinity) || b.departures - a.departures);
  return { airports: rows, total: rows.length };
}

export async function getProfile(p: URLSearchParams): Promise<AirportProfile> {
  const airport = await knownAirport(p);
  const all = await allAirports(allParams());
  const [network, kpi] = await Promise.all([
    query<Omit<AirportProfile['network'], 'airports' | 'avg_departures_per_airport' | 'median_ground_min'>>(
      `SELECT SUM(scheduled_departures) AS departures, SUM(arrivals) AS arrivals, SUM(turnarounds) AS turnarounds, ${MONTH_AGGREGATES}
       FROM ${t('gold_airport_month')}`,
    ),
    query<{ value: number | null }>(`SELECT value FROM ${t('gold_kpi_headline')} WHERE kpi_name = 'median_ground_time'`),
  ]);
  const ranked = all.filter((a) => a.departures >= RANK_MIN_DEPARTURES && a.dep_late15_rate !== null)
    .sort((a, b) => (b.dep_late15_rate ?? 0) - (a.dep_late15_rate ?? 0));
  const lateRank = ranked.findIndex((a) => a.airport === airport.airport);
  return {
    airport,
    ranks: {
      departures: airport.departure_rank,
      late_rate: lateRank >= 0 ? lateRank + 1 : null,
      airports: all.length,
      late_rate_airports: ranked.length,
    },
    network: {
      ...network[0],
      median_ground_min: kpi[0]?.value ?? null,
      airports: all.length,
      avg_departures_per_airport: all.length ? all.reduce((s, a) => s + a.departures, 0) / all.length : 0,
    },
  };
}

export async function getMonthly(p: URLSearchParams): Promise<AirportMonth[]> {
  const { airport } = await knownAirport(p);
  return query<AirportMonth>(
    `SELECT year_month, scheduled_departures, cancel_rate, dep_late15_rate, avg_dep_delay_min, arrivals, arr_late15_rate,
            avg_arr_delay_min, turnarounds, median_ground_min, short_turn_share, avg_inbound_delay_min, avg_outbound_delay_min,
            propagated_delay_min, pass_through
     FROM ${t('gold_airport_month')} WHERE airport = :airport ORDER BY year_month`,
    { airport },
  );
}

export async function getHourly(p: URLSearchParams): Promise<AirportHourly> {
  const { airport } = await knownAirport(p);
  const [own, network] = await Promise.all([
    query<Omit<AirportHour, 'network_dep_late15_rate'>>(
      `SELECT dep_hour, departures, dep_late15_rate, avg_dep_delay_min FROM ${t('gold_airport_hour')} WHERE airport = :airport ORDER BY dep_hour`,
      { airport },
    ),
    query<{ dep_hour: number; rate: number | null }>(
      `SELECT dep_hour, ${w('dep_late15_rate', 'departures')} AS rate FROM ${t('gold_airport_hour')} GROUP BY dep_hour`,
    ),
  ]);
  const net = new Map(network.map((n) => [n.dep_hour, n.rate]));
  const hours = own.map((h) => ({ ...h, network_dep_late15_rate: net.get(h.dep_hour) ?? null }));
  const peak = hours.filter((h) => h.departures >= PEAK_MIN_DEPARTURES && h.dep_late15_rate !== null)
    .sort((a, b) => (b.dep_late15_rate ?? 0) - (a.dep_late15_rate ?? 0))[0];
  const caption = peak
    ? `Late rate peaks at ${String(peak.dep_hour).padStart(2, '0')}:00 (${formatPercent(peak.dep_late15_rate, 0)}).`
    : 'Not enough departures to show a peak hour.';
  return { hours, caption };
}

export async function getBuffer(p: URLSearchParams): Promise<AirportBuffer> {
  const { airport } = await knownAirport(p);
  const budget = Number(p.get('budget'));
  const months = await query<AirportBufferMonth>(
    `SELECT year_month, turnarounds, turnarounds_with_buffer, buffer_min, expected_absorbed_min, realised_absorbed_min,
            late_departures_avoided, share_with_buffer
     FROM ${t('gold_buffer_plan_airport')} WHERE airport = :airport AND budget_scenario = :budget ORDER BY year_month`,
    { airport, budget },
  );
  const sum = (k: keyof Omit<AirportBufferMonth, 'year_month' | 'share_with_buffer'>) => months.reduce((s, m) => s + (m[k] ?? 0), 0);
  const turnarounds = sum('turnarounds');
  const withBuffer = sum('turnarounds_with_buffer');
  return {
    budget,
    months,
    totals: {
      turnarounds, turnarounds_with_buffer: withBuffer, buffer_min: sum('buffer_min'),
      expected_absorbed_min: sum('expected_absorbed_min'), realised_absorbed_min: sum('realised_absorbed_min'),
      late_departures_avoided: sum('late_departures_avoided'), share_with_buffer: turnarounds ? withBuffer / turnarounds : null,
    },
  };
}

export async function getScatter(p: URLSearchParams): Promise<NetworkScatter> {
  const min = Number(p.get('min_turnarounds'));
  const airports = (await allAirports(allParams()))
    .filter((a) => (a.turnarounds ?? 0) >= min && a.median_ground_min !== null && a.avg_inbound_delay_min !== null)
    .map((a) => ({
      airport: a.airport, city: a.city, median_ground_min: a.median_ground_min!, avg_inbound_delay_min: a.avg_inbound_delay_min!,
      turnarounds: a.turnarounds ?? 0, is_top10: a.is_top10,
    }));
  const r = pearson(airports.map((a) => a.median_ground_min), airports.map((a) => a.avg_inbound_delay_min));
  return { min_turnarounds: min, airports, correlation: r, caption: scatterCaption(r, airports.length, min) };
}

export function pearson(x: number[], y: number[]): number | null {
  const n = x.length;
  if (n < 3) return null;
  const mx = x.reduce((s, v) => s + v, 0) / n;
  const my = y.reduce((s, v) => s + v, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (x[i] - mx) * (y[i] - my);
    sxx += (x[i] - mx) ** 2;
    syy += (y[i] - my) ** 2;
  }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : null;
}

/** The sentence under the scatter, with the correlation computed from the airports on the chart. */
export function scatterCaption(r: number | null, n: number, min: number): string {
  if (r === null) return 'Too few airports to compare.';
  const rText = `correlation ${r < 0 ? '−' : ''}${formatNumber(Math.abs(r), 2)} across the ${formatNumber(n)} airports with ${formatNumber(min)}+ turnarounds`;
  return r <= -0.2
    ? `Airports with more inbound delay tend to have shorter ground times (${rText}), so buffer is not where the delay is.`
    : `Inbound delay and ground time are only weakly related here (${rText}).`;
}
