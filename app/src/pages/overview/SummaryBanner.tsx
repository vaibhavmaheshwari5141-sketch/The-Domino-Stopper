import { Lightbulb } from 'lucide-react';

/** The headline finding in one banner, between the KPI ribbon and the panels. */
export function SummaryBanner({ summary }: { summary: string | undefined }) {
  return (
    <section aria-label="Headline finding" className="flex items-start gap-3 rounded-card border border-l-4 border-l-amber bg-surface px-4 py-3">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-soft">
        <Lightbulb size={16} className="text-amber" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="label !text-[11px]">Headline finding</p>
        {summary ? (
          <p className="mt-0.5 text-sm leading-relaxed text-ink">{summary}</p>
        ) : (
          <div className="mt-1.5 space-y-2">
            <span className="skeleton block h-3.5 w-full" />
            <span className="skeleton block h-3.5 w-2/3" />
          </div>
        )}
      </div>
    </section>
  );
}
