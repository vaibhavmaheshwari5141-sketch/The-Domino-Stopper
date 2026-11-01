// Scenario Simulator definitions shared by the API (validation, ordering) and the React page (labels, colours).
//
// The strategies themselves come from the data (gold_sim_strategy, gold_engine_kpis): this file only knows how to
// label and order the ones it has seen before. A strategy it does not know is still shown, under its own name.

import type { EngineMode } from './kpis.ts';

export interface StrategyDef {
  /** Name as stored in gold_sim_strategy / gold_engine_kpis / gold_sim_daily. */
  name: string;
  /** Short id used in the page URL. */
  id: string;
  label: string;
  rule: string;
  mode: EngineMode;
}

/** Strategies seen in notebook 08 version 2, in display order. "No buffer" (older runs) is a reference row, never shown. */
const KNOWN: StrategyDef[] = [
  { name: 'Spread evenly', id: 'even', label: 'Spread evenly', mode: 'add', rule: 'Every turnaround gets the same extra minutes.' },
  { name: 'Shortest first', id: 'shortest', label: 'Shortest first', mode: 'add', rule: 'The maximum (30 min) goes to the shortest turnarounds until the budget runs out.' },
  { name: 'Riskiest first', id: 'riskiest', label: 'Riskiest first', mode: 'add', rule: 'The maximum goes to the turnarounds predicted to receive the latest planes.' },
  { name: 'Engine v1 (single curve)', id: 'engine-v1', label: 'Engine v1', mode: 'add', rule: 'Version 1: one pass-through curve for every turnaround and no guardrails. Shown for comparison.' },
  { name: 'Engine (our method)', id: 'engine', label: 'Engine', mode: 'add', rule: "Version 2: each block of minutes goes where it prevents the most delay across the aircraft's day, using segment curves, within the guardrails." },
  { name: 'Engine: reallocate (no added buffer)', id: 'reallocate', label: 'Engine: reallocate', mode: 'reallocate', rule: "Moves minutes from long sits (over 150 min) to risky stops within the same aircraft's day. Adds no buffer." },
  { name: 'Hindsight (not possible)', id: 'hindsight', label: 'Hindsight (ceiling)', mode: 'add', rule: 'Same as the engine but knows the real delays; an upper limit only.' },
];

export const ENGINE = 'Engine (our method)';
export const ENGINE_V1 = 'Engine v1 (single curve)';
export const REALLOCATE = 'Engine: reallocate (no added buffer)';
export const EVEN = 'Spread evenly';
export const HINDSIGHT = 'Hindsight (not possible)';
/** Reference row of older runs, never shown. */
export const NO_BUFFER = 'No buffer';

const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Label, URL id and rule for a stored strategy name; unknown names get their own name and a slug id. */
export function strategyDef(name: string, mode?: string): StrategyDef {
  return KNOWN.find((s) => s.name === name)
    ?? { name, id: slug(name), label: name, rule: '', mode: mode === 'reallocate' ? 'reallocate' : 'add' };
}

/** Sort key: known strategies in display order, unknown ones after them, alphabetically. */
export function strategyOrder(a: string, b: string): number {
  const i = KNOWN.findIndex((s) => s.name === a);
  const j = KNOWN.findIndex((s) => s.name === b);
  return (i < 0 ? KNOWN.length : i) - (j < 0 ? KNOWN.length : j) || a.localeCompare(b);
}

/** The definitions of the known strategies, for the "what the strategies do" note. */
export const KNOWN_STRATEGIES: readonly StrategyDef[] = KNOWN;

/** Strategy names in a request: letters, digits, spaces and ( ) : , . - only (checked before any SQL runs). */
export const STRATEGY_NAME = /^[A-Za-z0-9 ():.-]{1,60}$/;

export const DAY_TYPES = ['all days', 'normal days', 'disruption days'] as const;
export type DayType = (typeof DAY_TYPES)[number];

export const GROUPINGS = [
  { name: 'Inbound-risk fifth', id: 'risk', label: 'Inbound risk' },
  { name: 'Ground-time band', id: 'ground', label: 'Ground time' },
  { name: 'Airport type', id: 'type', label: 'Airport type' },
  { name: 'Airport', id: 'airports', label: 'Top airports' },
] as const;
export type GroupingName = (typeof GROUPINGS)[number]['name'];

/** Natural order of the groups (the stored text does not sort this way); unknown groups go last. */
export const GROUP_ORDER: Record<string, string[]> = {
  'Ground-time band': ['Short (up to 55)', 'Medium (56-80)', 'Long (81-120)', 'Very long (over 120)'],
  'Airport type': ['Ten busiest', 'Other airports'],
};
