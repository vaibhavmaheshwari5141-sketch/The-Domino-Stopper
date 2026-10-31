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

// gold_buffer_recommendation.reason_code values (notebook 08) -> short label and sentence
const REASONS: [match: string, info: ReasonInfo][] = [
  ['likely late arrival', { short: 'Absorbs delay', added: true, sentence: 'Buffer added: the aircraft is likely to arrive late and this ground time already absorbs delay, so every extra minute counts.' }],
  ['reach the range', { short: 'Reaches absorbing range', added: true, sentence: 'Buffer added: the extra minutes lift the ground time into the range where delay starts to be absorbed.' }],
  ['too short', { short: 'Too short to help', added: false, sentence: 'No buffer: the turnaround is too short, so a few extra minutes would absorb almost nothing.' }],
  ['low inbound risk', { short: 'Low risk', added: false, sentence: 'No buffer: the inbound aircraft is unlikely to be late.' }],
  ['more value per minute', { short: 'Lower value than others', added: false, sentence: 'No buffer: the budget was used on turnarounds where each minute absorbs more delay.' }],
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
