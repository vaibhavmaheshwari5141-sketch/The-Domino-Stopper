// Aircraft Day endpoints (/api/aircraft-day...): one aircraft's day as a chain of flights and turnarounds.
// The chain is built only from the stored turnarounds: when two stops do not connect, the response marks a break
// rather than inventing the missing flight.

import type { AircraftDay, AircraftFlight, AircraftListResponse, AircraftSummary, AircraftTurn, ChainItem } from '../../shared/api-types.ts';
import { formatDayLong, formatNumber } from '../../shared/format.ts';
import { PLANNER_BUDGETS, flightNo, reasonInfo } from '../../shared/planner.ts';
import { cached } from '../cache.ts';
import { MAIN_BUDGET } from './planner.ts';
import { query, t } from '../db.ts';
import { HttpError } from '../http.ts';
import { airportCode, intInRange, isoDate, oneOfNumber, optionalTailNumber, searchText, tailNumber } from '../params.ts';

const DEFAULT_BUDGET = 5;
const RISK_ORDER: Record<string, number> = { High: 3, Medium: 2, Low: 1 };

const normalised = (values: object) =>
  new URLSearchParams(Object.entries(values).filter(([, v]) => v !== null).map(([k, v]) => [k, String(v)]));
const budgetParam = (p: URLSearchParams) => oneOfNumber(p, 'budget', PLANNER_BUDGETS, DEFAULT_BUDGET);

export const listParams = (p: URLSearchParams) => normalised({
  date: isoDate(p, 'date'), budget: budgetParam(p), airport: airportCode(p), search: searchText(p), limit: intInRange(p, 'limit', 1, 200, 50),
  selected: optionalTailNumber(p, 'selected'),
});
export const dayParams = (p: URLSearchParams) => normalised({ tail: tailNumber(p), date: isoDate(p, 'date'), budget: budgetParam(p) });

// ---- aircraft list -------------------------------------------------------------------------------------------------

interface DayRow {
  tail_number: string;
  airport: string;
  inbound_from: string | null;
  outbound_to: string | null;
  sched_outbound_dep_utc: string | null;
  risk_band: string | null;
  actual_outbound_delay_min: number | null;
  recommended_extra_min: number | null;
}

// One query per day and budget (about 1,500 small rows), shared by every airport / search / limit combination.
// Cached for 10 minutes (the default CACHE_TTL_SECONDS), like the route results built from it.
const dayRows = cached('aircraft-day/day-rows', 600, async (p: URLSearchParams) =>
  query<DayRow>(
    `SELECT p.tail_number, p.airport, p.inbound_from, p.outbound_to, p.sched_outbound_dep_utc, p.risk_band, p.actual_outbound_delay_min,
            r.recommended_extra_min
     FROM ${t('gold_ml_predictions')} p
     LEFT JOIN ${t('gold_buffer_recommendation')} r
       ON r.turn_id = p.turn_id AND r.flight_date = CAST(:date AS DATE) AND r.budget_scenario = :budget
     WHERE p.flight_date = CAST(:date AS DATE) AND p.tail_number IS NOT NULL
     ORDER BY p.tail_number, p.sched_outbound_dep_utc`,
    { date: p.get('date')!, budget: Number(p.get('budget')) },
  ));

export async function getAircraftList(p: URLSearchParams): Promise<AircraftListResponse> {
  const airport = p.get('airport');
  const search = p.get('search');
  const rows = await dayRows(new URLSearchParams({ date: p.get('date')!, budget: p.get('budget')! }));

  const byTail = new Map<string, DayRow[]>();
  for (const r of rows) byTail.set(r.tail_number, [...(byTail.get(r.tail_number) ?? []), r]);

  const all: AircraftSummary[] = [];
  for (const [tail, turns] of byTail) {
    if (search && !tail.includes(search)) continue;
    if (airport && !turns.some((r) => r.airport === airport)) continue;
    const breaks = turns.slice(1).filter((r, i) => turns[i].outbound_to !== r.airport).length;
    const bands = turns.map((r) => r.risk_band ?? 'Unknown');
    all.push({
      tail_number: tail,
      turnarounds: turns.length,
      flights: turns.length + 1 + breaks,
      risk_bands: bands,
      highest_risk: bands.reduce<string | null>((best, b) => ((RISK_ORDER[b] ?? 0) > (RISK_ORDER[best ?? ''] ?? 0) ? b : best), null),
      buffer_min: turns.reduce((s, r) => s + (r.recommended_extra_min ?? 0), 0),
      buffered_turnarounds: turns.filter((r) => (r.recommended_extra_min ?? 0) > 0).length,
      first_airport: turns[0].inbound_from,
      last_airport: turns[turns.length - 1].outbound_to,
      any_late_departure: turns.some((r) => (r.actual_outbound_delay_min ?? 0) >= 15),
    });
  }
  all.sort((a, b) => b.buffer_min - a.buffer_min || b.turnarounds - a.turnarounds || a.tail_number.localeCompare(b.tail_number));
  // The selected aircraft is always listed (at the end when it falls outside the limit), so it can be highlighted
  const shown = all.slice(0, Number(p.get('limit')));
  const selected = p.get('selected');
  const extra = selected && !shown.some((a) => a.tail_number === selected) ? all.find((a) => a.tail_number === selected) : undefined;
  return { aircraft: extra ? [...shown, extra] : shown, total: all.length };
}

