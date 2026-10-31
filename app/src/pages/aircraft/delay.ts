import { formatNumber } from '../../lib/format';

/** Colour for an actual delay: green when on time or early (under 15 min), amber at 15+, red at 60+. */
export function delayTone(minutes: number | null): string {
  if (minutes === null) return 'bg-bg text-muted';
  if (minutes >= 60) return 'bg-critical-soft text-critical';
  if (minutes >= 15) return 'bg-warning-soft text-warning';
  return 'bg-success-soft text-success';
}

/** "+87 min", "−23 min", "–" when unknown */
export const formatDelay = (minutes: number | null) =>
  minutes === null ? '–' : `${minutes > 0 ? '+' : minutes < 0 ? '−' : ''}${formatNumber(Math.abs(minutes))} min`;
