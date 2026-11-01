import { useEffect, useId, useState } from 'react';
import { Card } from '../../components/Card';
import { InfoTip } from '../../components/Tooltip';
import type { CostsResponse } from '../../lib/api';
import { formatUsd } from '../../lib/format';
import { COST_LIMITS, COST_SETTINGS, NET_VALUE_HELP } from '../../../shared/kpis';

interface Props {
  costs: CostsResponse | undefined;
  costDelay: number | null;
  costBuffer: number | null;
  onChange: (patch: { costDelay?: number | null; costBuffer?: number | null }) => void;
}

/** A dollar input that updates 300 ms after typing stops, and only with a value from 0 to 500. */
function CostInput({ label, value, fallback, tip, onChange }: {
  label: string; value: number | null; fallback: number | null; tip: { description: string | null; source: string | null } | undefined;
  onChange: (v: number | null) => void;
}) {
  const id = useId();
  const shown = value ?? fallback;
  const [text, setText] = useState(shown === null ? '' : String(shown));
  const [synced, setSynced] = useState(shown);
  if (synced !== shown) {          // follow the URL when it changes elsewhere (e.g. Reset)
    setSynced(shown);
    setText(shown === null ? '' : String(shown));
  }
  const n = Number(text);
  const valid = text.trim() !== '' && Number.isFinite(n) && n >= COST_LIMITS.min && n <= COST_LIMITS.max;
  useEffect(() => {
    if (!valid || Math.round(n * 100) / 100 === shown) return;
    const t = setTimeout(() => onChange(Math.round(n * 100) / 100 === fallback ? null : Math.round(n * 100) / 100), 300);
    return () => clearTimeout(t);
  }, [valid, n, shown, fallback, onChange]);

  return (
    <div>
      <div className="flex items-center gap-1.5">
        <label htmlFor={id} className="text-[12px] font-medium text-ink">{label}</label>
        <InfoTip label={`About ${label}`}>
          {tip?.description && <span className="mb-1 block">{tip.description}</span>}
          {tip?.source && <span className="block text-muted">Source: {tip.source}</span>}
        </InfoTip>
      </div>
      <div className="mt-1 flex h-8 items-center rounded-control border bg-surface px-2 focus-within:ring-2 focus-within:ring-teal">
        <span className="text-[13px] text-muted">$</span>
        <input id={id} type="number" inputMode="decimal" min={COST_LIMITS.min} max={COST_LIMITS.max} step={0.01} value={text}
          onChange={(e) => setText(e.target.value)} aria-invalid={!valid}
          className="num w-full bg-transparent px-1 text-right text-[13px] text-ink outline-none" />
        <span className="text-[11px] text-muted">/min</span>
      </div>
      {!valid && <p className="mt-0.5 text-[11px] text-critical">Enter {COST_LIMITS.min} to {COST_LIMITS.max} dollars.</p>}
    </div>
  );
}

/** The two cost assumptions behind net value, editable; defaults from gold_cost_assumptions (Airlines for America). */
export function CostsPanel({ costs, costDelay, costBuffer, onChange }: Props) {
  const row = (setting: string) => costs?.rows.find((r) => r.setting === setting);
  const changed = costDelay !== null || costBuffer !== null;
  return (
    <Card
      title="Costs"
      aside={
        <button type="button" disabled={!changed} onClick={() => onChange({ costDelay: null, costBuffer: null })}
          className="focus-ring rounded text-[12px] font-medium text-teal hover:underline disabled:cursor-default disabled:text-muted disabled:no-underline">
          Reset to A4A defaults
        </button>
      }
    >
      <div className="px-4 pb-4">
        {!costs ? <span className="skeleton block h-24" /> : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <CostInput label="Cost per delay minute" value={costDelay} fallback={costs.cost_delay_min_usd} tip={row(COST_SETTINGS.delay) ?? undefined}
                onChange={(v) => onChange({ costDelay: v })} />
              <CostInput label="Cost per buffer minute" value={costBuffer} fallback={costs.cost_buffer_min_usd} tip={row(COST_SETTINGS.buffer) ?? undefined}
                onChange={(v) => onChange({ costBuffer: v })} />
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-muted">
              {NET_VALUE_HELP} Defaults: {formatUsd(costs.cost_delay_min_usd, false)} per delay minute and {formatUsd(costs.cost_buffer_min_usd, false)} per
              buffer minute (Airlines for America, 2025). Net value and break-even update as you type.
            </p>
          </>
        )}
      </div>
    </Card>
  );
}