// ---- one aircraft's day --------------------------------------------------------------------------------------------

export async function getAircraftDay(p: URLSearchParams): Promise<AircraftDay> {
  const tail = p.get('tail')!;
  const date = p.get('date')!;
  const budget = Number(p.get('budget'));

  const turns = await query<AircraftTurn>(
    `SELECT p.turn_id, p.airport, p.inbound_from, p.outbound_to, p.inbound_flight_no, p.outbound_flight_no, p.sched_inbound_arr_utc,
            p.sched_outbound_dep_utc, p.sched_ground_min, COALESCE(p.very_short_turn_flag, FALSE) AS very_short_turn_flag, p.leg_of_day,
            COALESCE(p.is_disruption_day, FALSE) AS is_disruption_day, p.p_late15, p.pred_inbound_delay_min, p.risk_band,
            p.actual_inbound_delay_min, p.actual_outbound_delay_min, p.actual_late15,
            COALESCE(r.recommended_extra_min, 0) AS recommended_extra_min, r.new_ground_min, r.expected_absorbed_min,
            r.realised_absorbed_min, COALESCE(r.late_avoided_flag, FALSE) AS late_avoided_flag, r.reason_code, r.day_rank,
            r.chain_multiplier, COALESCE(r.protects_later_flights, FALSE) AS protects_later_flights,
            g.change_min AS realloc_change_min, g.expected_change_min AS realloc_expected_change_min,
            g.realised_absorbed_min AS realloc_realised_min
     FROM ${t('gold_ml_predictions')} p
     LEFT JOIN ${t('gold_buffer_recommendation')} r
       ON r.turn_id = p.turn_id AND r.flight_date = CAST(:date AS DATE) AND r.budget_scenario = :budget
     LEFT JOIN ${t('gold_buffer_reallocation')} g
       ON g.turn_id = p.turn_id AND g.flight_date = CAST(:date AS DATE) AND g.budget_scenario = :main_budget
     WHERE p.flight_date = CAST(:date AS DATE) AND p.tail_number = :tail
     ORDER BY p.sched_outbound_dep_utc, p.turn_id`,
    { tail, date, budget, main_budget: MAIN_BUDGET },
  );
  if (!turns.length) {
    throw new HttpError(404, `${tail} has no turnarounds on ${formatDayLong(date)}. It may not have flown that day, or flew only one leg. Pick another aircraft or day.`);
  }

  const { flights, chain, breaks } = buildChain(turns);
  const buffered = turns.filter((x) => x.recommended_extra_min > 0);
  return {
    tail_number: tail,
    date,
    budget,
    is_disruption_day: turns.some((x) => x.is_disruption_day),
    flights,
    turnarounds: turns,
    chain,
    breaks,
    totals: {
      turnarounds: turns.length,
      buffered_turnarounds: buffered.length,
      buffer_min: buffered.reduce((s, x) => s + x.recommended_extra_min, 0),
      expected_absorbed_min: turns.reduce((s, x) => s + (x.expected_absorbed_min ?? 0), 0),
      realised_absorbed_min: turns.reduce((s, x) => s + (x.realised_absorbed_min ?? 0), 0),
      late_departures_avoided: turns.filter((x) => x.late_avoided_flag).length,
    },
    plan_sentence: planSentence(tail, turns),
    reallocation: reallocationTotals(tail, turns),
  };
}

