// Shared chart styling, so every chart in the app uses the same colours and axis type.
// Colours are the design tokens; SVG presentation attributes accept var().

export const chartColors = {
  tarmac: 'var(--color-tarmac)',
  amber: 'var(--color-amber)',
  teal: 'var(--color-teal)',
  line: 'var(--color-line)',
  muted: 'var(--color-muted)',
  surface: 'var(--color-surface)',
} as const;

export const axisTick = { fontFamily: 'var(--font-mono)', fontSize: 11, fill: chartColors.muted } as const;

/** Props for XAxis / YAxis: no axis line or tick marks, muted mono labels. */
export const axisProps = { axisLine: false, tickLine: false, tick: axisTick } as const;

/** Props for CartesianGrid: light horizontal lines only. */
export const gridProps = { stroke: chartColors.line, strokeOpacity: 0.7, vertical: false } as const;
