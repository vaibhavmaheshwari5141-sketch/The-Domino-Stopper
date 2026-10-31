import { Info } from 'lucide-react';
import { ErrorState } from '../components/ErrorState';
import { useRiskAirports, useRiskSummary } from '../lib/queries';
import { ForecastTrend, GroundTimeChart } from './risk/RiskCharts';
import { RiskControls } from './risk/RiskControls';
import { RiskHeatmap } from './risk/RiskHeatmap';
import { RiskTiles } from './risk/RiskTiles';
import { TopTurnarounds } from './risk/TopTurnarounds';
import { TrustCard } from './risk/TrustCard';
import { useRiskState } from './risk/useRiskState';

// Risk Forecast: the prediction engine on its own. Where and when delay risk is highest, and how far to trust it.
export default function RiskForecast() {
  const [state, update] = useRiskState();
  const summary = useRiskSummary(state.start, state.end, state.airport);
  const airports = useRiskAirports(state.start, state.end);

  return (
    <div className="flex flex-col gap-4">
      <RiskControls state={state} update={update} airports={airports.data} />

      {summary.isError && !summary.data
        ? <ErrorState title="Could not load the risk summary" error={summary.error} onRetry={() => void summary.refetch()} retrying={summary.isFetching} />
        : <RiskTiles summary={summary.data} />}

      <RiskHeatmap start={state.start} end={state.end} metric={state.metric} airport={state.airport} onAirport={(airport) => update({ airport })} />

      <div className="grid grid-cols-1 gap-4 wide:grid-cols-2">
        <GroundTimeChart airport={state.airport} />
        <ForecastTrend airport={state.airport} />
      </div>

      <TrustCard />

      <TopTurnarounds day={state.day} airport={state.airport} onDay={(day) => update({ day })} />

      <p className="flex items-start gap-2 rounded-card border bg-surface px-4 py-3 text-[12px] leading-relaxed text-muted">
        <Info size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
        The forecast uses timetable facts only. It ranks risk well but cannot predict the exact delay of one flight, because weather,
        faults and crews are not in the timetable.
      </p>
    </div>
  );
}
