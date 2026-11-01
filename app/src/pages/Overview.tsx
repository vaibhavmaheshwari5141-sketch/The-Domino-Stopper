import clsx from 'clsx';
import { Maximize2, Minimize2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Card } from '../components/Card';
import { ErrorState } from '../components/ErrorState';
import { Tabs } from '../components/Tabs';
import { useOverview } from '../lib/queries';
import { readJson, writeJson } from '../lib/storage';
import { AirportMap } from './overview/AirportMap';
import { InsightsList } from './overview/InsightsList';
import { KpiRibbon } from './overview/KpiRibbon';
import { MonthlyChart } from './overview/MonthlyChart';
import { StrategyChart } from './overview/StrategyChart';
import { SummaryBanner } from './overview/SummaryBanner';

const BUDGET = 5;   // extra minutes per turnaround for the strategy comparison and the map's engine figures

type Tab = 'map' | 'strategy' | 'monthly';
const TABS: { value: Tab; label: string }[] = [
  { value: 'map', label: 'Airport map' },
  { value: 'strategy', label: 'Two views' },
  { value: 'monthly', label: 'Monthly trend' },
];
const TAB_KEY = 'ds_overview_tab';     // remembered per browser, a convenience only

function savedTab(): Tab {
  const t = readJson<Tab>('local', TAB_KEY);
  return TABS.some((o) => o.value === t) ? t! : 'map';
}

// On screens of at least 1100x680 (`fit`) the page fills the content area exactly: KPI ribbon on top, the main area
// takes the rest, and the tab panel shrinks to fit. Smaller screens fall back to normal scrolling with a fixed height.
export default function Overview() {
  const { data, isError, error, refetch, isFetching } = useOverview(BUDGET);
  const [tab, setTab] = useState<Tab>(savedTab);
  const changeTab = (t: Tab) => {
    setTab(t);
    writeJson('local', TAB_KEY, t);
  };

  // Focus mode: the Overview panel fills the window. Esc leaves it; the page behind does not scroll.
  const [focus, setFocus] = useState(false);
  useEffect(() => {
    if (!focus) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setFocus(false);
    const overflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.documentElement.style.overflow = overflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [focus]);

  if (isError && !data) return <ErrorState error={error} onRetry={() => void refetch()} retrying={isFetching} />;

  return (
    <div className="flex flex-col gap-4 fit:grid fit:h-full fit:grid-rows-[auto_auto_minmax(0,1fr)]">
      <KpiRibbon kpis={data?.kpis} guardrails={data?.guardrails} />

      <SummaryBanner summary={data?.summary} />

      <div className="grid gap-4 wide:grid-cols-3 fit:min-h-0 fit:grid-rows-[minmax(0,1fr)]">
        {/* Focus mode pins the same panel over the whole window (no remount, so the map and its filters keep their state) */}
        <Card className={clsx(focus ? 'fixed inset-0 z-[900] !rounded-none !border-0' : 'wide:col-span-2 fit:min-h-0')}>
          <div className={clsx('flex min-h-0 flex-1 flex-col', focus ? 'px-6 pb-5 pt-4' : 'px-4 pb-4 pt-3')}>
            {/* Fixed height when scrolling; in `fit` and focus mode the tab panel takes whatever height is left */}
            <Tabs
              label="Overview views"
              value={tab}
              tabs={TABS}
              onChange={changeTab}
              className={focus ? 'flex-1' : 'h-[480px] fit:h-auto fit:flex-1'}
              aside={
                <div className="flex items-center gap-2">
                  {focus && <span className="hidden text-[11px] text-muted md:inline">Esc to exit</span>}
                  <button
                    type="button"
                    onClick={() => setFocus((f) => !f)}
                    aria-pressed={focus}
                    className="focus-ring inline-flex h-7 items-center gap-1.5 rounded-control border px-2 text-[12px] text-muted hover:bg-bg hover:text-ink"
                  >
                    {focus ? <Minimize2 size={14} aria-hidden="true" /> : <Maximize2 size={14} aria-hidden="true" />}
                    {focus ? 'Exit focus' : 'Focus'}
                  </button>
                </div>
              }
            >
              {tab === 'map' ? (
                <AirportMap budget={BUDGET} focus={focus} />
              ) : data ? (
                tab === 'strategy' ? <StrategyChart rows={data.engine_kpis} budget={data.context.budget} /> : <MonthlyChart rows={data.monthly} />
              ) : (
                <span className="skeleton block h-full" />
              )}
            </Tabs>
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
