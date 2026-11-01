import clsx from 'clsx';
import { Check, Info } from 'lucide-react';
import { useId } from 'react';
import { SegmentedControl } from '../../components/SegmentedControl';
import { InfoTip, Tooltip } from '../../components/Tooltip';
import { HATCH_ID, strategyColor } from '../../config/strategies';
import { formatCompact } from '../../lib/format';
import { EVALUATOR_LABEL, MODE_HELP, MODE_LABEL, VIEW_HELP } from '../../../shared/kpis';
import { PLANNER_BUDGETS } from '../../../shared/planner';
import { DAY_TYPES, KNOWN_STRATEGIES, strategyDef } from '../../../shared/simulator';
import type { SimState } from './useSimulatorState';

interface Props {
  state: SimState;
  update: (patch: Partial<SimState>) => void;
  /** Strategies of the selected mode, from the data, in display order. */
  available: string[];
  selected: string[];
  /** Buffer minutes over the whole period at the selected budget (all days). */
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
    <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: strategyColor(id) }} aria-hidden="true" />
  );
}

export function SimControls({ state, update, available, selected, totalMinutes }: Props) {
  const stop = PLANNER_BUDGETS.indexOf(state.budget);
  const toggle = (name: string) => {
    const on = selected.includes(name);
    const next = available.filter((n) => (n === name ? !on : selected.includes(n)));
    update({ strategies: next.length === available.length ? null : next.map((n) => strategyDef(n).id) });
  };
  // Definitions: every known strategy plus any the data has that this page has never seen
  const definitions = [...KNOWN_STRATEGIES, ...available.filter((n) => !KNOWN_STRATEGIES.some((k) => k.name === n)).map((n) => strategyDef(n))];

  return (
    // -mt-5 / top-[-20px] cancel the content area padding, so the bar sits flush under the top bar while scrolling
    <div className="sticky top-[-20px] z-30 -mx-5 -mt-5 border-b bg-bg px-5 pb-3 pt-4">
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

      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
        <div className="flex items-center gap-1.5">
          <span className="text-[13px] font-medium text-ink">Mode</span>
          <SegmentedControl
            label="Mode"
            value={state.mode}
            options={[{ value: 'add', label: MODE_LABEL.add }, { value: 'reallocate', label: MODE_LABEL.reallocate }]}
            onChange={(mode) => update({ mode, strategies: null })}
          />
          <InfoTip label="About the modes">
            <span className="mb-1 block">{MODE_HELP.add}</span>
            <span className="block">{MODE_HELP.reallocate}</span>
          </InfoTip>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[13px] font-medium text-ink">Evaluator</span>
          <SegmentedControl
            label="Evaluator"
            value={state.evaluator}
            options={[
              { value: 'curve', label: EVALUATOR_LABEL.curve },
              { value: 'response model', label: EVALUATOR_LABEL['response model'] },
              { value: 'both', label: 'Both' },
            ]}
            onChange={(evaluator) => update({ evaluator })}
          />
          <InfoTip label="About the two views">
            <span className="mb-1 block">{VIEW_HELP.curve}</span>
            <span className="mb-1 block">{VIEW_HELP.model}</span>
            <span className="block">{VIEW_HELP.range}</span>
          </InfoTip>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-[13px] font-medium text-ink">Strategies to compare</span>
        <Tooltip
          align="left"
          className="max-w-[460px]"
          content={
            <dl className="space-y-1.5">
              {definitions.map((s) => (
                <div key={s.id}>
                  <dt className="flex items-center gap-1.5 font-semibold"><Swatch id={s.id} />{s.label}
                    <span className="font-normal text-muted">· {s.mode === 'reallocate' ? 'reallocate' : 'add'}</span></dt>
                  <dd className="text-muted">{s.rule || 'No description for this strategy yet.'}</dd>
                </div>
              ))}
            </dl>
          }
        >
          <button type="button" aria-label="What the strategies do" className="focus-ring rounded-full text-muted hover:text-ink">
            <Info size={14} aria-hidden="true" />
          </button>
        </Tooltip>
        {available.map((name) => {
          const s = strategyDef(name);
          const on = selected.includes(name);
          return (
            <button
              key={s.id}
              type="button"
              role="checkbox"
              aria-checked={on}
              onClick={() => toggle(name)}
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
              {state.mode === 'reallocate' && s.mode === 'add' && <span className="text-[10px] font-normal text-muted">(adds buffer, for reference)</span>}
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
