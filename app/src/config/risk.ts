// Risk band colours (prediction engine): chip and dot classes, built from the semantic tokens.
export const RISK_CHIP: Record<string, string> = {
  High: 'bg-critical-soft text-critical',
  Medium: 'bg-warning-soft text-warning',
  Low: 'bg-success-soft text-success',
};

export const RISK_DOT: Record<string, string> = { High: 'bg-critical', Medium: 'bg-warning', Low: 'bg-success' };
