// Input Data page wording. Edit freely: the descriptions of the input sample tables, the group titles, and which page
// of this platform each gold_table_catalog page number stands for.
// The API (server/routes/datasets.ts) reads this file too, so it must stay free of imports.

export const GROUP_TITLES = {
  input: 'Input tables (samples)',
  gold: 'Output tables (gold)',
} as const;

/** Keyed by the input table name, without the `sample_` prefix. */
export const INPUT_DESCRIPTIONS: Record<string, string> = {
  aa_clean: 'Cleaned American Airlines mainline flights, one row per flight (D2 output, version data-v1.0).',
  rotations: "Each aircraft's sequence of flights per day.",
  rotation_turns: 'The ground stops between consecutive flights of the same aircraft.',
  rotation_breaks: "Places where an aircraft's chain of flights breaks (for example a gap, an airport mismatch or a cancellation).",
  mtt_estimates: 'Estimated minimum turnaround time.',
  mtt_sensitivity: 'How results change with the minimum-turnaround estimate.',
  rotation_reconciliation: 'Checks that the rotation tables add up.',
  rotation_rule_comparison: 'Comparison of the rules tried for breaking chains.',
  airports_tz: 'Airports with their time zones and coordinates.',
};

export const INPUT_FALLBACK_DESCRIPTION = 'Sample of an input table used by the project.';

export const CATALOG_DESCRIPTION = 'Describes every other gold table.';

/** Page numbers in gold_table_catalog.dashboard_page ("3 Airport risk", "6 Simulator; 6a") and the page they mean here. */
export const CATALOG_PAGES: Record<string, { path: string; title: string }> = {
  '1': { path: '/overview', title: 'Overview' },
  '2': { path: '/overview', title: 'Overview' },
  '3': { path: '/airport-insights', title: 'Airport Insights' },
  '4': { path: '/delay-propagation', title: 'Delay Propagation' },
  '5': { path: '/risk-forecast', title: 'Risk Forecast' },
  '6': { path: '/scenario-simulator', title: 'Scenario Simulator' },
  '6a': { path: '/buffer-planner', title: 'Buffer Planner' },
};
