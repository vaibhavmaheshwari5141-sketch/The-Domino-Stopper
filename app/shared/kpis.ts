// Engine v2 KPI definitions shared by the API (validation, net value) and the React page (labels, help text).
//
// Every buffer result exists in two views that disagree on size, so results are shown as a range (curve view to model
// view) or for one named view. gold_engine_kpis holds one row per view: always filter or group by `evaluator`, or the
// two views are counted twice.

export const EVALUATORS = ['curve', 'response model'] as const;
export type Evaluator = (typeof EVALUATORS)[number];
export type EvaluatorChoice = Evaluator | 'both';

export const EVALUATOR_LABEL: Record<Evaluator, string> = { curve: 'Curve view', 'response model': 'Model view' };

export const VIEW_HELP = {
  curve: 'Curve view: scored with the measured pass-through curves (how much inbound delay each planned ground time passes on).',
  model: 'Model view: scored with a separate outbound-delay model that also sees turnarounds planned shorter than a turn really needs.',
  range: 'The two views disagree on size, so results are shown as a range from the curve view to the model view.',
} as const;

export const MAIN_KPI_HELP = "Main KPI: delay prevented per 100 buffer minutes, counted across the aircraft's whole day (the domino effect included).";

export const ENGINE_MODES = ['add', 'reallocate'] as const;
export type EngineMode = (typeof ENGINE_MODES)[number];

export const MODE_LABEL: Record<EngineMode, string> = { add: 'Add buffer', reallocate: 'Reallocate (no added buffer)' };
export const MODE_HELP: Record<EngineMode, string> = {
  add: 'Add: new minutes on top of the schedule. They cost money.',
  reallocate: "Reallocate: move minutes from long sits (over 150 min) to risky stops within the same aircraft's day. Adds nothing.",
};

export const NET_VALUE_HELP = 'Net value = delay prevented × cost per delay minute − buffer added × cost per buffer minute.';
export const NEGATIVE_HELP = 'A negative value is a real result, not an error: at these costs the buffer costs more than the delay it prevents.';
export const ESTIMATE_HELP = "Replays what really happened through the aircraft's day. Estimates, not measured savings.";

/** gold_cost_assumptions settings the page reads as numbers. */
export const COST_SETTINGS = {
  delay: 'cost_delay_min_usd',
  buffer: 'cost_buffer_min_usd',
  airportCap: 'airport_cap_share',
  eligible: 'eligible_ground_time_min',
} as const;

/** Accepted range for the cost inputs, in US dollars per minute. */
export const COST_LIMITS = { min: 0, max: 500 } as const;

/** prevented × cost per delay minute − buffer added × cost per buffer minute. Reallocation adds nothing, so costs nothing. */
export function netValue(preventedMin: number, netAddedMin: number, costDelay: number, costBuffer: number): number {
  return preventedMin * costDelay - Math.max(netAddedMin, 0) * costBuffer;
}

/**
 * The cost per buffer minute at which adding buffer stops paying: prevented × cost per delay minute ÷ minutes added.
 * Null when nothing is added (reallocation has no buffer cost to break even against).
 */
export function breakEvenBufferCost(preventedMin: number, addedMin: number, netAddedMin: number, costDelay: number): number | null {
  return netAddedMin > 0 && addedMin > 0 ? (preventedMin * costDelay) / addedMin : null;
}

/** "20-150" -> [20, 150] */
export function parseRange(text: string | null | undefined): [number, number] | null {
  const m = /(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)/.exec(text ?? '');
  return m ? [Number(m[1]), Number(m[2])] : null;
}

// ---- KPI catalogue ---------------------------------------------------------------------------------------------------

/** Display order of gold_kpi_catalog groups; anything else follows in the order it comes. */
export const CATALOG_ENGINES = ['Prediction engine', 'Buffer engine'];
export const CATALOG_LEVELS = ['Main', 'Model quality', 'Outcome', 'Money', 'Robustness', 'Guardrail'];
