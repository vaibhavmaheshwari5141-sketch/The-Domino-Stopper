// Strategy colours, the same in every simulator chart. Engine is the amber hero, engine v1 a lighter amber, Hindsight a
// hatched amber "ceiling". A strategy without a colour here is drawn in muted grey.
export const STRATEGY_COLOR: Record<string, string> = {
  even: 'var(--color-tarmac)',
  shortest: 'var(--color-muted)',
  riskiest: 'var(--color-teal)',
  'engine-v1': 'var(--color-amber-mid)',
  engine: 'var(--color-amber)',
  reallocate: 'var(--color-success)',
  hindsight: 'var(--color-amber)',
};

export const strategyColor = (id: string) => STRATEGY_COLOR[id] ?? 'var(--color-muted)';

/** The two views in charts: curve view dark, model view amber. */
export const VIEW_COLOR = { curve: 'var(--color-tarmac)', 'response model': 'var(--color-amber)' } as const;

/** SVG pattern id for the hatched Hindsight fill (each chart defines it with <HatchDefs />). */
export const HATCH_ID = 'strategy-hatch';
