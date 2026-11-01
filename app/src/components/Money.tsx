import clsx from 'clsx';
import { formatUsd } from '../lib/format';
import { NEGATIVE_HELP } from '../../shared/kpis';

/**
 * A dollar amount. Negative amounts are real results (the buffer costs more than the delay it prevents), so they are
 * shown in full, in red, with the explanation on hover; never hidden or clipped.
 */
export function Money({ value, compact = true, className }: { value: number | null | undefined; compact?: boolean; className?: string }) {
  const negative = typeof value === 'number' && value < 0;
  return (
    <span className={clsx('num', negative && 'text-critical', className)} title={negative ? NEGATIVE_HELP : undefined}>
      {formatUsd(value, compact)}
    </span>
  );
}
