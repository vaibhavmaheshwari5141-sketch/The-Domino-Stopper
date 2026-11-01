import { Card } from '../../components/Card';
import type { EngineKpiRow } from '../../lib/api';
import { EVALUATOR_LABEL, type EvaluatorChoice, MAIN_KPI_HELP } from '../../../shared/kpis';
import { TwoViewsBars } from './TwoViewsBars';

export function EfficiencyBars({ rows, selected, evaluator }: { rows: EngineKpiRow[] | undefined; selected: string[]; evaluator: EvaluatorChoice }) {
  return (
    <Card title={<>Delay prevented per 100 buffer minutes <span className="font-normal text-muted">· {evaluator === 'both' ? 'two views' : EVALUATOR_LABEL[evaluator]}</span></>}>
      <div className="h-64 px-2">
        {!rows ? <span className="skeleton block h-full" /> : selected.length === 0 ? (
          <p className="flex h-full items-center justify-center text-[13px] text-muted">Select at least one strategy.</p>
        ) : <TwoViewsBars rows={rows} evaluator={evaluator} strategies={selected} />}
      </div>
      <p className="px-4 pb-3 pt-1 text-[11px] text-muted">
        {MAIN_KPI_HELP} Same budget for every strategy. Hindsight knows the real delays and is shown only as a ceiling.
      </p>
    </Card>
  );
}
