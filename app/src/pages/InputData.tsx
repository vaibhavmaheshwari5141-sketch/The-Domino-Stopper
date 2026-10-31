import { useEffect } from 'react';
import { useDatasets } from '../lib/queries';
import { DatasetList } from './datasets/DatasetList';
import { DatasetPanel } from './datasets/DatasetPanel';
import { useInputDataState } from './datasets/useInputDataState';

// Input Data: the input tables the project starts from (small samples) and the gold tables behind every other page.
// A list on the left, the selected table on the right; both scroll on their own, the page does not.
export default function InputData() {
  const [state, update] = useInputDataState();
  const { data, error, isPending, isFetching, refetch } = useDatasets();

  const all = data?.groups.flatMap((g) => g.items) ?? [];
  const selected = all.find((d) => d.name === state.dataset);
  // Default to the first input table (the first gold table if there are no samples), also when the URL names one that is gone
  const fallback = data?.groups.find((g) => g.items.length)?.items[0]?.name ?? null;
  useEffect(() => {
    if (data && !selected && fallback) update({ dataset: fallback });
  }, [data, selected, fallback, update]);

  return (
    <div className="flex flex-col gap-3 fit:h-full fit:min-h-0">
      <p className="text-[13px] text-muted">Browse the input tables the project starts from and the output tables that power this platform.</p>

      <div className="grid gap-4 wide:grid-cols-[300px_minmax(0,1fr)] fit:min-h-0 fit:flex-1 fit:grid-rows-[minmax(0,1fr)]">
        <div className="flex h-[420px] min-h-0 flex-col wide:h-auto">
          <DatasetList data={data} isPending={isPending} error={error} onRetry={() => void refetch()} retrying={isFetching}
            selected={state.dataset} onSelect={(dataset) => update({ dataset })} />
        </div>

        {selected ? (
          <DatasetPanel dataset={selected} tab={state.tab} onTab={(tab) => update({ tab })} />
        ) : (
          <section className="flex min-h-[300px] flex-col gap-3 rounded-card border bg-surface p-4" aria-busy={isPending}>
            {error ? (
              <p className="text-[13px] text-muted">The dataset list did not load, so there is nothing to preview yet.</p>
            ) : (
              <>
                <span className="skeleton block h-5 w-64" />
                <span className="skeleton block h-4 w-96 max-w-full" />
                <span className="skeleton block h-6 w-80 max-w-full" />
                <span className="skeleton mt-2 block flex-1" />
              </>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
