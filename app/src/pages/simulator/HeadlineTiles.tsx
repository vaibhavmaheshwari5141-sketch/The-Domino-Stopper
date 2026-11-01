import clsx from 'clsx';
import type { ReactNode } from 'react';
import { Money } from '../../components/Money';
import { InfoTip } from '../../components/Tooltip';
import type { EngineKpiRow, NetValueRow } from '../../lib/api';
import { formatNumber, formatPercent, formatPp, formatUsd } from '../../lib/format';
import { EVALUATOR_LABEL, type EvaluatorChoice, MAIN_KPI_HELP, NEGATIVE_HELP, NET_VALUE_HELP, VIEW_HELP } from '../../../shared/kpis';
import { REALLOCATE, strategyDef } from '../../../shared/simulator';
import { viewRow } from './strategies';

function Tile({ label, value, sub, tip, hero }: { label: string; value: ReactNode; sub: ReactNode; tip: ReactNode; hero?: boolean }) {
  return (
    <div className={clsx('flex min-w-0 flex-col rounded-card border bg-surface px-4 py-3', hero && 'border-amber')}>
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-medium leading-tight text-muted">{label}</span>
        <InfoTip label={`About ${label}`} align="right">{tip}</InfoTip>
      </div>
      <span className={clsx('num mt-1 whitespace-nowrap text-[22px] font-semibold leading-tight', hero ? 'text-amber' : 'text-ink')}>{value}</span>
      <span className="mt-0.5 text-[12px] leading-snug text-muted">{sub}</span>
    </div>
  );
}

const Small = ({ children }: { children: ReactNode }) => <span className="text-[14px] font-normal text-muted">{children}</span>;

/** Both views as "curve – model", or the chosen one; always says which. */
function Views({ evaluator, curve, model, sep = ' – ' }: { evaluator: EvaluatorChoice; curve: ReactNode; model: ReactNode; sep?: string }) {
  if (evaluator === 'curve') return <>{curve}</>;
  if (evaluator === 'response model') return <>{model}</>;
  return <>{curve}<Small>{sep}</Small>{model}</>;
}

const viewName = (e: EvaluatorChoice) => (e === 'both' ? 'curve view – model view' : EVALUATOR_LABEL[e].toLowerCase());

interface Props {
  rows: EngineKpiRow[] | undefined;
  net: NetValueRow[] | undefined;
  strategy: string;
  evaluator: EvaluatorChoice;
  costBuffer: number | null | undefined;
}

/** Headline figures for the Engine (or the reallocating Engine) at the selected budget and day type. */
export function HeadlineTiles({ rows, net, strategy, evaluator, costBuffer }: Props) {
  if (!rows) {
    return <div className="grid grid-cols-2 gap-3 wide:grid-cols-4">{Array.from({ length: 4 }, (_, i) => <span key={i} className="skeleton block h-[92px] rounded-card" />)}</div>;
  }
  const curve = viewRow(rows, strategy, 'curve');
  const model = viewRow(rows, strategy, 'response model');
  const netCurve = viewRow(net, strategy, 'curve');
  const netModel = viewRow(net, strategy, 'response model');
  const label = strategyDef(strategy).label;
  const realloc = strategy === REALLOCATE;
  const robustness = curve?.robustness_worst_case_share ?? model?.robustness_worst_case_share ?? null;
  const breakEven = (r: NetValueRow | undefined) => formatUsd(r?.break_even_buffer_cost_usd, false);

  return (
    <div className="grid grid-cols-2 gap-3 wide:grid-cols-4">
      <Tile hero label="Delay prevented per 100 buffer min"
        value={<Views evaluator={evaluator} curve={formatNumber(curve?.prevented_per_100, 1)} model={formatNumber(model?.prevented_per_100, 1)} />}
        sub={<>{label} · {viewName(evaluator)}{realloc ? ' · per 100 min moved' : ''}</>}
        tip={<><span className="mb-1 block font-semibold">{MAIN_KPI_HELP}</span><span className="mb-1 block">{VIEW_HELP.curve}</span><span className="mb-1 block">{VIEW_HELP.model}</span><span className="block">{VIEW_HELP.range}</span></>} />
      <Tile label="On-time departures"
        value={<Views evaluator={evaluator} sep=" to " curve={formatPp(curve?.otp_change_pp)} model={formatPp(model?.otp_change_pp)} />}
        sub={`change in departures under 15 min late · ${viewName(evaluator)}`}
        tip="Percentage-point change in the share of departures that leave less than 15 minutes late, from the buffer, across the aircraft's whole day." />
      <Tile label="Net value"
        value={<Views evaluator={evaluator} sep=" to " curve={<Money value={netCurve?.net_value_usd} />} model={<Money value={netModel?.net_value_usd} />} />}
        sub={realloc ? 'no buffer added, so no buffer cost'
          : <>break-even <Views evaluator={evaluator} curve={breakEven(netCurve)} model={breakEven(netModel)} /> per buffer min (cost {formatUsd(costBuffer, false)})</>}
        tip={<><span className="mb-1 block">{NET_VALUE_HELP}</span><span className="mb-1 block">{NEGATIVE_HELP}</span><span className="block">Adding buffer pays only when a buffer minute costs less than the break-even. Change the costs in the Costs panel.</span></>} />
      <Tile label="Robustness"
        value={robustness === null ? <Small>n/a</Small> : formatPercent(robustness, 0)}
        sub={robustness === null ? 'not computed here: only at the main budget, all days, and not for reallocation or hindsight' : 'worst-case share of the best strategy, across both views'}
        tip="In each view, the strategy's result divided by the best real strategy's; robustness is the lower of the two. A strategy that wins in one view and loses in the other scores low." />
    </div>
  );
}