/** The reallocation plan for the aircraft: minutes moved, stops involved, and one sentence. */
export function reallocationTotals(tail: string, turns: AircraftTurn[]): AircraftDay['reallocation'] {
  const receives = turns.filter((x) => (x.realloc_change_min ?? 0) > 0);
  const gives = turns.filter((x) => (x.realloc_change_min ?? 0) < 0);
  const moved = receives.reduce((s, x) => s + (x.realloc_change_min ?? 0), 0);
  const expected = turns.reduce((s, x) => s + (x.realloc_expected_change_min ?? 0), 0);
  const at = (xs: AircraftTurn[]) => [...new Set(xs.map((x) => x.airport))].join(', ');
  const sentence = moved === 0
    ? `Reallocation leaves ${tail} as planned today: it has no long sit to take minutes from, or no risky stop to give them to.`
    : `Reallocation moves ${formatNumber(moved)} minutes from the long sit${gives.length > 1 ? 's' : ''} at ${at(gives)} to `
      + `${receives.length > 1 ? 'the risky stops' : 'the risky stop'} at ${at(receives)}, adding nothing to the day `
      + `(expected change in delay prevented: ${expected > 0 ? '+' : ''}${formatNumber(expected, 1)} min).`;
  return { budget: MAIN_BUDGET, minutes_moved: moved, receiving: receives.length, giving: gives.length, expected_change_min: expected, sentence };
}

/**
 * Flights and the drawing order. The day starts with the first stop's inbound flight; each stop's outbound flight
 * follows. When a stop's outbound flight does not land where the next stop is, a break is marked and the next stop's
 * own inbound flight is shown after it (both flights are real; the missing link between them is not drawn).
 */
export function buildChain(turns: AircraftTurn[]): { flights: AircraftFlight[]; chain: ChainItem[]; breaks: number } {
  const flights: AircraftFlight[] = [];
  const chain: ChainItem[] = [];
  let breaks = 0;
  const inbound = (k: number): AircraftFlight => ({
    flight_no: turns[k].inbound_flight_no, from: turns[k].inbound_from, to: turns[k].airport,
    sched_dep_utc: null, sched_arr_utc: turns[k].sched_inbound_arr_utc,
    dep_delay_min: null, arr_delay_min: turns[k].actual_inbound_delay_min, departs_turn: null, arrives_turn: k,
  });
  const addFlight = (f: AircraftFlight) => chain.push({ type: 'flight', index: flights.push(f) - 1 });

  addFlight(inbound(0));
  turns.forEach((turn, k) => {
    chain.push({ type: 'turnaround', index: k });
    const next = turns[k + 1];
    const connected = next !== undefined && turn.outbound_to === next.airport;
    addFlight({
      flight_no: turn.outbound_flight_no, from: turn.airport, to: turn.outbound_to,
      sched_dep_utc: turn.sched_outbound_dep_utc, sched_arr_utc: connected ? next.sched_inbound_arr_utc : null,
      dep_delay_min: turn.actual_outbound_delay_min, arr_delay_min: connected ? next.actual_inbound_delay_min : null,
      departs_turn: k, arrives_turn: connected ? k + 1 : null,
    });
    if (next && !connected) {
      breaks += 1;
      chain.push({ type: 'break', arrived_at: turn.outbound_to, next_airport: next.airport });
      addFlight(inbound(k + 1));
    }
  });
  return { flights, chain, breaks };
}

const NO_BUFFER_WHY: Record<string, string> = {
  'Lower value than others': 'the same minutes prevent more delay on other aircraft',
  'Long sit (over 150 min)': 'its stops are long sits, outside the planning range',
  'Airport share reached': 'its airports already have their daily share of the buffer',
  'Very short turn': 'its stops are very short turns, usually aircraft swaps',
  'Prevents almost nothing': 'extra minutes would prevent almost no delay',
};

/** One or two plain sentences about where (and why) the engine adds buffer on this aircraft. */
export function planSentence(tail: string, turns: AircraftTurn[]): string {
  const added = turns.filter((x) => x.recommended_extra_min > 0);
  if (!added.length) {
    const counts = new Map<string, number>();
    for (const x of turns) {
      const short = reasonInfo(x.reason_code).short;
      counts.set(short, (counts.get(short) ?? 0) + 1);
    }
    const top = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0];
    return `The engine adds no buffer to ${tail} today${top && NO_BUFFER_WHY[top] ? `: ${NO_BUFFER_WHY[top]}` : ''}.`;
  }
  const where = (x: AircraftTurn) => `${formatNumber(x.recommended_extra_min)} minutes at ${x.airport} before ${flightNo(x.outbound_flight_no)}`;
  if (added.length === 1) {
    const x = added[0];
    const why = reasonInfo(x.reason_code).short === 'Stop shorter than needed'
      ? 'where the planned stop is shorter than a turn usually needs'
      : 'where a late arrival is likely and extra minutes can absorb it';
    return `The engine adds ${where(x)}, ${why}.`;
  }
  const total = added.reduce((s, x) => s + x.recommended_extra_min, 0);
  const parts = added.map(where);
  const list = `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
  return `The engine adds ${formatNumber(total)} minutes in total: ${list}. These are the stops where extra ground time prevents the most delay across the day.`;
}
