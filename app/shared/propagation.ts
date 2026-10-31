// Delay Propagation helpers shared by the API and the page: the "extra ground time" calculator and band labels.

import { formatPercent } from './format.ts';
import { type CurvePoint, passThroughAt } from './planner.ts';

/** Calculator inputs are clamped to these ranges (minutes). */
export const CALC_LIMITS = {
  ground_min: { min: 0, max: 300, fallback: 60 },
  inbound_delay_min: { min: 0, max: 300, fallback: 30 },
  extra_min: { min: 0, max: 60, fallback: 15 },
} as const;

export interface AbsorptionInput {
  ground_min: number;
  inbound_delay_min: number;
  extra_min: number;
}

export interface AbsorptionResult extends AbsorptionInput {
  new_ground_min: number;
  pass_through_now: number;
  pass_through_after: number;
  delay_passed_on_now: number;
  delay_passed_on_after: number;
  /** inbound delay × (pass-through now − pass-through after) */
  delay_absorbed: number;
  sentence: string;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** What adding `extra_min` of ground time does to one turnaround, read off the smoothed curve (linear between points). */
export function calculateAbsorption(curve: CurvePoint[], input: AbsorptionInput): AbsorptionResult {
  const L = CALC_LIMITS;
  const ground = clamp(input.ground_min, L.ground_min.min, L.ground_min.max);
  const inbound = clamp(input.inbound_delay_min, L.inbound_delay_min.min, L.inbound_delay_min.max);
  const extra = clamp(input.extra_min, L.extra_min.min, L.extra_min.max);
  const after = ground + extra;
  const now = passThroughAt(curve, ground) ?? 1;
  const later = passThroughAt(curve, after) ?? now;
  const pct = (v: number) => formatPercent(v, 0);
  const sentence = extra === 0
    ? `Without extra buffer, this ${ground}-minute turnaround passes on ${pct(now)} of the delay.`
    : `Moving this turnaround from ${ground} to ${after} minutes passes on ${pct(later)} of the delay instead of ${pct(now)}.`;
  return {
    ground_min: ground,
    inbound_delay_min: inbound,
    extra_min: extra,
    new_ground_min: after,
    pass_through_now: now,
    pass_through_after: later,
    delay_passed_on_now: inbound * now,
    delay_passed_on_after: inbound * later,
    delay_absorbed: inbound * (now - later),
    sentence,
  };
}

/** Minutes covered by a ground-time band label: "up to 30", "31-40", "over 240", "Short (up to 55)", "Medium (56-80)". */
export function bandRange(label: string): [number, number] | null {
  const upTo = /up to (\d+)/i.exec(label);
  if (upTo) return [0, Number(upTo[1])];
  const over = /over (\d+)/i.exec(label);
  if (over) return [Number(over[1]) + 1, Infinity];
  const range = /(\d+)\s*-\s*(\d+)/.exec(label);
  return range ? [Number(range[1]), Number(range[2])] : null;
}

/** Index of the band holding `minutes` (whole minutes, so 62.9 falls in "61-65"), or -1. */
export function bandIndexFor(labels: string[], minutes: number): number {
  const m = Math.round(minutes);
  return labels.findIndex((l) => {
    const r = bandRange(l);
    return r !== null && m >= r[0] && m <= r[1];
  });
}
