// Which strategies the simulator shows, worked out from the data (never a fixed list).
import type { EngineKpiRow, NetValueRow } from '../../lib/api';
import type { EngineMode, Evaluator } from '../../../shared/kpis';
import { ENGINE, REALLOCATE, strategyDef, strategyOrder } from '../../../shared/simulator';

/**
 * Strategies of a mode, in display order. Reallocate mode also lists the add-mode Engine as a reference, so moving
 * minutes can be compared with adding them.
 */
export function modeStrategies(rows: EngineKpiRow[] | undefined, mode: EngineMode): string[] {
  const names = new Set((rows ?? []).filter((r) => r.mode === mode).map((r) => r.strategy));
  if (mode === 'reallocate' && rows?.some((r) => r.strategy === ENGINE)) names.add(ENGINE);
  return [...names].sort(strategyOrder);
}

/** The selected strategies among those available (ids from the URL; null = all). */
export function selectedStrategies(available: string[], ids: string[] | null): string[] {
  return ids === null ? available : available.filter((n) => ids.includes(strategyDef(n).id));
}

/** The strategy the headline tiles describe: the Engine, or the reallocating Engine. */
export function focusStrategy(available: string[], mode: EngineMode): string {
  const wanted = mode === 'reallocate' ? REALLOCATE : ENGINE;
  return available.includes(wanted) ? wanted : available.find((n) => strategyDef(n).mode === mode) ?? available[0] ?? wanted;
}

/** One strategy's row in one view (rows hold one row per view, so this never sums the two). */
export function viewRow<T extends EngineKpiRow | NetValueRow>(rows: T[] | undefined, strategy: string, evaluator: Evaluator): T | undefined {
  return rows?.find((r) => r.strategy === strategy && r.evaluator === evaluator);
}
