import { useState } from 'react';
import { Card } from '../../components/Card';
import { StatusChip } from '../../components/StatusChip';
import type { CostsResponse, EngineKpiRow } from '../../lib/api';
import { EMPTY, formatNumber, formatPercent } from '../../lib/format';
import { strategyDef } from '../../../shared/simulator';
import { viewRow } from './strategies';

interface Props {
  rows: EngineKpiRow[] | undefined;
  costs: CostsResponse | undefined;
  strategies: string[];
  /** Strategy shown first (the Engine of the selected mode). */
  initial: string;
}

/** The three guardrails for one strategy: eligible turnarounds, one airport's share, and the budget. */
export function GuardrailsCard({ rows, costs, strategies, initial }: Props) {
  const [picked, setPicked] = useState<string | null>(null);
  const strategy = picked && strategies.includes(picked) ? picked : initial;
  // Guardrails describe the plan, which is the same in both views: read the curve-view row
  const r = viewRow(rows, strategy, 'curve') ?? viewRow(rows, strategy, 'response model');
  const range = costs?.eligible_ground_min;
  const cap = costs?.airport_cap_share ?? null;
  const rangeText = range ? `${formatNumber(range[0])}–${formatNumber(range[1])}` : EMPTY;

  const checks = [
    {
      label: `Buffer only on ${rangeText} min turnarounds`,
      value: formatPercent(r?.eligible_share, 1),
      note: 'of the buffer minutes',
      ok: r?.eligible_share == null ? null : r.eligible_share >= 0.9995,
    },
    {
      label: `One airport at most ${formatPercent(cap, 0)} of a day's buffer`,
      value: formatPercent(r?.max_airport_share, 1),
      note: 'largest share, any day',
      ok: r?.max_airport_share == null || cap === null ? null : r.max_airport_share <= cap + 1e-9,
    },
    {
      label: 'Budget never exceeded',
      value: r?.budget_respected == null ? EMPTY : r.budget_respected ? 'Yes' : 'No',
      note: 'every day',
      ok: r?.budget_respected ?? null,
    },
  ];

  return (
    <Card
      title="Guardrails"
      aside={
        <label className="flex items-center gap-1.5 text-[12px] text-muted">
          <span className="sr-only">Strategy</span>
          <select value={strategy} onChange={(e) => setPicked(e.target.value)}
            className="focus-ring h-7 max-w-[200px] rounded-control border bg-surface px-1.5 text-[12px] text-ink">
            {strategies.map((s) => <option key={s} value={s}>{strategyDef(s).label}</option>)}
          </select>
        </label>
      }
    >
      <div className="px-4 pb-4">
        {!rows ? <span className="skeleton block h-24" /> : (
          <ul className="divide-y divide-line">
            {checks.map((c) => (
              <li key={c.label} className="flex items-center gap-3 py-2 first:pt-0">
                <span className="min-w-0 flex-1 text-[13px] text-ink">{c.label}</span>
                <span className="text-right">
                  <span className="num block text-[13px] font-semibold text-ink">{c.value}</span>
                  <span className="block text-[10px] text-muted">{c.note}</span>
                </span>
                <span className="w-[68px] text-right"><StatusChip ok={c.ok} yes="Pass" no="Fail" /></span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-[11px] text-muted">The guardrails describe the plan, so they are the same in both views. Engine v2 is built to pass all three.</p>
      </div>
    </Card>
  );
}
