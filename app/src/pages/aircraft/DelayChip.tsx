import clsx from 'clsx';
import { delayTone, formatDelay } from './delay';

export function DelayChip({ label, minutes }: { label?: string; minutes: number | null }) {
  return (
    <span className={clsx('num inline-flex items-center gap-1 whitespace-nowrap rounded-full px-1.5 py-px text-[11px] font-semibold', delayTone(minutes))}>
      {label && <span className="font-normal opacity-80">{label}</span>}
      {formatDelay(minutes)}
    </span>
  );
}
