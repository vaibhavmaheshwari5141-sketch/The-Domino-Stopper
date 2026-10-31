import clsx from 'clsx';
import { Check, Info } from 'lucide-react';
import { useId } from 'react';
import { SegmentedControl } from '../../components/SegmentedControl';
import { Tooltip } from '../../components/Tooltip';
import { HATCH_ID, STRATEGY_COLOR } from '../../config/strategies';
import { formatCompact } from '../../lib/format';
import { PLANNER_BUDGETS } from '../../../shared/planner';
import { DAY_TYPES, STRATEGIES } from '../../../shared/simulator';
import type { SimState } from './useSimulatorState';

interface Props {
  state: SimState;
  update: (patch: Partial<SimState>) => void;
  /** Engine buffer minutes over the whole period at the selected budget (all days). */
  totalMinutes: number | null | undefined;
}

const DAY_LABEL: Record<string, string> = { 'all days': 'All days', 'normal days': 'Normal days', 'disruption days': 'Disruption days' };

/** Coloured swatch matching the strategy's colour in the charts (hatched for the Hindsight ceiling). */
export function Swatch({ id }: { id: string }) {
  // Each swatch has its own pattern id: a shared id would resolve to the first copy, which may sit in a hidden tooltip
  const patternId = `${HATCH_ID}-${useId().replace(/:/g, '')}`;
  return id === 'hindsight' ? (
    <svg width="12" height="12" aria-hidden="true" className="shrink-0 rounded-sm">
      <pattern id={patternId} width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="4" height="4" fill="var(--color-amber-soft)" />
        <line x1="0" y1="0" x2="0" y2="4" stroke="var(--color-amber)" strokeWidth="1.5" />
      </pattern>
      <rect width="12" height="12" fill={`url(#${patternId})`} />
    </svg>
  ) : (
    <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: STRATEGY_COLOR[id] }} aria-hidden="true" />
  );
}

export function SimControls({ state, update, totalMinutes }: Props) {
  const stop = PLANNER_BUDGETS.indexOf(state.budget);
  const toggle = (name: string) => {
    const on = state.strategies.includes(name);
    update({ strategies: STRATEGIES.map((s) => s.name).filter((n) => (n === name ? !on : state.strategies.includes(n))) });
  };

  return (
    // -mt-5 / top-[-20px] cancel the content area padding, so the bar sits flush under the top bar while scrolling
    <div className="sticky top-[-20px] z-30 -mx-5 -mt-5 border-b bg-bg px-5 pb-3 pt-4">
      <p className="mb-3 text-[13px] text-muted">Compare ways of placing the same buffer budget, using a replay of Jan to Aug 2026.</p>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="flex items-center gap-3">
          <label htmlFor="budget-slider" className="text-[13px] font-medium text-ink">
            Buffer budget: <span className="font-normal text-muted">average extra minutes per turnaround</span>
          </label>
          <div className="w-40">
            <input
              id="budget-slider"
              type="range"
              min={0}
              max={PLANNER_BUDGETS.length - 1}
              step={1}
              value={stop}
              onChange={(e) => update({ budget: PLANNER_BUDGETS[Number(e.target.value)] })}
              aria-valuetext={`${state.budget} minutes per turnaround`}
              className="h-1.5 w-full cursor-pointer accent-[var(--color-amber)]"
            />
            <div className="num mt-0.5 flex justify-between text-[11px] text-muted" aria-hidden="true">
              {PLANNER_BUDGETS.map((b) => <span key={b} className={clsx(b === state.budget && 'font-semibold text-ink')}>{b}</span>)}
            </div>
          </div>
          <span className="num whitespace-nowrap rounded-control bg-amber-soft px-2 py-1 text-[12px] text-ink">
            <span className="font-semibold">{state.budget} min</span>
            <span className="text-muted"> · {totalMinutes != null ? `${formatCompact(totalMinutes, 2)} buffer minutes` : '…'}</span>
          </span>
        </div>

        <SegmentedControl
          label="Day type"
          value={state.dayType}
          options={DAY_TYPES.map((d) => ({ value: d, label: DAY_LABEL[d] }))}
          onChange={(dayType) => update({ dayType })}
        />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-[13px] font-medium text-ink">Strategies to compare</span>
        <Tooltip
          align="left"
          className="max-w-[440px]"
          content={
            <dl className="space-y-1.5">
              {STRATEGIES.map((s) => (
                <div key={s.id}>
                  <dt className="flex items-center gap-1.5 font-semibold"><Swatch id={s.id} />{s.label}</dt>
                  <dd className="text-muted">{s.rule}</dd>
                </div>
              ))}
            </dl>
          }
        >
          <button type="button" aria-label="What the strategies do" className="focus-ring rounded-full text-muted hover:text-ink">
            <Info size={14} aria-hidden="true" />
          </button>
        </Tooltip>
        {STRATEGIES.map((s) => {
          const on = state.strategies.includes(s.name);
          return (
            <button
              key={s.id}
              type="button"
              role="checkbox"
              aria-checked={on}
              onClick={() => toggle(s.name)}
              className={clsx(
                'focus-ring inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[12px]',
                on ? 'border-line bg-surface font-medium text-ink shadow-sm' : 'bg-bg text-muted line-through decoration-line',
              )}
            >
              <span className={clsx('flex h-3.5 w-3.5 items-center justify-center rounded-[3px] border', on ? 'border-navy bg-navy' : 'border-line bg-surface')}>
                {on && <Check size={10} className="text-white" aria-hidden="true" />}
              </span>
              <Swatch id={s.id} />
              {s.label}
            </button>
          );
        })}
        <span className="basis-full text-[11px] text-muted">
          Results come from replaying every day from Jan to Aug 2026 with the same budget for every strategy.
        </span>
      </div>
    </div>
  );
}
