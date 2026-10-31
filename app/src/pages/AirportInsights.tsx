import { useCallback } from 'react';
import { SegmentedControl } from '../components/SegmentedControl';
import { AirportCharts } from './airports/AirportView';
import { AirportList } from './airports/AirportList';
import { NetworkScatterCard, RankingTable } from './airports/CompareView';
import { useAirportState } from './airports/useAirportState';

// Airport Insights: one airport at a time (punctuality, when in the day it struggles, ground times, delay passed on,
// buffer planned), and a network view comparing airports.
export default function AirportInsights() {
  const [state, update] = useAirportState();
  const select = useCallback((code: string) => update({ code, tab: 'airport' }), [update]);
  const setFilters = useCallback((patch: Parameters<typeof update>[0]) => update(patch), [update]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-muted">Punctuality, ground times and planned buffer for each airport, compared with the network.</p>
        <SegmentedControl label="View" value={state.tab} onChange={(tab) => update({ tab })}
          options={[{ value: 'airport', label: 'Airport view' }, { value: 'compare', label: 'Compare airports' }]} />
      </div>

      {state.tab === 'airport' ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
          <div className="lg:sticky lg:top-0 lg:h-[calc(100vh-56px-40px-48px)]">
            <AirportList selected={state.code} q={state.q} sort={state.sort} top10={state.top10} onSelect={select} onFilters={setFilters} />
          </div>
          <AirportCharts state={state} update={update} />
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <NetworkScatterCard onSelect={select} />
          <RankingTable sort={state.rsort} order={state.rorder} page={state.rpage} onSelect={select}
            onSort={(rsort, rorder) => update({ rsort, rorder, rpage: 1 })} onPage={(rpage) => update({ rpage })} />
        </div>
      )}
    </div>
  );
}
