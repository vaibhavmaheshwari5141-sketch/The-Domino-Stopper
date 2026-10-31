import clsx from 'clsx';
import { RISK_CHIP } from '../config/risk';

/** Risk band from the prediction engine: High / Medium / Low. */
export function RiskChip({ band, className }: { band: string | null; className?: string }) {
  if (!band) return <span className="text-muted">–</span>;
  return (
    <span className={clsx('inline-flex items-center rounded-full px-2 py-px text-[11px] font-semibold', RISK_CHIP[band] ?? 'bg-bg text-muted', className)}>
      {band}
    </span>
  );
}

