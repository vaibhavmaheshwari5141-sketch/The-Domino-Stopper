import clsx from 'clsx';
import type { AirportImpact, ImpactBand } from '../../lib/api';

const BAND_DOT: Record<ImpactBand, string> = { High: 'bg-critical', Medium: 'bg-warning', Low: 'bg-success' };

interface Props {
  airports: AirportImpact[];          // the airports on the map, any order
  active: string | null;
  sizeLabel: string;
  sizeValue: (a: AirportImpact) => string;
  onHover: (a: AirportImpact | null) => void;
  onSelect: (a: AirportImpact) => void;
}

/** The airports on the map, most impacted first. Hover shows the airport's card; click zooms to it. */
export function AirportRanking({ airports, active, sizeLabel, sizeValue, onHover, onSelect }: Props) {
  const ranked = [...airports].sort((a, b) => (a.impact_rank ?? Infinity) - (b.impact_rank ?? Infinity));
  return (
    <div className="flex min-h-0 flex-col rounded-control border">
      <div className="grid grid-cols-[2rem_1fr_auto_2.5rem] gap-2 border-b bg-bg px-2 py-1.5 text-[10px]">
        <span className="label !text-[10px]">#</span>
        <span className="label !text-[10px]">Airport</span>
        <span className="label truncate !text-[10px]">{sizeLabel === 'Impact score' ? '' : sizeLabel}</span>
        <span className="label text-right !text-[10px]">Score</span>
      </div>
      <ul className="min-h-0 flex-1 overflow-y-auto" onMouseLeave={() => onHover(null)}>
        {ranked.map((a) => (
          <li key={a.airport}>
            <button
              type="button"
              onMouseEnter={() => onHover(a)}
              onFocus={() => onHover(a)}
              onBlur={() => onHover(null)}
              onClick={() => onSelect(a)}
              className={clsx(
                'focus-ring grid w-full grid-cols-[2rem_1fr_auto_2.5rem] items-center gap-2 px-2 py-1 text-left text-[12px]',
                active === a.airport ? 'bg-bg' : 'hover:bg-bg',
              )}
            >
              <span className="num text-muted">{a.impact_rank ?? '–'}</span>
              <span className="flex min-w-0 items-center gap-1.5">
                <span className={clsx('h-2 w-2 shrink-0 rounded-full', a.impact_band ? BAND_DOT[a.impact_band] : 'bg-line')} aria-hidden="true" />
                <span className="num font-semibold text-ink">{a.airport}</span>
                <span className="truncate text-muted">{a.city}</span>
              </span>
              <span className="num text-right text-muted">{sizeLabel === 'Impact score' ? '' : sizeValue(a)}</span>
              <span className="num text-right font-semibold text-ink">{a.impact_score ?? '–'}</span>
            </button>
          </li>
        ))}
        {ranked.length === 0 && <li className="px-2 py-6 text-center text-[12px] text-muted">No airports match the filters.</li>}
      </ul>
    </div>
  );
}
