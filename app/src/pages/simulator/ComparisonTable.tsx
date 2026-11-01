import clsx from 'clsx';
import { Fragment } from 'react';
import { Card } from '../../components/Card';
import { Money } from '../../components/Money';
import { InfoTip } from '../../components/Tooltip';
import type { EngineKpiRow, NetValueRow, SimStrategyRow } from '../../lib/api';
import { EMPTY, formatNumber, formatPercent, formatPp, formatUsd } from '../../lib/format';
import { EVALUATOR_LABEL, type Evaluator, type EvaluatorChoice, NEGATIVE_HELP, NET_VALUE_HELP } from '../../../shared/kpis';
import { ENGINE, strategyDef } from '../../../shared/simulator';
import { Swatch } from './SimControls';
import { viewRow } from './strategies';

const COLUMNS: { label: string; unit?: string; tip?: string }[] = [
  { label: 'Buffer added', unit: 'min', tip: 'Minutes given out. For reallocation: minutes moved from long sits.' },
  { label: 'Net added', unit: 'min', tip: 'Minutes added to the schedule. Reallocation moves minutes, so it adds none.' },
  { label: 'Delay prevented', unit: 'min', tip: "Departure-delay minutes prevented across each aircraft's whole day." },
  { label: 'Of all departure delay', unit: 'prevented' },
  { label: 'Prevented per 100 buffer min', unit: 'main KPI' },
  { label: 'Late departures avoided', unit: 'per 1,000' },
  { label: 'On-time change', unit: 'pp' },
  { label: 'Net value', unit: 'USD', tip: `${NET_VALUE_HELP} ${NEGATIVE_HELP}` },
  { label: 'Break-even', unit: 'per buffer min', tip: 'Adding buffer pays only when a buffer minute costs less than this.' },
  { label: 'Engine vs this', unit: 'curve view, 95% range', tip: "The Engine's delay prevented divided by this strategy's, at the same budget (curve view only)." },
];

interface Props {
  rows: EngineKpiRow[] | undefined;
  net: NetValueRow[] | undefined;
  /** gold_sim_strategy (curve view) for the Engine-vs-this ratio and its range. */
  sim: SimStrategyRow[] | undefined;
  selected: string[];
  evaluator: EvaluatorChoice;
  budget: number;
  dayType: string;
}

/** Every selected strategy, one line per view. The two views are shown one under the other, never added together. */
export function ComparisonTable({ rows, net, sim, selected, evaluator, budget, dayType }: Props) {
  const views: Evaluator[] = evaluator === 'both' ? ['curve', 'response model'] : [evaluator];
  return (
    <Card title={<>Comparison <span className="font-normal text-muted">· {budget} min per turnaround · {dayType}</span></>}>
      <div className="overflow-x-auto px-4 pb-4">
        {!rows ? <span className="skeleton block h-40" /> : (
          <table className="w-full min-w-[1080px] text-[12px]">
            <thead>
              <tr className="border-b text-left text-muted">
                <th scope="col" className="py-2 pr-3 font-medium">Strategy</th>
                <th scope="col" className="px-2 py-2 font-medium">View</th>
                {COLUMNS.map((c) => (
                  <th key={c.label} scope="col" className="px-2 py-2 text-right align-bottom font-medium">
                    <span className="inline-flex items-center gap-1">{c.label}{c.tip && <InfoTip label={`About ${c.label}`} align="right">{c.tip}</InfoTip>}</span>
                    {c.unit && <span className="block text-[10px] font-normal">{c.unit}</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {selected.map((name) => {
                const def = strategyDef(name);
                const engine = name === ENGINE;
                const shown = views.map((view) => ({ view, r: viewRow(rows, name, view), n: viewRow(net, name, view) }));
                const ratio = sim?.find((s) => s.strategy === name);
                return (
                  <Fragment key={name}>
                    {shown.map(({ view, r, n }, i) => (
                      <tr key={view} className={clsx(i === shown.length - 1 && 'border-b', engine && 'bg-amber-soft')}>
                        {i === 0 && (
                          <th scope="rowgroup" rowSpan={shown.length} className={clsx('py-1.5 pr-3 text-left align-top font-medium text-ink', engine && 'font-semibold')}>
                            <span className="inline-flex items-center gap-2"><Swatch id={def.id} />{def.label}</span>
                          </th>
                        )}
                        <td className="whitespace-nowrap px-2 py-1.5 text-muted">{EVALUATOR_LABEL[view]}</td>
                        {!r ? (
                          <td colSpan={COLUMNS.length} className="px-2 py-1.5 text-right text-muted">Not computed in this view at this budget.</td>
                        ) : (
                          <>
                            <td className="num px-2 py-1.5 text-right">{formatNumber(r.added_min)}</td>
                            <td className="num px-2 py-1.5 text-right">{formatNumber(r.net_added_min)}</td>
                            <td className="num px-2 py-1.5 text-right">{formatNumber(r.prevented_min)}</td>
                            <td className="num px-2 py-1.5 text-right">{formatPercent(r.pct_departure_delay_prevented != null ? r.pct_departure_delay_prevented / 100 : null, 2)}</td>
                            <td className={clsx('num px-2 py-1.5 text-right', engine && 'font-semibold')}>{formatNumber(r.prevented_per_100, 1)}</td>
                            <td className="num px-2 py-1.5 text-right">{formatNumber(r.late_avoided_per_1000, 2)}</td>
                            <td className="num px-2 py-1.5 text-right">{formatPp(r.otp_change_pp)}</td>
                            <td className="px-2 py-1.5 text-right"><Money value={n?.net_value_usd ?? r.net_value_usd} /></td>
                            <td className="num px-2 py-1.5 text-right">{n?.break_even_buffer_cost_usd != null ? formatUsd(n.break_even_buffer_cost_usd, false) : EMPTY}</td>
                            <td className="num whitespace-nowrap px-2 py-1.5 text-right">
                              {view !== 'curve' || engine || ratio?.engine_vs_this == null ? EMPTY
                                : `${formatNumber(ratio.engine_vs_this, 2)}x (${formatNumber(ratio.engine_vs_this_ci95_low, 2)}–${formatNumber(ratio.engine_vs_this_ci95_high, 2)})`}
                            </td>
                          </>
                        )}
                      </tr>
                    ))}
                  </Fragment>
                );
              })}
              {selected.length === 0 && <tr><td colSpan={COLUMNS.length + 2} className="py-6 text-center text-muted">Select at least one strategy.</td></tr>}
            </tbody>
          </table>
        )}
      </div>
    </Card>
  );
}
