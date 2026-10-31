// Small pieces shared by the Recharts charts.
import { HATCH_ID } from '../config/strategies';
import { axisTick } from '../lib/chart';

/**
 * A category label over two lines: before / from "(" ("Very long" / "(over 120)"), or first word / rest
 * ("Spread" / "evenly"). Pass as <XAxis tick={<WrappedTick />} />.
 */
export function WrappedTick({ x = 0, y = 0, payload }: { x?: number; y?: number; payload?: { value: string } }) {
  const label = String(payload?.value ?? '');
  const paren = label.indexOf(' (');
  const space = label.indexOf(' ');
  const cut = paren > 0 ? paren : space;
  const lines = cut > 0 ? [label.slice(0, cut), label.slice(cut + 1)] : [label];
  return (
    <text x={x} y={y + 10} textAnchor="middle" {...axisTick}>
      {lines.map((line, i) => (
        <tspan key={i} x={x} dy={i === 0 ? 0 : 12}>{line}</tspan>
      ))}
    </text>
  );
}

/** Hatched amber fill for the Hindsight ceiling. Put inside a chart, then use fill={`url(#${HATCH_ID})`}. */
export function HatchDefs() {
  return (
    <defs>
      <pattern id={HATCH_ID} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="6" height="6" fill="var(--color-amber-soft)" />
        <line x1="0" y1="0" x2="0" y2="6" stroke="var(--color-amber)" strokeWidth="2" />
      </pattern>
    </defs>
  );
}
