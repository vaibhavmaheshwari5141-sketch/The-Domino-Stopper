import clsx from 'clsx';
import { AirportSelect } from '../../components/AirportSelect';
import { SegmentedControl } from '../../components/SegmentedControl';
import type { PlannerAirport } from '../../lib/api';
import { formatMonthShort } from '../../lib/format';
import { MONTHS, PERIOD, type RiskState } from './useRiskState';

interface Props {
  state: RiskState;
  update: (patch: Partial<RiskState>) => void;
  airports: PlannerAirport[] | undefined;
}

const dateInput = 'focus-ring num h-8 rounded-control border bg-surface px-2 text-[12px] text-ink';

export function RiskControls({ state, update, airports }: Props) {
  const whole = state.start === PERIOD.start && state.end === PERIOD.end;
  const chip = (active: boolean) => clsx(
    'focus-ring h-7 rounded-full border px-2.5 text-[12px]',
    active ? 'border-navy bg-navy font-medium text-white' : 'bg-surface text-muted hover:text-ink',
  );

  return (
    // -mt-5 / top-[-20px] cancel the content area padding, so the bar sits flush under the top bar while scrolling
    <div className="sticky top-[-20px] z-30 -mx-5 -mt-5 border-b bg-bg px-5 pb-3 pt-4">
      <p className="mb-3 text-[13px] text-muted">
        Delay risk predicted from the timetable, by airport, hour and ground time, and how well the forecast matches reality.
      </p>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5">
        <div className="flex items-center gap-1.5">
          <label htmlFor="risk-start" className="text-[13px] text-muted">From</label>
          <input id="risk-start" type="date" className={dateInput} min={PERIOD.start} max={state.end} value={state.start}
            onChange={(e) => e.target.value && update({ start: e.target.value })} />
          <label htmlFor="risk-end" className="text-[13px] text-muted">to</label>
          <input id="risk-end" type="date" className={dateInput} min={state.start} max={PERIOD.end} value={state.end}
            onChange={(e) => e.target.value && update({ end: e.target.value })} />
        </div>
        <AirportSelect value={state.airport} airports={airports} onChange={(airport) => update({ airport })} />
        <div className="flex items-center gap-2">
          <span className="text-[13px] text-muted">Heatmap shows</span>
          <SegmentedControl label="Heatmap metric" value={state.metric} onChange={(metric) => update({ metric })}
            options={[{ value: 'p_late15', label: 'Late chance' }, { value: 'pred_inbound_delay_min', label: 'Predicted inbound delay' }]} />
        </div>
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-1" role="group" aria-label="Quick date ranges">
        <button type="button" aria-pressed={whole} onClick={() => update({ ...PERIOD })} className={chip(whole)}>Jan–Aug 2026</button>
        {MONTHS.map((m) => {
          const active = state.start === m.start && state.end === m.end;
          return (
            <button key={m.key} type="button" aria-pressed={active} onClick={() => update({ start: m.start, end: m.end })} className={chip(active)}>
              {formatMonthShort(m.key)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
