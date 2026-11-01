// Buffer Planner definitions shared by the API (validation, text) and the React page (controls, labels).

export const PLANNER_BUDGETS = [2, 5, 10, 15] as const;
export const RISK_BANDS = ['High', 'Medium', 'Low'] as const;
export const SHOW_OPTIONS = ['all', 'buffered', 'not_buffered'] as const;
export const SORT_FIELDS = [
  'day_rank', 'recommended_extra_min', 'expected_absorbed_min', 'p_late15', 'pred_inbound_delay_min',
  'sched_outbound_dep_utc', 'current_ground_min',
] as const;
export const PAGE_SIZES = [25, 50, 100] as const;
export const EXPORT_MAX_ROWS = 5000;

export type PlannerBudget = (typeof PLANNER_BUDGETS)[number];
export type RiskBand = (typeof RISK_BANDS)[number];
export type ShowOption = (typeof SHOW_OPTIONS)[number];
export type SortField = (typeof SORT_FIELDS)[number];

export interface ReasonInfo {
  short: string;
  added: boolean;
  /** The reason as a sentence, for the detail drawer. */
  sentence: string;
}

// gold_buffer_recommendation.reason_code values (notebook 08 version 2) -> short label and sentence
const REASONS: [match: string, info: ReasonInfo][] = [
  ['shorter than a turn usually needs', { short: 'Stop shorter than needed', added: true, sentence: 'Buffer added: the planned stop is shorter than a turn usually needs, so extra minutes prevent delay here and on later flights.' }],
  ['likely late arrival', { short: 'Late arrival to absorb', added: true, sentence: 'Buffer added: the aircraft is likely to arrive late and extra minutes here can absorb that delay before it reaches later flights.' }],
  ['prevent more per minute', { short: 'Lower value than others', added: false, sentence: 'No buffer: the budget was used on turnarounds where each minute prevents more delay.' }],
  ['long sit', { short: 'Long sit (over 150 min)', added: false, sentence: 'No buffer: the aircraft sits on the ground for over 150 minutes, outside the planning range.' }],
  ['daily share', { short: 'Airport share reached', added: false, sentence: "No buffer: this airport already has its daily share of the buffer (at most 20% of a day's buffer goes to one airport)." }],
  ['very short turn', { short: 'Very short turn', added: false, sentence: 'No buffer: very short turns (under 20 min) are usually aircraft swaps, not real turns.' }],
  ['prevent almost nothing', { short: 'Prevents almost nothing', added: false, sentence: 'No buffer: extra minutes here would prevent almost no delay.' }],
];

export function reasonInfo(code: string | null | undefined): ReasonInfo {
  const text = code ?? '';
  const hit = REASONS.find(([match]) => text.toLowerCase().includes(match));
  if (hit) return hit[1];
  const added = text.startsWith('Added');
  return { short: text.replace(/^(Added|None):\s*/, '') || 'No reason given', added, sentence: text || 'No reason given.' };
}

export interface CurvePoint {
  ground_min: number;
  pass_through: number;
}

/** Share of inbound delay passed on at a given planned ground time (linear between curve points, flat beyond the ends). */
export function passThroughAt(curve: CurvePoint[], ground: number | null | undefined): number | null {
  if (!curve.length || ground === null || ground === undefined || !Number.isFinite(ground)) return null;
  if (ground <= curve[0].ground_min) return curve[0].pass_through;
  for (let i = 1; i < curve.length; i++) {
    const a = curve[i - 1];
    const b = curve[i];
    if (ground <= b.ground_min) return a.pass_through + ((ground - a.ground_min) / (b.ground_min - a.ground_min)) * (b.pass_through - a.pass_through);
  }
  return curve[curve.length - 1].pass_through;
}

/** "AA2718" */
export const flightNo = (n: number | null | undefined) => (n === null || n === undefined ? '–' : `AA${n}`);
