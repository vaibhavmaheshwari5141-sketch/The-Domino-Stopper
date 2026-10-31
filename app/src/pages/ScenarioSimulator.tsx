import { AlertTriangle, Scale } from 'lucide-react';
import { ErrorState } from '../components/ErrorState';
import { formatNumber } from '../lib/format';
import { useSimStrategies, useSimSweep } from '../lib/queries';
import { ENGINE } from '../../shared/simulator';
import { AllocationChart } from './simulator/AllocationChart';
import { BudgetCurve } from './simulator/BudgetCurve';
import { ComparisonTable } from './simulator/ComparisonTable';
import { DayByDay } from './simulator/DayByDay';
import { EfficiencyBars } from './simulator/EfficiencyBars';
import { HeadlineTiles } from './simulator/HeadlineTiles';
import { SimControls } from './simulator/SimControls';
import { useSimulatorState } from './simulator/useSimulatorState';

// Scenario Simulator: the same buffer budget placed five ways, replayed over the test period, by budget and day type.
export default function ScenarioSimulator() {
  const [state, update] = useSimulatorState();
  const strategies = useSimStrategies(state.budget, state.dayType);
  const allDays = useSimStrategies(state.budget, 'all days');        // the period total shown next to the slider
  const sweep = useSimSweep(state.dayType);

  const totalMinutes = allDays.data?.rows.find((r) => r.strategy === ENGINE)?.added_min;
  const period = strategies.data?.period;

  return (
    <div className="flex flex-col gap-4">
      <SimControls state={state} update={update} totalMinutes={totalMinutes} />

      {state.dayType === 'disruption days' && period && (
        <p className="flex items-center gap-2 rounded-control bg-amber-soft px-3 py-2 text-[13px] text-ink">
          <AlertTriangle size={15} className="shrink-0 text-amber" aria-hidden="true" />
          {formatNumber(period.disruption_days)} disruption days in the test period (more than 10% of flights cancelled).
        </p>
      )}

      {strategies.isError && !strategies.data ? (
        <ErrorState title="Could not load the strategy results" error={strategies.error} onRetry={() => void strategies.refetch()} retrying={strategies.isFetching} />
      ) : (
        <HeadlineTiles rows={strategies.data?.rows} />
      )}

      <div className="grid grid-cols-1 gap-4 wide:grid-cols-2">
        <EfficiencyBars rows={strategies.data?.rows} selected={state.strategies} />
        {sweep.isError && !sweep.data ? (
          <ErrorState title="Could not load the budget comparison" error={sweep.error} onRetry={() => void sweep.refetch()} retrying={sweep.isFetching} />
        ) : (
          <BudgetCurve rows={sweep.data?.rows} selected={state.strategies} budget={state.budget} metric={state.metric} onMetric={(metric) => update({ metric })} />
        )}
      </div>

      <ComparisonTable rows={strategies.data?.rows} selected={state.strategies} budget={state.budget} dayType={state.dayType} />

      <AllocationChart budget={state.budget} grouping={state.grouping} onGrouping={(grouping) => update({ grouping })} />

      <DayByDay budget={state.budget} selected={state.strategies} view={state.view} onView={(view) => update({ view })} />

      <p className="flex items-start gap-2 rounded-card border bg-surface px-4 py-3 text-[12px] leading-relaxed text-muted">
        <Scale size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
        <span>
          <span className="font-semibold text-ink">Limits. </span>
          Absorbed minutes are best-case figures because the delay curve shows association, not proof of cause. The ranking of strategies is more reliable than the totals.
        </span>
      </p>
    </div>
  );
}
