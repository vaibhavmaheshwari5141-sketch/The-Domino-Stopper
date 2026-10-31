/** Light teal (low) → amber → critical red (high), mixed from the design tokens. t is 0..1. */
export function heatColor(t: number): string {
  const c = Math.min(1, Math.max(0, t));
  return c <= 0.5
    ? `color-mix(in srgb, var(--color-amber) ${Math.round(c * 200)}%, var(--color-teal-soft))`
    : `color-mix(in srgb, var(--color-critical) ${Math.round((c - 0.5) * 200)}%, var(--color-amber))`;
}
