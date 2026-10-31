import { Search, X } from 'lucide-react';
import { useState } from 'react';
import { ErrorState } from '../../components/ErrorState';
import { columnMeaning } from '../../config/datasetDocs';
import { formatNumber } from '../../lib/format';
import { useDatasetSchema } from '../../lib/queries';
import { KIND_LABELS } from './cells';

/** Every column with what it means and its data type. The list scrolls on its own, with the scrollbar always shown. */
export function ColumnsTab({ name }: { name: string }) {
  const { data, error, isPending, isFetching, refetch } = useDatasetSchema(name, true);
  const [text, setText] = useState('');

  if (error) return <div className="p-3"><ErrorState title="Could not load the columns" error={error} onRetry={() => void refetch()} retrying={isFetching} /></div>;
  if (isPending) {
    return <div className="space-y-1.5 p-3" aria-busy="true">{Array.from({ length: 10 }, (_, i) => <span key={i} className="skeleton block h-7" />)}</div>;
  }

  const q = text.trim().toLowerCase();
  const rows = data.columns.map((c, i) => ({ ...c, position: i + 1, meaning: columnMeaning(name, c.name) }));
  const shown = q ? rows.filter((c) => c.name.toLowerCase().includes(q) || (c.meaning ?? '').toLowerCase().includes(q)) : rows;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-3 px-3 py-2.5">
        <label className="flex h-8 w-64 max-w-full items-center gap-2 rounded-control border bg-surface px-2.5 focus-within:ring-2 focus-within:ring-teal">
          <Search size={14} className="shrink-0 text-muted" aria-hidden="true" />
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Find a column" aria-label="Find a column by name or meaning"
            className="w-full bg-transparent text-[13px] text-ink outline-none placeholder:text-muted" />
          {text && (
            <button type="button" aria-label="Clear" onClick={() => setText('')} className="focus-ring rounded text-muted hover:text-ink">
              <X size={14} aria-hidden="true" />
            </button>
          )}
        </label>
        <p className="num text-[12px] text-muted" aria-live="polite">
          {q ? `${formatNumber(shown.length)} of ${formatNumber(rows.length)} columns` : `All ${formatNumber(rows.length)} columns`}
          {shown.length > 12 && <span className="font-sans"> · scroll the list to see them all</span>}
        </p>
      </div>

      {/* scrollbar-width makes the scrollbar permanent (Windows otherwise hides it until hover) */}
      <div className="mx-3 mb-3 h-[60vh] overflow-auto rounded-control border [scrollbar-width:thin] fit:h-auto fit:min-h-0 fit:flex-1">
        <table className="w-full border-separate border-spacing-0 text-[13px]">
          <thead>
            <tr className="text-left">
              {['#', 'Column', 'What it means', 'Data type'].map((h, i) => (
                <th key={h} scope="col" className={`label sticky top-0 z-10 whitespace-nowrap border-b bg-surface px-2.5 py-1.5 font-normal ${i === 0 ? 'w-10 text-right' : ''} ${i === 1 ? 'w-[28%]' : ''}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((c) => (
              <tr key={c.name} className="align-top hover:bg-bg">
                <td className="num border-b px-2.5 py-2 text-right text-[12px] text-muted">{c.position}</td>
                <td className="num break-all border-b px-2.5 py-2 font-medium text-ink">{c.name}</td>
                <td className={`border-b px-2.5 py-2 text-[12.5px] leading-snug ${c.meaning ? 'text-ink' : 'italic text-muted'}`}>
                  {c.meaning ?? 'No description yet (add one in src/config/datasetDocs.ts).'}
                </td>
                <td className="num whitespace-nowrap border-b px-2.5 py-2 text-[12px] text-ink" title={`Shown as: ${KIND_LABELS[c.kind]}`}>{c.type}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {shown.length === 0 && <p className="px-3 py-8 text-center text-[13px] text-muted">No column matches “{text.trim()}”.</p>}
      </div>
    </div>
  );
}
