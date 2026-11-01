import { AlertTriangle, Scale } from 'lucide-react';
import { useCallback } from 'react';
import { ErrorState } from '../components/ErrorState';
import { Tabs } from '../components/Tabs';
import { formatNumber } from '../lib/format';
import { useCosts, useEngineKpis, useNetValue, useSimStrategies } from '../lib/queries';
import { ESTIMATE_HELP } from '../../shared/kpis';
import { AllocationChart } from './simulator/AllocationChart';
import { BudgetCurve } from './simulator/BudgetCurve';
import { ComparisonTable } from './simulator/ComparisonTable';
import { CostsPanel } from './simulator/CostsPanel';
import { DayByDay } from './simulator/DayByDay';
import { EfficiencyBars } from './simulator/EfficiencyBars';
import { EngineScorecard } from './simulator/EngineScorecard';
import { GuardrailsCard } from './simulator/GuardrailsCard';
import { HeadlineTiles } from './simulator/HeadlineTiles';
import { SimControls } from './simulator/SimControls';
import { focusStrategy, modeStrategies, selectedStrategies, viewRow } from './simulator/strategies';
import { type SimState, useSimulatorState } from './simulator/useSimulatorState';

// Scenario Simulator: the same buffer budget placed several ways (the strategies come from the data), replayed over
// the test period, by budget, day type, mode (add or reallocate) and view (curve, model or both).
export default function ScenarioSimulator() {
  const [state, update] = useSimulatorState();
  const engine = useEngineKpis(state.budget, state.dayType);
  const allDays = useEngineKpis(state.budget, 'all days');             // the period total shown next to the slider
  const sweep = useEngineKpis('all', state.dayType);
  const sim = useSimStrategies(state.budget, state.dayType);           // curve view: Engine-vs-this ratios and the period
  const costs = useCosts();
  const net = useNetValue(state.budget, state.dayType, state.costDelay, state.costBuffer);

  const available = modeStrategies(engine.data?.rows, state.mode);
  const selected = selectedStrategies(available, state.strategies);
  const focus = focusStrategy(available, state.mode);
  const totalMinutes = viewRow(allDays.data?.rows, focus, 'curve')?.added_min;
  const period = sim.data?.period;
  const setCosts = useCallback((patch: Partial<SimState>) => update(patch), [update]);

  return (
    <div className="flex flex-col gap-4">
      <SimControls state={state} update={update} available={available} selected={selected} totalMinutes={totalMinutes} />

      <Tabs
        label="Simulator views"
        value={state.tab}
        onChange={(tab) => update({ tab })}
        tabs={[{ value: 'strategies', label: 'Strategies' }, { value: 'scorecard', label: 'Engine scorecard' }]}
      >
        {state.tab === 'scorecard' ? <EngineScorecard /> : (
          <div className="flex flex-col gap-4">
            {state.dayType === 'disruption days' && period && (
              <p className="flex items-center gap-2 rounded-control bg-amber-soft px-3 py-2 text-[13px] text-ink">
                <AlertTriangle size={15} className="shrink-0 text-amber" aria-hidden="true" />
                {formatNumber(period.disruption_days)} disruption days in the test period (more than 10% of flights cancelled).
              </p>
            )}

            {engine.isError && !engine.data ? (
              <ErrorState title="Could not load the strategy results" error={engine.error} onRetry={() => void engine.refetch()} retrying={engine.isFetching} />
            ) : (
              <HeadlineTiles rows={engine.data?.rows} net={net.data?.rows} strategy={focus} evaluator={state.evaluator}
                costBuffer={net.data?.cost_buffer_min_usd} />
            )}

            <div className="grid grid-cols-1 gap-4 wide:grid-cols-2">
              <CostsPanel costs={costs.data} costDelay={state.costDelay} costBuffer={state.costBuffer} onChange={setCosts} />
              <GuardrailsCard rows={engine.data?.rows} costs={costs.data} strategies={available} initial={focus} />
            </div>

            <div className="grid grid-cols-1 gap-4 wide:grid-cols-2">
              <EfficiencyBars rows={engine.data?.rows} selected={selected} evaluator={state.evaluator} />
              {sweep.isError && !sweep.data ? (
                <ErrorState title="Could not load the budget comparison" error={sweep.error} onRetry={() => void sweep.refetch()} retrying={sweep.isFetching} />
              ) : (
                <BudgetCurve rows={sweep.data?.rows} selected={selected} budget={state.budget} evaluator={state.evaluator}
                  metric={state.metric} onMetric={(metric) => update({ metric })} />
              )}
            </div>

            <ComparisonTable rows={engine.data?.rows} net={net.data?.rows} sim={sim.data?.rows} selected={selected}
              evaluator={state.evaluator} budget={state.budget} dayType={state.dayType} />

            <AllocationChart budget={state.budget} grouping={state.grouping} onGrouping={(grouping) => update({ grouping })} />

            <DayByDay budget={state.budget} selected={selected} focus={focus} view={state.view} onView={(view) => update({ view })} />

            <p className="flex items-start gap-2 rounded-card border bg-surface px-4 py-3 text-[12px] leading-relaxed text-muted">
              <Scale size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
              <span>
                <span className="font-semibold text-ink">Limits. </span>
                {ESTIMATE_HELP} The two views disagree on size, which is why results are given as a range; the ranking of strategies is more
                reliable than the totals. The costs are assumptions and can be changed above.
              </span>
            </p>
          </div>
        )}
      </Tabs>
    </div>
  );
}
