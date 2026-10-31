// The delay impact score behind the Overview airport map (pure functions, no data source).
import { describe, expect, it } from 'vitest';
import { airportImpactParams, percentileRanks, scoreAirports } from '../server/routes/overview.ts';
import { applyFilters, defaultFilters, radiusScale, totals } from '../src/pages/overview/airportMapFilters.ts';

type Input = Parameters<typeof scoreAirports>[0][number];

function airport(code: string, late: number | null, perTurn: number | null, knockOn: number | null, departures = 1000): Input {
  return {
    airport: code, name: null, city: null, state: null, lat: 30, lon: -90, departure_rank: null, is_top10: false,
    departures, turnarounds: 800, late_departure_rate: late, late_arrival_rate: null, avg_dep_delay_min: null, cancel_rate: null,
    short_turn_share: null, propagated_delay_min: knockOn, knock_on_per_turn_min: perTurn,
    buffer_min: null, realised_absorbed_min: null, late_departures_avoided: null,
  };
}

describe('percentileRanks', () => {
  it('ranks from 0 to 1, shares ties and skips missing values', () => {
    expect(percentileRanks([30, 10, null, 20, 20])).toEqual([1, 0, null, 0.5, 0.5]);
  });

  it('gives a lone value the middle rank', () => {
    expect(percentileRanks([null, 7])).toEqual([null, 0.5]);
  });
});

describe('scoreAirports', () => {
  it('scores 100 for the worst on every measure and 0 for the best, with bands and ranks', () => {
    const out = scoreAirports([airport('MID', 0.2, 10, 200), airport('BAD', 0.4, 20, 700), airport('OK', 0.1, 5, 100)]);
    const by = Object.fromEntries(out.map((a) => [a.airport, a]));
    expect(by.BAD).toMatchObject({ impact_score: 100, impact_band: 'High', impact_rank: 1, network_knock_on_share: 0.7 });
    expect(by.MID).toMatchObject({ impact_score: 50, impact_band: 'Medium', impact_rank: 2 });
    expect(by.OK).toMatchObject({ impact_score: 0, impact_band: 'Low', impact_rank: 3 });
  });

  it('rescales the weights when a measure is missing, and leaves an airport with no measures unscored', () => {
    const out = scoreAirports([airport('A', 0.4, null, null), airport('B', 0.1, null, null), airport('C', null, null, null)]);
    expect(out.map((a) => a.impact_score)).toEqual([100, 0, null]);
    expect(out[2]).toMatchObject({ impact_band: null, impact_rank: null });
  });

  it('breaks a tied score by departures', () => {
    const out = scoreAirports([airport('SMALL', 0.3, 10, 100, 50), airport('BIG', 0.3, 10, 100, 5000)]);
    expect(out.find((a) => a.airport === 'BIG')?.impact_rank).toBe(1);
  });
});

describe('airportImpactParams', () => {
  const parse = (q: string) => Object.fromEntries(airportImpactParams(new URLSearchParams(q)));

  it('defaults the budget and keeps a valid month range', () => {
    expect(parse('')).toEqual({ budget: '5' });
    expect(parse('budget=10&from=2026-01&to=2026-08')).toEqual({ budget: '10', from: '2026-01', to: '2026-08' });
  });

  it('refuses a malformed month or a range that runs backwards', () => {
    expect(() => parse('from=2026-13')).toThrow(/month like/);
    expect(() => parse("to=2026-01' OR 1=1")).toThrow(/month like/);
    expect(() => parse('from=2026-05&to=2026-01')).toThrow(/not be after/);
  });
});

describe('map filters and totals', () => {
  const hub = { ...scoreAirports([airport('HUB', 0.4, 10, 900, 20000)])[0], is_top10: true, buffer_min: 100, realised_absorbed_min: 30, late_departures_avoided: 2 };
  const spoke = { ...scoreAirports([airport('SPK', 0.1, 5, 100, 500)])[0], is_top10: false };

  it('filters by airport group and minimum departures', () => {
    const all = [hub, spoke];
    expect(applyFilters(all, { ...defaultFilters(5), group: 'top10' }).map((a) => a.airport)).toEqual(['HUB']);
    expect(applyFilters(all, { ...defaultFilters(5), group: 'other' }).map((a) => a.airport)).toEqual(['SPK']);
    expect(applyFilters(all, { ...defaultFilters(5), minDepartures: 1000 }).map((a) => a.airport)).toEqual(['HUB']);
  });

  it('weights the late rate by departures and leaves engine totals empty when no airport has a plan', () => {
    const k = totals([hub, spoke]);
    expect(k.departures).toBe(20500);
    expect(k.late_departure_rate).toBeCloseTo((0.4 * 20000 + 0.1 * 500) / 20500);
    expect(k.knock_on_min).toBe(1000);
    expect(k.absorbed_min).toBe(30);
    expect(totals([spoke]).absorbed_min).toBeNull();
  });

  it('sizes bubbles against the largest value shown', () => {
    const r = radiusScale([hub, spoke], 'propagated_delay_min');
    expect(r(hub)).toBe(17);
    expect(r(spoke)).toBeCloseTo(17 / 3);
  });
});
