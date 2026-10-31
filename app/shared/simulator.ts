// Scenario Simulator definitions shared by the API (validation, ordering) and the React page (labels, colours).

export interface StrategyDef {
  /** Name as stored in gold_sim_strategy / gold_sim_daily. */
  name: string;
  /** Short id used in the page URL. */
  id: string;
  label: string;
  rule: string;
}

/** The five strategies, in display order. "No buffer" is a reference row in the data and is never shown. */
export const STRATEGIES: StrategyDef[] = [
  { name: 'Spread evenly', id: 'even', label: 'Spread evenly', rule: 'Every turnaround gets the same extra minutes.' },
  { name: 'Shortest first', id: 'shortest', label: 'Shortest first', rule: 'The maximum (30 min) goes to the shortest turnarounds until the budget runs out.' },
  { name: 'Riskiest first', id: 'riskiest', label: 'Riskiest first', rule: 'The maximum goes to the turnarounds predicted to receive the latest planes.' },
  { name: 'Engine (our method)', id: 'engine', label: 'Engine', rule: 'Each block of minutes goes where predicted delay × absorption is largest.' },
  { name: 'Hindsight (not possible)', id: 'hindsight', label: 'Hindsight (ceiling)', rule: 'Same as the engine but knows the real delays; an upper limit only.' },
];

export const ENGINE = 'Engine (our method)';
export const EVEN = 'Spread evenly';
export const HINDSIGHT = 'Hindsight (not possible)';
export const STRATEGY_NAMES = STRATEGIES.map((s) => s.name);

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

export const strategyDef = (name: string): StrategyDef | undefined => STRATEGIES.find((s) => s.name === name);
