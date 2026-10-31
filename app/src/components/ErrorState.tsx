import { AlertTriangle, RotateCw } from 'lucide-react';

interface Props {
  title?: string;
  error: unknown;
  onRetry: () => void;
  retrying?: boolean;
}

/** Inline message for a failed request, with a Retry button. */
export function ErrorState({ title = 'Could not load the data', error, onRetry, retrying = false }: Props) {
  const detail = error instanceof Error ? error.message : 'Unknown error';
  return (
    <div role="alert" className="flex items-start gap-3 rounded-card border bg-surface p-4">
      <AlertTriangle size={18} className="mt-0.5 shrink-0 text-critical" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-ink">{title}</p>
        <p className="mt-0.5 text-sm text-muted">{detail}</p>
      </div>
      <button
        type="button"
        onClick={onRetry}
        disabled={retrying}
        className="focus-ring inline-flex h-8 shrink-0 items-center gap-1.5 rounded-control border px-3 text-sm font-medium text-ink hover:bg-bg disabled:opacity-60"
      >
        <RotateCw size={14} className={retrying ? 'animate-spin' : undefined} aria-hidden="true" />
        Retry
      </button>
    </div>
  );
}
