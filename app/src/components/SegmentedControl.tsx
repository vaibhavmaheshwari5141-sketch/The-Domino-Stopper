import clsx from 'clsx';
import type { ReactNode } from 'react';

interface Props<T extends string | number> {
  label: string;
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange: (value: T) => void;
}

/** One choice from a few options, shown side by side (a radio group). */
export function SegmentedControl<T extends string | number>({ label, value, options, onChange }: Props<T>) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-control border bg-surface p-0.5">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={clsx(
              'focus-ring h-7 whitespace-nowrap rounded-[4px] px-2.5 text-[13px]',
              active ? 'bg-navy font-medium text-white' : 'text-muted hover:bg-bg hover:text-ink',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
