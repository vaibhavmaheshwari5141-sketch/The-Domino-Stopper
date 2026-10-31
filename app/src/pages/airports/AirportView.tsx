import { HourChart, MonthChart } from './AirportCharts';
import { AirportOverview } from './AirportOverview';
import { BufferCard } from './BufferCard';
import type { AirportState } from './useAirportState';

/** Everything for the selected airport: header and KPIs, month by month, when in the day, and buffer planned. */
export function AirportCharts({ state, update }: { state: AirportState; update: (patch: Partial<AirportState>) => void }) {
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <AirportOverview code={state.code} />
      <div className="grid grid-cols-1 gap-4 2xl:grid-cols-2">
        <MonthChart code={state.code} metric={state.metric} onMetric={(metric) => update({ metric })} />
        <HourChart code={state.code} />
      </div>
      <BufferCard code={state.code} budget={state.budget} onBudget={(budget) => update({ budget })} />
    </div>
  );
}
