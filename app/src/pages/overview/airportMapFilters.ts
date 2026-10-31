// Filters, bubble sizing and KPI totals for the Overview airport map. Period and budget go to the API (the score is
// recomputed for the period); airport group, minimum departures and bubble size apply in the browser.
// Imports come from shared/ (not src/lib) so the tests can load this file outside the browser.
import type { AirportImpact } from '../../../shared/api-types';
import { formatMinutes, formatNumber, formatPercent } from '../../../shared/format';

export type AirportGroup = 'all' | 'top10' | 'other';
export type SizeBy = 'impact_score' | 'late_departure_rate' | 'propagated_delay_min' | 'realised_absorbed_min';

export interface MapFilters {
  from: string | null;          // first month ("2026-01"), null for the earliest
  to: string | null;            // last month, null for the latest
  budget: number;               // extra minutes per turnaround behind the engine figures
  group: AirportGroup;
  minDepartures: number;
  sizeBy: SizeBy;
}

export const defaultFilters = (budget: number): MapFilters => ({
  from: null, to: null, budget, group: 'all', minDepartures: 0, sizeBy: 'impact_score',
});

export const GROUPS: { value: AirportGroup; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'top10', label: 'Ten busiest' },
  { value: 'other', label: 'Others' },
];

export const MIN_DEPARTURES: { value: number; label: string }[] = [
  { value: 0, label: 'Any' },
  { value: 1000, label: '1K+' },
  { value: 10000, label: '10K+' },
];

export const SIZE_BY: { value: SizeBy; label: string; format: (v: number | null) => string }[] = [
  { value: 'impact_score', label: 'Impact score', format: (v) => formatNumber(v) },
  { value: 'late_departure_rate', label: 'Late departures', format: (v) => formatPercent(v) },
  { value: 'propagated_delay_min', label: 'Knock-on delay', format: (v) => formatMinutes(v) },
  { value: 'realised_absorbed_min', label: 'Delay absorbed', format: (v) => formatMinutes(v) },
];

export function applyFilters(airports: AirportImpact[], f: MapFilters): AirportImpact[] {
  return airports.filter((a) => (f.group === 'all' || (f.group === 'top10') === a.is_top10) && (a.departures ?? 0) >= f.minDepartures);
}

/** Bubble radius in pixels: area grows with the value, scaled to the largest value shown (the score to 100). */
export function radiusScale(airports: AirportImpact[], sizeBy: SizeBy): (a: AirportImpact) => number {
  const max = sizeBy === 'impact_score' ? 100 : Math.max(0, ...airports.map((a) => a[sizeBy] ?? 0));
  return (a) => {
    const v = a[sizeBy] ?? 0;
    return max > 0 ? Math.max(3, 17 * Math.sqrt(Math.max(0, v) / max)) : 3;
  };
}

export interface MapTotals {
  airports: number;
  high: number;
  departures: number;
  late_departure_rate: number | null;     // weighted by departures
  knock_on_min: number;
  knock_on_per_turn_min: number | null;
  buffer_min: number | null;              // null when no airport shown has an engine plan for the period
  absorbed_min: number | null;
  late_avoided: number | null;
}

export function totals(airports: AirportImpact[]): MapTotals {
  let departures = 0, lateWeighted = 0, lateWeight = 0, knockOn = 0, turns = 0, high = 0;
  let buffer: number | null = null, absorbed: number | null = null, avoided: number | null = null;
  const add = (sum: number | null, v: number | null) => (v === null ? sum : (sum ?? 0) + v);
  for (const a of airports) {
    departures += a.departures ?? 0;
    if (a.late_departure_rate !== null && a.departures) {
      lateWeighted += a.late_departure_rate * a.departures;
      lateWeight += a.departures;
    }
    knockOn += a.propagated_delay_min ?? 0;
    turns += a.turnarounds ?? 0;
    if (a.impact_band === 'High') high++;
    buffer = add(buffer, a.buffer_min);
    absorbed = add(absorbed, a.realised_absorbed_min);
    avoided = add(avoided, a.late_departures_avoided);
  }
  return {
    airports: airports.length,
    high,
    departures,
    late_departure_rate: lateWeight > 0 ? lateWeighted / lateWeight : null,
    knock_on_min: knockOn,
    knock_on_per_turn_min: turns > 0 ? knockOn / turns : null,
    buffer_min: buffer,
    absorbed_min: absorbed,
    late_avoided: avoided,
  };
}
