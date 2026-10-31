import clsx from 'clsx';
import { Card } from '../../components/Card';
import type { SimStrategyRow } from '../../lib/api';
import { EMPTY, formatNumber, formatPercent } from '../../lib/format';
import { ENGINE, strategyDef } from '../../../shared/simulator';
import { Swatch } from './SimControls';

const COLUMNS = [
  { label: 'Buffer added', unit: 'min' },
  { label: 'Delay absorbed', unit: 'min' },
  { label: 'Passed-on delay removed', unit: '' },
  { label: 'Absorbed per 100 buffer min', unit: '' },
  { label: 'Late departures avoided', unit: 'per 1,000' },
  { label: 'Engine vs this strategy', unit: '95% range' },
];

export function ComparisonTable({ rows, selected, budget, dayType }: { rows: SimStrategyRow[] | undefined; selected: string[]; budget: number; dayType: string }) {
  const shown = (rows ?? []).filter((r) => selected.includes(r.strategy));
  return (
    <Card title={<>Comparison <span className="font-normal text-muted">· {budget} min per turnaround · {dayType}</span></>}>
      <div className="overflow-x-auto px-4 pb-4">
        {!rows ? <span className="skeleton block h-40" /> : (
          <table className="w-full min-w-[760px] text-[12px]">
            <thead>
              <tr className="border-b text-left text-muted">
                <th scope="col" className="py-2 pr-3 font-medium">Strategy</th>
                {COLUMNS.map((c) => (
                  <th key={c.label} scope="col" className="px-3 py-2 text-right font-medium">
                    {c.label}{c.unit && <span className="block text-[10px] font-normal">{c.unit}</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => {
                const def = strategyDef(r.strategy);
                const engine = r.strategy === ENGINE;
                return (
                  <tr key={r.strategy} className={clsx('border-b last:border-0', engine && 'bg-amber-soft font-semibold')}>
                    <th scope="row" className="py-2 pr-3 text-left font-medium text-ink">
                      <span className="inline-flex items-center gap-2">{def && <Swatch id={def.id} />}{def?.label ?? r.strategy}</span>
                    </th>
                    <td className="num px-3 py-2 text-right">{formatNumber(r.added_min)}</td>
                    <td className="num px-3 py-2 text-right">{formatNumber(r.absorbed_min)}</td>
                    <td className="num px-3 py-2 text-right">{formatPercent(r.pct_removed != null ? r.pct_removed / 100 : null, 2)}</td>
                    <td className="num px-3 py-2 text-right">{formatNumber(r.absorbed_per_100_added, 1)}</td>
                    <td className="num px-3 py-2 text-right">{formatNumber(r.late_avoided_per_1000, 2)}</td>
                    <td className="num whitespace-nowrap px-3 py-2 text-right">
                      {engine || r.engine_vs_this == null ? EMPTY
                        : `${formatNumber(r.engine_vs_this, 2)}x (${formatNumber(r.engine_vs_this_ci95_low, 2)}–${formatNumber(r.engine_vs_this_ci95_high, 2)})`}
                    </td>
                  </tr>
                );
              })}
              {shown.length === 0 && <tr><td colSpan={7} className="py-6 text-center text-muted">Select at least one strategy.</td></tr>}
            </tbody>
          </table>
        )}
      </div>
    </Card>
  );
}
