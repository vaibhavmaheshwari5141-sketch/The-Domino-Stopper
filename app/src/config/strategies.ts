// Strategy colours, the same in every simulator chart. Engine is the amber hero; Hindsight is a hatched amber "ceiling".
export const STRATEGY_COLOR: Record<string, string> = {
  even: 'var(--color-tarmac)',
  shortest: 'var(--color-muted)',
  riskiest: 'var(--color-teal)',
  engine: 'var(--color-amber)',
  hindsight: 'var(--color-amber)',
};

/** SVG pattern id for the hatched Hindsight fill (each chart defines it with <HatchDefs />). */
export const HATCH_ID = 'strategy-hatch';
