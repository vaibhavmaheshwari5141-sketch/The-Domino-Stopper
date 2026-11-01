import type { EngineKpiRow } from '../../lib/api';
import { VIEW_HELP } from '../../../shared/kpis';
import { TwoViewsBars } from '../simulator/TwoViewsBars';

/** "Delay prevented per 100 buffer minutes, two views": every strategy at one budget, all days, both views. */
export function StrategyChart({ rows, budget }: { rows: EngineKpiRow[]; budget: number }) {
  return (
    <div className="flex min-h-0 min-w-0 flex-col">
      <div>
        <h3 className="text-[13px] font-semibold text-ink">Delay prevented per 100 buffer minutes, two views</h3>
        <p className="text-xs text-muted">{budget} extra min per turnaround · across each aircraft's whole day · Jan–Aug 2026</p>
      </div>
      <div className="mt-2 min-h-0 flex-1">
        <TwoViewsBars rows={rows} evaluator="both" />
      </div>
      <p className="mt-1 text-[11px] leading-snug text-muted">
        {VIEW_HELP.range} Hindsight knows the real delays and is shown only as a ceiling; reallocate moves minutes instead of adding them.
      </p>
    </div>
  );
}
