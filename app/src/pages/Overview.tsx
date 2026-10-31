import { Card } from '../components/Card';
import { ErrorState } from '../components/ErrorState';
import { useOverview } from '../lib/queries';
import { InsightsList } from './overview/InsightsList';
import { KpiRibbon } from './overview/KpiRibbon';
import { MonthlyChart } from './overview/MonthlyChart';
import { StrategyChart } from './overview/StrategyChart';

const BUDGET = 5;   // extra minutes per turnaround for the strategy comparison

// On screens of at least 1100x680 (`fit`) the page fills the content area exactly: KPI ribbon on top, the main area
// takes the rest, and the charts shrink to fit. Smaller screens fall back to normal scrolling with fixed chart heights.
export default function Overview() {
  const { data, isError, error, refetch, isFetching } = useOverview(BUDGET);

  if (isError && !data) return <ErrorState error={error} onRetry={() => void refetch()} retrying={isFetching} />;

  return (
    <div className="flex flex-col gap-4 fit:grid fit:h-full fit:grid-rows-[auto_minmax(0,1fr)]">
      <KpiRibbon kpis={data?.kpis} />

      <div className="grid gap-4 wide:grid-cols-3 fit:min-h-0 fit:grid-rows-[minmax(0,1fr)]">
        <Card title="Overview" className="wide:col-span-2 fit:min-h-0">
          <div className="flex min-h-0 flex-1 flex-col px-4 pb-4">
            {data ? (
              <p className="line-clamp-3 text-sm leading-relaxed text-ink">{data.summary}</p>
            ) : (
              <div className="space-y-2">
                <span className="skeleton block h-3.5 w-full" />
                <span className="skeleton block h-3.5 w-11/12" />
                <span className="skeleton block h-3.5 w-2/3" />
              </div>
            )}
            {/* Fixed chart heights when scrolling; in `fit` mode the charts take whatever height is left */}
            <div className="mt-4 grid h-[640px] gap-6 md:h-[340px] md:grid-cols-[minmax(0,5fr)_minmax(0,4fr)] fit:h-auto fit:min-h-0 fit:flex-1">
              {data ? (
                <>
                  <StrategyChart rows={data.strategy} budget={data.context.budget} />
                  <MonthlyChart rows={data.monthly} />
                </>
              ) : (
                <>
                  <span className="skeleton block h-full" />
                  <span className="skeleton block h-full" />
                </>
              )}
            </div>
          </div>
        </Card>

        <Card title="Key insights" className="fit:min-h-0">
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-2">
            {data ? (
              <InsightsList insights={data.insights} />
            ) : (
              <div className="space-y-4 pt-1">
                {Array.from({ length: 5 }, (_, i) => <span key={i} className="skeleton block h-14" />)}
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
