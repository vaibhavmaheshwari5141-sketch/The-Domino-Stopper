import type { ReactNode } from 'react';

/** The box used by every chart tooltip. */
export function ChartTooltipBox({ title, rows }: { title: ReactNode; rows: [ReactNode, ReactNode][] }) {
  return (
    <div className="rounded-control border bg-surface px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-semibold text-ink">{title}</p>
      <dl className="grid grid-cols-[auto_auto] gap-x-4 gap-y-0.5">
        {rows.map(([k, v], i) => (
          <div key={i} className="contents">
            <dt className="text-muted">{k}</dt>
            <dd className="num text-right text-ink">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function LegendItem({ color, label, dot = false }: { color: string; label: string; dot?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-muted">
      <span className={dot ? 'h-2 w-2 rounded-full' : 'h-2.5 w-2.5 rounded-sm'} style={{ background: color }} aria-hidden="true" />
      {label}
    </span>
  );
}
