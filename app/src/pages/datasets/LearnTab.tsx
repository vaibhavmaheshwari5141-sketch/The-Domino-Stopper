import { CheckCircle2, Info } from 'lucide-react';
import { DATASET_DOCS } from '../../config/datasetDocs';
import type { DatasetItem } from '../../lib/api';

// Notebook 03 keeps every row of the five busiest aircraft in each flight table, and copies the two lookups whole
const WHOLE_TABLES = new Set(['sample_mtt_estimates', 'sample_airports_tz']);

/** What you can learn from the table, from src/config/datasetDocs.ts (its use is in the panel header). */
export function LearnTab({ dataset: d }: { dataset: DatasetItem }) {
  const doc = DATASET_DOCS[d.name];
  return (
    <div className="h-[60vh] overflow-auto px-4 py-3 [scrollbar-width:thin] fit:h-auto fit:min-h-0 fit:flex-1">
      {doc ? (
        <>
          <h3 className="label">What you can learn from it</h3>
          <ul className="mt-2 max-w-3xl space-y-2">
            {doc.learn.map((line) => (
              <li key={line} className="flex gap-2 text-[13px] leading-relaxed text-ink">
                <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-teal" aria-hidden="true" />
                {line}
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="text-[13px] text-muted">No notes for this table yet. Add them in <code className="font-mono">src/config/datasetDocs.ts</code>.</p>
      )}

      {d.group === 'input' && (
        <p className="mt-5 flex max-w-3xl gap-2 rounded-control bg-bg px-3 py-2 text-[12px] leading-relaxed text-muted">
          <Info size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
          {WHOLE_TABLES.has(d.name)
            ? 'This small lookup table is shown in full.'
            : 'This is a sample: every row for the five busiest aircraft, the same aircraft in every input table, so the samples line up with each other. The full table is much larger.'}
        </p>
      )}
    </div>
  );
}
